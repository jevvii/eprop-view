-- Persist validated analysis atomically. Only server code can choose provenance
-- and rate budgets; ordinary API callers cannot impersonate the analysis service.
BEGIN;
ALTER TABLE public.ai_damage_detections DROP CONSTRAINT IF EXISTS ai_damage_detections_provenance_check;
ALTER TABLE public.ai_damage_detections ADD CONSTRAINT ai_damage_detections_provenance_check
  CHECK(provenance IN ('model','heuristic','synthetic','legacy_synthetic','gemini','engineer'));
ALTER TABLE public.inspection_images ADD COLUMN IF NOT EXISTS source_anchor_id uuid REFERENCES public.ar_anchors(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inspection_images_source_anchor_unique ON public.inspection_images(source_anchor_id);

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
    WHERE image_id=p_image_id AND provenance=p_provenance AND verified_by IS NULL;
  RETURN QUERY INSERT INTO public.ai_damage_detections
    (image_id,model_id,damage_type,severity,severity_score,confidence,bbox,notes,provenance,
     crack_width_mm,crack_width_band,crack_orientation,crack_pattern,crack_cause,aci_reference)
  SELECT p_image_id,x.model_id,x.damage_type,x.severity,x.severity_score,x.confidence,x.bbox,x.notes,p_provenance,
    NULL,NULL,x.crack_orientation,x.crack_pattern,x.crack_cause,NULL
  FROM jsonb_to_recordset(p_rows) AS x(model_id uuid,damage_type text,severity text,severity_score double precision,
    confidence double precision,bbox jsonb,notes text,crack_orientation text,crack_pattern text,crack_cause text)
  RETURNING *;
  PERFORM public.recompute_inspection_damage_risk(image_inspection);
END $$;
REVOKE ALL ON FUNCTION public.replace_image_detections(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_image_detections(uuid,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text,integer,integer) TO service_role;
COMMIT;
