BEGIN;

UPDATE public.ai_models SET labels=ARRAY['crack','corrosion','spalling']
  WHERE format='heuristic' AND name='Edge-Gradient Heuristic';

-- Preview seed examples have their own provenance in reports and estimates.
ALTER TABLE public.cost_estimates DROP CONSTRAINT cost_provenance_check,
  ADD CONSTRAINT cost_provenance_check CHECK (provenance IN ('table','gemini','engineer','synthetic'));
ALTER TABLE public.recommendations DROP CONSTRAINT recommendations_provenance_check,
  ADD CONSTRAINT recommendations_provenance_check CHECK (provenance IN ('gemini','heuristic','engineer','synthetic'));

ALTER TABLE public.ai_analysis_jobs ADD COLUMN method text NOT NULL DEFAULT 'heuristic'
  CHECK (method IN ('gemini','heuristic'));

ALTER TABLE public.ai_damage_detections ADD COLUMN is_rejected boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.recompute_inspection_damage_risk(p_inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE parent public.inspections; score double precision;
BEGIN
  SELECT * INTO parent FROM public.inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND (public.get_my_role() IS NULL OR NOT (
    public.get_my_role() IN ('engineer','admin') OR
    (public.get_my_role() = 'inspector' AND parent.lead_inspector_id IS NOT DISTINCT FROM auth.uid())
  )) THEN RAISE EXCEPTION 'Access denied to inspection risk' USING ERRCODE = '42501'; END IF;
  SELECT least(10, round((COALESCE(max(d.severity_score), 0)::numeric / 100) * 10 * 1.2, 1)) INTO score
    FROM public.ai_damage_detections d JOIN public.inspection_images im ON im.id = d.image_id
    WHERE im.inspection_id = p_inspection_id AND NOT d.is_rejected AND d.damage_type <> 'none' AND d.provenance NOT IN ('synthetic','legacy_synthetic');
  UPDATE public.inspections SET risk_score = score,
    risk_level = CASE WHEN score >= 8 THEN 'critical' WHEN score >= 6 THEN 'high' WHEN score >= 4 THEN 'moderate' ELSE 'low' END,
    updated_at = now() WHERE id = p_inspection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.filter_workspace_records(p_scope text,p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(id uuid) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public
AS $$
BEGIN
 IF public.get_my_role() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_scope NOT IN ('inspections','reports','maintenance','hotspots') THEN RAISE EXCEPTION 'Invalid filter scope'; END IF;
 RETURN QUERY
 WITH base AS (
   SELECT i.id,i.project_id,i.id AS inspection_id,i.status,i.risk_score,i.inspection_date AS day,i.location||' '||coalesce(i.notes,'') AS search
     FROM inspections i WHERE p_scope='inspections'
   UNION ALL SELECT r.id,r.project_id,r.inspection_id,r.status,r.risk_score,r.date,r.title||' '||r.location||' '||coalesce(r.key_findings,'') FROM reports r WHERE p_scope='reports'
   UNION ALL SELECT m.id,m.project_id,NULL::uuid,m.status,m.risk_score,m.created_at::date,m.title||' '||m.location||' '||coalesce(m.notes,'') FROM maintenance_priorities m WHERE p_scope='maintenance'
   UNION ALL SELECT h.id,h.project_id,NULL::uuid,'all',CASE h.severity WHEN 'critical' THEN 9 WHEN 'high' THEN 7 WHEN 'moderate' THEN 5 ELSE 2 END,h.created_at::date,h.title||' '||coalesce(h.description,'') FROM risk_hotspots h WHERE p_scope='hotspots'
 )
 SELECT b.id FROM base b WHERE
  (coalesce(p_filters->>'q','')='' OR b.search ILIKE '%'||(p_filters->>'q')||'%')
  AND (coalesce(p_filters->>'status','all')='all' OR b.status=p_filters->>'status')
  AND (coalesce(p_filters->>'risk','all')='all' OR (CASE WHEN b.risk_score>=8 THEN 'critical' WHEN b.risk_score>=6 THEN 'high' WHEN b.risk_score>=4 THEN 'moderate' ELSE 'low' END)=p_filters->>'risk')
  AND (coalesce(p_filters->>'from','')='' OR b.day >= (p_filters->>'from')::date)
  AND (coalesce(p_filters->>'to','')='' OR b.day <= (p_filters->>'to')::date)
  AND (NOT EXISTS(SELECT FROM jsonb_each_text(p_filters) f WHERE f.key IN ('building','floor','element','severity','damage','crack','verification') AND f.value NOT IN ('','all'))
    OR EXISTS (
      SELECT FROM inspections i WHERE i.project_id=b.project_id AND (b.inspection_id IS NULL OR i.id=b.inspection_id)
      AND (coalesce(p_filters->>'building','')='' OR i.building_id=(p_filters->>'building')::uuid)
      AND (coalesce(p_filters->>'floor','')='' OR i.floor_id=(p_filters->>'floor')::uuid)
      AND (coalesce(p_filters->>'element','')='' OR i.structural_element_id=(p_filters->>'element')::uuid)
      AND (NOT EXISTS(SELECT FROM jsonb_each_text(p_filters) f WHERE f.key IN ('severity','damage','crack','verification') AND f.value NOT IN ('','all'))
        OR EXISTS(SELECT FROM inspection_images im JOIN ai_damage_detections d ON d.image_id=im.id WHERE im.inspection_id=i.id
          AND NOT d.is_rejected AND d.provenance NOT IN ('synthetic','legacy_synthetic')
          AND (coalesce(p_filters->>'severity','all')='all' OR d.severity=p_filters->>'severity')
          AND (coalesce(p_filters->>'damage','all')='all' OR d.damage_type=p_filters->>'damage')
          AND (coalesce(p_filters->>'crack','all')='all' OR d.crack_width_band=p_filters->>'crack')
          AND (coalesce(p_filters->>'verification','all')='all' OR (p_filters->>'verification'='verified' AND d.verified_by IS NOT NULL) OR (p_filters->>'verification'='unverified' AND d.verified_by IS NULL))
        ))
    )) ORDER BY b.id;
END $$;

-- Only the exact decision recorded by the previous review button is backfilled.
UPDATE public.ai_damage_detections SET is_rejected=true
  WHERE verified_by IS NULL AND notes='Rejected: Marked as false positive.';

CREATE OR REPLACE FUNCTION public.replace_image_detections(
  p_image_id uuid,p_actor_id uuid,p_provenance text,p_rows jsonb
) RETURNS SETOF public.ai_damage_detections
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions
AS $$
DECLARE actor_role text; owner_id uuid; image_inspection uuid;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id=p_actor_id AND is_active;
  SELECT i.lead_inspector_id,i.id INTO owner_id,image_inspection
    FROM public.inspection_images im JOIN public.inspections i ON i.id=im.inspection_id WHERE im.id=p_image_id FOR UPDATE OF im;
  IF actor_role IS NULL OR actor_role NOT IN ('admin','engineer','inspector') OR image_inspection IS NULL
    OR (actor_role='inspector' AND owner_id IS DISTINCT FROM p_actor_id) THEN
    RAISE EXCEPTION 'Analysis access denied' USING ERRCODE='42501';
  END IF;
  IF p_provenance NOT IN ('heuristic','gemini') OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>100 THEN
    RAISE EXCEPTION 'Invalid analysis payload';
  END IF;
  -- A failed insert rolls the deletion back. Confirmed engineer findings remain.
  DELETE FROM public.ai_damage_detections
    WHERE image_id=p_image_id AND provenance=p_provenance AND verified_by IS NULL AND NOT is_rejected;
  RETURN QUERY INSERT INTO public.ai_damage_detections
    (image_id,model_id,damage_type,severity,severity_score,confidence,bbox,notes,provenance,
     crack_width_mm,crack_width_band,crack_orientation,crack_pattern,crack_cause,aci_reference)
  SELECT p_image_id,x.model_id,x.damage_type,x.severity,x.severity_score,x.confidence,x.bbox,x.notes,p_provenance,
    NULL,NULL,x.crack_orientation,x.crack_pattern,x.crack_cause,NULL
  FROM jsonb_to_recordset(p_rows) AS x(model_id uuid,damage_type text,severity text,severity_score double precision,
    confidence double precision,bbox jsonb,notes text,crack_orientation text,crack_pattern text,crack_cause text)
  WHERE NOT EXISTS (
    SELECT FROM public.ai_damage_detections reviewed WHERE reviewed.image_id=p_image_id
      AND reviewed.provenance=p_provenance AND (reviewed.is_rejected OR reviewed.verified_by IS NOT NULL)
      AND reviewed.damage_type=x.damage_type AND reviewed.bbox IS NOT DISTINCT FROM x.bbox
  )
  RETURNING *;
  PERFORM public.recompute_inspection_damage_risk(image_inspection);
END $$;

-- Approval and the associated maintenance ticket must succeed together.
ALTER TABLE public.maintenance_priorities ADD COLUMN source_detection_id uuid UNIQUE
  REFERENCES public.ai_damage_detections(id) ON DELETE SET NULL;
-- Link the oldest matching legacy ticket and preserve every existing maintenance record.
WITH previous AS (
  SELECT DISTINCT ON (d.id) d.id AS detection_id, m.id AS ticket_id
    FROM maintenance_priorities m JOIN ai_damage_detections d
      ON m.notes LIKE 'Automated priority from verified AI detection (' || d.id::text || ').%'
    ORDER BY d.id, m.created_at, m.id
)
UPDATE maintenance_priorities m SET source_detection_id=p.detection_id FROM previous p WHERE m.id=p.ticket_id;

CREATE FUNCTION public.create_verified_detection_priority() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.verified_by IS NOT NULL AND NOT NEW.is_rejected AND NEW.severity IN ('high','critical')
     AND NEW.damage_type <> 'none' AND NEW.provenance NOT IN ('synthetic','legacy_synthetic') THEN
    INSERT INTO maintenance_priorities(source_detection_id,project_id,title,location,risk_score,due_date,notes)
      SELECT NEW.id,i.project_id,'AI Defect: ' || upper(NEW.damage_type) || ' (' || upper(NEW.severity) || ')',
        coalesce(nullif(i.location,''),nullif(im.caption,''),'Structural Asset'),
        least(10,greatest(1,NEW.severity_score/10)), current_date + CASE WHEN NEW.severity='critical' THEN 7 ELSE 14 END,
        'Automated priority from verified AI detection (' || NEW.id::text || '). ' || coalesce(NEW.notes,'')
      FROM inspection_images im JOIN inspections i ON i.id=im.inspection_id WHERE im.id=NEW.image_id
      ON CONFLICT (source_detection_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER detection_approval_priority AFTER UPDATE OF verified_by,severity_score,damage_type ON public.ai_damage_detections
  FOR EACH ROW EXECUTE FUNCTION public.create_verified_detection_priority();

-- Persist the findings, inspection risk and completed run in one transaction.
-- A completed run with zero findings still has a durable history entry.
CREATE FUNCTION public.commit_image_analysis(
  p_image_id uuid, p_actor_id uuid, p_provenance text, p_model_id uuid, p_rows jsonb, p_job_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE job public.ai_analysis_jobs; findings jsonb;
BEGIN
  -- Sibling images share a parent risk aggregate. Serialize their commits before reading detections.
  PERFORM i.id FROM inspections i JOIN inspection_images im ON im.inspection_id=i.id
    WHERE im.id=p_image_id FOR UPDATE OF i;
  IF p_job_id IS NOT NULL THEN
    SELECT * INTO STRICT job FROM ai_analysis_jobs
      WHERE id=p_job_id AND image_id=p_image_id AND model_id=p_model_id AND method=p_provenance FOR UPDATE;
    IF job.status <> 'running' OR EXISTS (
      SELECT 1 FROM ai_analysis_jobs newer WHERE newer.image_id=p_image_id AND newer.method=p_provenance
        AND newer.status IN ('running','completed') AND (newer.created_at,newer.id) > (job.created_at,job.id)
    ) THEN RAISE EXCEPTION 'A newer analysis has superseded this run'; END IF;
  END IF;

  SELECT coalesce(jsonb_agg(d),'[]'::jsonb) INTO findings
    FROM replace_image_detections(p_image_id,p_actor_id,p_provenance,p_rows) d;
  IF p_job_id IS NULL THEN
    INSERT INTO ai_analysis_jobs(image_id, model_id, method, status, started_at, completed_at)
      VALUES(p_image_id,p_model_id,p_provenance,'completed',now(),now()) RETURNING * INTO job;
  ELSE
    UPDATE ai_analysis_jobs SET status='completed', completed_at=now() WHERE id=p_job_id RETURNING * INTO job;
  END IF;
  UPDATE ai_analysis_jobs SET status='failed', completed_at=now(), error_message='Superseded by a completed analysis.'
    WHERE image_id=p_image_id AND method=p_provenance AND status IN ('pending','running')
      AND (created_at,id) < (job.created_at,job.id);
  RETURN jsonb_build_object('job',to_jsonb(job),'detections',findings);
END $$;
REVOKE ALL ON FUNCTION public.commit_image_analysis(uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_image_analysis(uuid,uuid,text,uuid,jsonb,uuid) TO service_role;

-- Service actions check identity before starting jobs. The commit RPC rechecks
-- assignment through replace_image_detections before replacing any evidence.
DROP POLICY IF EXISTS ai_jobs_modify_policy ON public.ai_analysis_jobs;
DROP POLICY IF EXISTS ai_detections_insert_policy ON public.ai_damage_detections;

-- Each annotator may refresh their own untouched candidates. Timestamps also
-- protect edits to notes, measurements or severity that retain heuristic provenance.
ALTER TABLE public.inspection_images ADD COLUMN annotation_suggested_at timestamptz;

CREATE FUNCTION public.replace_annotation_candidates(p_image_id uuid, p_rows jsonb, p_first_visit boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); actor_role text := get_my_role(); n integer;
BEGIN
  IF actor IS NULL OR actor_role IS NULL OR actor_role NOT IN ('inspector','engineer','admin') OR NOT EXISTS (
    SELECT 1 FROM inspection_images WHERE id=p_image_id AND (actor_role <> 'inspector' OR uploader_id=actor)
  ) THEN RAISE EXCEPTION 'Annotation access denied' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>100 THEN
    RAISE EXCEPTION 'Invalid candidate list';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_image_id::text,0));
  IF p_first_visit AND (EXISTS (SELECT FROM inspection_images WHERE id=p_image_id AND annotation_suggested_at IS NOT NULL)
    OR EXISTS (SELECT FROM image_annotations WHERE image_id=p_image_id)) THEN RETURN 0; END IF;
  DELETE FROM image_annotations a WHERE image_id=p_image_id AND created_by=actor AND source='heuristic'
    AND status='draft' AND updated_at=created_at AND NOT EXISTS (
      SELECT FROM jsonb_to_recordset(p_rows) x(bbox jsonb,damage_type text,severity text,source_confidence numeric)
      WHERE x.bbox=a.bbox AND x.damage_type=a.damage_type AND x.severity=a.severity AND x.source_confidence=a.source_confidence
    );
  INSERT INTO image_annotations(image_id,damage_type,severity,severity_score,geometry_kind,bbox,source,source_confidence,created_by)
    SELECT p_image_id,x.damage_type,x.severity,x.severity_score,'box',x.bbox,'heuristic',x.source_confidence,actor
    FROM jsonb_to_recordset(p_rows) AS x(damage_type text,severity text,severity_score numeric,bbox jsonb,source_confidence numeric)
    WHERE NOT EXISTS (SELECT FROM image_annotations a WHERE a.image_id=p_image_id AND
      ((a.bbox=x.bbox AND a.damage_type=x.damage_type) OR
       (a.original_geometry->'bbox'=x.bbox AND a.original_geometry->>'damage_type'=x.damage_type)));
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE inspection_images SET annotation_suggested_at=now() WHERE id=p_image_id;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.replace_annotation_candidates(uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_annotation_candidates(uuid,jsonb,boolean) TO authenticated;

COMMIT;
