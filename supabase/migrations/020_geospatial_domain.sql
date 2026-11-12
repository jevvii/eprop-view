-- Accurate site geometry, traceable domain weighting and field-data integration.
-- ST_Distance(geography) returns metres to the full geometry, not its vertices.
-- ST_Covers includes polygon boundaries and correctly excludes interior holes.
BEGIN;

ALTER TABLE public.geospatial_zones DROP CONSTRAINT IF EXISTS geospatial_zones_zone_type_check;
ALTER TABLE public.geospatial_zones ADD CONSTRAINT geospatial_zones_zone_type_check
  CHECK (zone_type IN ('fault_line','liquefaction','erosion','flood','general','landslide'));

CREATE OR REPLACE FUNCTION public.project_hazard_context(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  site public.projects;
  zones jsonb;
  observed text;
BEGIN
  IF public.get_my_role() NOT IN ('inspector','engineer','admin') OR public.get_my_role() IS NULL THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO site FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project is unavailable for this account'; END IF;
  IF site.geom IS NULL OR ST_IsEmpty(site.geom) THEN
    RAISE EXCEPTION 'Record the actual project coordinates before assessing mapped hazards' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', z.id, 'name', z.name, 'zone_type', z.zone_type, 'risk_level', z.risk_level,
    'is_active', z.is_active,
    'covers_site', CASE WHEN GeometryType(z.geom) IN ('POLYGON','MULTIPOLYGON') THEN ST_Covers(z.geom, site.geom) ELSE false END,
    'distance_m', CASE WHEN z.zone_type = 'fault_line' THEN ST_Distance(z.geom::geography, site.geom::geography) ELSE NULL END
  ) ORDER BY z.id), '[]'::jsonb) INTO zones
  FROM public.geospatial_zones z
  WHERE (z.project_id = site.id OR z.project_id IS NULL)
    AND z.is_active IS TRUE AND z.geom IS NOT NULL AND NOT ST_IsEmpty(z.geom)
    AND ST_IsValid(z.geom)
    AND (z.effective_date IS NULL OR z.effective_date <= CURRENT_DATE)
    AND (z.expiry_date IS NULL OR z.expiry_date >= CURRENT_DATE);
  SELECT i.erosion_condition INTO observed FROM public.inspections i
  WHERE i.project_id = site.id AND i.erosion_condition IS NOT NULL
  ORDER BY i.inspection_date DESC, i.updated_at DESC, i.id DESC LIMIT 1;
  RETURN jsonb_build_object('project_id', site.id, 'project_name', site.name,
    'latitude', ST_Y(site.geom), 'longitude', ST_X(site.geom), 'zones', zones,
    'observed_erosion', observed);
END;
$$;
REVOKE ALL ON FUNCTION public.project_hazard_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_hazard_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.settlement_overview(p_project_id uuid DEFAULT NULL)
RETURNS TABLE (building_id uuid, building_name text, project_id uuid, latitude double precision, longitude double precision,
  inspection_id uuid, observed_at timestamptz, classification text, tilt_mm_per_m numeric, differential_settlement_mm numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions
AS $$
  SELECT DISTINCT ON (b.id) b.id, b.name, b.project_id,
    COALESCE(b.latitude, ST_Y(p.geom)), COALESCE(b.longitude, ST_X(p.geom)),
    o.inspection_id, o.observed_at, o.classification, o.tilt_mm_per_m, o.differential_settlement_mm
  FROM public.settlement_observations o JOIN public.buildings b ON b.id = o.building_id
  JOIN public.projects p ON p.id = b.project_id
  WHERE (p_project_id IS NULL OR b.project_id = p_project_id)
    AND public.get_my_role() IN ('engineer','admin')
  ORDER BY b.id, o.observed_at DESC, o.id DESC;
$$;
REVOKE ALL ON FUNCTION public.settlement_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settlement_overview(uuid) TO authenticated;

-- Preserve the unweighted suggestion/engineer score for repeatable classification.
ALTER TABLE public.ai_damage_detections
  ADD COLUMN IF NOT EXISTS raw_severity_score numeric(6,2),
  ADD COLUMN IF NOT EXISTS severity_basis text;

CREATE OR REPLACE FUNCTION public.apply_crack_category_weight()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE factor numeric := 1;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.raw_severity_score := COALESCE(NEW.raw_severity_score, NEW.severity_score);
  ELSIF NEW.severity_score IS DISTINCT FROM OLD.severity_score
      AND NEW.raw_severity_score IS NOT DISTINCT FROM OLD.raw_severity_score THEN
    -- An explicit severity override becomes the new baseline; taxonomy-only
    -- edits retain the original baseline and cannot compound multipliers.
    NEW.raw_severity_score := NEW.severity_score;
  END IF;
  NEW.raw_severity_score := COALESCE(NEW.raw_severity_score, NEW.severity_score);
  IF NEW.raw_severity_score < 0 OR NEW.raw_severity_score > 100 THEN
    RAISE EXCEPTION 'Raw severity must be between 0 and 100';
  END IF;
  IF NEW.damage_type = 'crack' THEN
    factor := CASE NEW.crack_width_band WHEN 'fine' THEN 1.05 WHEN 'medium' THEN 1.15
      WHEN 'wide' THEN 1.25 WHEN 'severe' THEN 1.4 ELSE 1 END;
  END IF;
  NEW.severity_score := round(least(100, greatest(0, NEW.raw_severity_score * factor)));
  NEW.severity := CASE WHEN NEW.severity_score >= 80 THEN 'critical'
    WHEN NEW.severity_score >= 60 THEN 'high' WHEN NEW.severity_score >= 35 THEN 'medium' ELSE 'low' END;
  NEW.severity_basis := 'Project screening v1: raw ' || NEW.raw_severity_score || ' × crack-band factor ' || factor ||
    ', capped at 100. Width band is project-defined; ACI exposure guidance is recorded separately. Not a structural safety certification.';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ai_detection_crack_weight ON public.ai_damage_detections;
CREATE TRIGGER ai_detection_crack_weight BEFORE INSERT OR UPDATE OF severity_score, raw_severity_score, damage_type, crack_width_band
  ON public.ai_damage_detections FOR EACH ROW EXECUTE FUNCTION public.apply_crack_category_weight();

CREATE OR REPLACE FUNCTION public.recompute_inspection_damage_risk(p_inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE parent public.inspections; score double precision;
BEGIN
  SELECT * INTO parent FROM public.inspections WHERE id = p_inspection_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND (public.get_my_role() IS NULL OR NOT (
    public.get_my_role() IN ('engineer','admin') OR
    (public.get_my_role() = 'inspector' AND parent.lead_inspector_id IS NOT DISTINCT FROM auth.uid())
  )) THEN RAISE EXCEPTION 'Access denied to inspection risk' USING ERRCODE = '42501'; END IF;
  SELECT least(10, round((COALESCE(max(d.severity_score), 0)::numeric / 100) * 10 * 1.2, 1)) INTO score
    FROM public.ai_damage_detections d JOIN public.inspection_images im ON im.id = d.image_id
    WHERE im.inspection_id = p_inspection_id AND d.provenance NOT IN ('synthetic','legacy_synthetic');
  UPDATE public.inspections SET risk_score = score,
    risk_level = CASE WHEN score >= 8 THEN 'critical' WHEN score >= 6 THEN 'high' WHEN score >= 4 THEN 'moderate' ELSE 'low' END,
    updated_at = now() WHERE id = p_inspection_id;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_inspection_damage_risk(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_inspection_damage_risk(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.refresh_detection_parent_risk()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid; image uuid;
BEGIN
  image := CASE WHEN TG_OP = 'DELETE' THEN OLD.image_id ELSE NEW.image_id END;
  SELECT inspection_id INTO target FROM public.inspection_images WHERE id = image;
  IF target IS NOT NULL THEN PERFORM public.recompute_inspection_damage_risk(target); END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS ai_detection_parent_risk ON public.ai_damage_detections;
CREATE TRIGGER ai_detection_parent_risk AFTER INSERT OR UPDATE OR DELETE
  ON public.ai_damage_detections FOR EACH ROW EXECUTE FUNCTION public.refresh_detection_parent_risk();

-- A captured erosion observation changes the project summary in the same
-- transaction. Existing fault/liquefaction assessments are preserved; only the
-- erosion contribution is replaced. Saving a photograph never invents erosion.
CREATE OR REPLACE FUNCTION public.refresh_project_erosion_from_inspection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE observed text; mapped text; combined text; old_score double precision; new_score double precision; old_weight double precision; new_weight double precision;
BEGIN
  IF NEW.erosion_condition IS NULL THEN RETURN NEW; END IF;
  SELECT erosion_condition INTO observed FROM public.inspections
    WHERE project_id = NEW.project_id AND erosion_condition IS NOT NULL
    ORDER BY inspection_date DESC, updated_at DESC, id DESC LIMIT 1;
  observed := CASE observed WHEN 'severe' THEN 'severe' WHEN 'moderate' THEN 'moderate' WHEN 'minor' THEN 'low' ELSE 'negligible' END;
  SELECT CASE min(CASE z.risk_level WHEN 'zone_a' THEN 1 WHEN 'zone_b' THEN 2 ELSE 3 END)
    WHEN 1 THEN 'severe' WHEN 2 THEN 'moderate' WHEN 3 THEN 'low' ELSE 'negligible' END INTO mapped
    FROM public.geospatial_zones z JOIN public.projects p ON p.id = NEW.project_id
    WHERE (z.project_id = p.id OR z.project_id IS NULL) AND z.zone_type = 'erosion' AND z.is_active IS TRUE
      AND z.geom IS NOT NULL AND p.geom IS NOT NULL AND ST_IsValid(z.geom)
      AND GeometryType(z.geom) IN ('POLYGON','MULTIPOLYGON') AND ST_Covers(z.geom, p.geom)
      AND (z.effective_date IS NULL OR z.effective_date <= CURRENT_DATE)
      AND (z.expiry_date IS NULL OR z.expiry_date >= CURRENT_DATE);
  combined := CASE WHEN observed = 'severe' OR mapped = 'severe' THEN 'severe'
    WHEN observed = 'moderate' OR mapped = 'moderate' THEN 'moderate'
    WHEN observed = 'low' OR mapped = 'low' THEN 'low' ELSE 'negligible' END;
  SELECT overall_risk_score, CASE erosion_potential WHEN 'severe' THEN 9 WHEN 'moderate' THEN 6 WHEN 'low' THEN 3 ELSE 1 END * 0.15
    INTO old_score, old_weight FROM public.environmental_risks WHERE project_id = NEW.project_id FOR UPDATE;
  new_weight := (CASE combined WHEN 'severe' THEN 9 WHEN 'moderate' THEN 6 WHEN 'low' THEN 3 ELSE 1 END) * 0.15;
  IF FOUND THEN
    new_score := least(10, greatest(0, round((old_score - old_weight + new_weight)::numeric, 1)));
    UPDATE public.environmental_risks SET erosion_potential = combined, overall_risk_score = new_score,
      assessed_date = CURRENT_DATE, updated_at = now(),
      additional_analysis = COALESCE(additional_analysis, '') || E'\nErosion contribution refreshed from latest field observation (' || observed || ') and mapped membership (' || mapped || ').'
      WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inspection_erosion_summary ON public.inspections;
CREATE TRIGGER inspection_erosion_summary AFTER INSERT OR UPDATE OF erosion_condition, inspection_date
  ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.refresh_project_erosion_from_inspection();
COMMIT;
