-- =================================================================
-- Migration 026: project-trained crack detector (Preview extension)
--
-- Additive only. The November 18 scope contract reserved model training as out
-- of scope; the owner authorised this dated Preview extension, documented in
-- docs/scope_addendum_2026-11-18_preview_trained_detector.md.
--
-- The previous route is untouched: commit_image_analysis() and
-- replace_image_detections() keep their exact signatures and behaviour, so
-- turning the Preview flag off restores the heuristic path byte for byte.
-- =================================================================
BEGIN;

-- The job records the method that actually ran: the trained model, the
-- heuristic, or a deliberate Gemini analysis.
ALTER TABLE public.ai_analysis_jobs
  DROP CONSTRAINT IF EXISTS ai_analysis_jobs_method_check;
ALTER TABLE public.ai_analysis_jobs
  ADD CONSTRAINT ai_analysis_jobs_method_check
  CHECK (method IN ('gemini', 'heuristic', 'model'));

-- Artifact digest, per-method counts and any fallback reason. Kept as jsonb so
-- later provenance fields do not need a migration.
ALTER TABLE public.ai_analysis_jobs
  ADD COLUMN IF NOT EXISTS method_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Intersection-over-union for normalized jsonb boxes. Used only to stop a
-- reviewed finding from being re-proposed with a different box after a method
-- switch; exact-bbox matching alone cannot do that.
CREATE OR REPLACE FUNCTION public.bbox_iou(a jsonb, b jsonb)
RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public
AS $$
  WITH p AS (
    SELECT
      (a->>'x')::float8 AS ax, (a->>'y')::float8 AS ay,
      (a->>'width')::float8 AS aw, (a->>'height')::float8 AS ah,
      (b->>'x')::float8 AS bx, (b->>'y')::float8 AS by,
      (b->>'width')::float8 AS bw, (b->>'height')::float8 AS bh
  ), g AS (
    SELECT *,
      GREATEST(0::float8, LEAST(ax + aw, bx + bw) - GREATEST(ax, bx)) AS iw,
      GREATEST(0::float8, LEAST(ay + ah, by + bh) - GREATEST(ay, by)) AS ih
    FROM p
  )
  SELECT CASE
    WHEN a IS NULL OR b IS NULL THEN 0::float8
    WHEN aw * ah + bw * bh - iw * ih <= 0 THEN 0::float8
    ELSE (iw * ih) / (aw * ah + bw * bh - iw * ih)
  END
  FROM g;
$$;

-- Mixed-provenance commit.
--
-- One run may contain trained crack boxes (provenance 'model') and heuristic
-- corrosion/spalling boxes (provenance 'heuristic'). The newest local analysis
-- owns all *unreviewed* local evidence, so switching methods cannot leave stale
-- boxes behind; reviewed and rejected findings are never deleted. A re-proposed
-- box that duplicates a reviewed crack finding (IoU >= 0.5) is skipped, which
-- prevents duplicate crack evidence after a method switch.
CREATE OR REPLACE FUNCTION public.commit_image_analysis_v2(
  p_image_id uuid, p_actor_id uuid, p_method text, p_model_id uuid,
  p_rows jsonb, p_job_id uuid, p_method_detail jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  actor_role text;
  owner_id uuid;
  image_inspection uuid;
  job public.ai_analysis_jobs;
  findings jsonb;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = p_actor_id AND is_active;
  SELECT i.lead_inspector_id, i.id INTO owner_id, image_inspection
    FROM public.inspection_images im
    JOIN public.inspections i ON i.id = im.inspection_id
    WHERE im.id = p_image_id
    FOR UPDATE OF im;
  IF actor_role IS NULL OR actor_role NOT IN ('admin', 'engineer', 'inspector')
     OR image_inspection IS NULL
     OR (actor_role = 'inspector' AND owner_id IS DISTINCT FROM p_actor_id) THEN
    RAISE EXCEPTION 'Analysis access denied' USING ERRCODE = '42501';
  END IF;
  IF p_method NOT IN ('model', 'heuristic') THEN
    RAISE EXCEPTION 'Invalid analysis method';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Invalid analysis payload';
  END IF;
  IF jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'Analysis payload too large';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r
    WHERE r->>'provenance' NOT IN ('model', 'heuristic')
  ) THEN
    RAISE EXCEPTION 'Invalid detection provenance';
  END IF;

  -- Sibling images share a parent risk aggregate; serialize commits first.
  PERFORM i.id FROM public.inspections i
    JOIN public.inspection_images im ON im.inspection_id = i.id
    WHERE im.id = p_image_id
    FOR UPDATE OF i;

  IF p_job_id IS NOT NULL THEN
    SELECT * INTO STRICT job FROM ai_analysis_jobs
      WHERE id = p_job_id AND image_id = p_image_id
        AND model_id = p_model_id AND method = p_method
      FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM ai_analysis_jobs newer
      WHERE newer.image_id = p_image_id AND newer.method = p_method
        AND newer.status IN ('running', 'completed')
        AND (newer.created_at, newer.id) > (job.created_at, job.id)
    ) THEN
      RAISE EXCEPTION 'A newer analysis has superseded this run';
    END IF;
    IF job.status <> 'running' THEN
      RAISE EXCEPTION 'This analysis is not running';
    END IF;
  END IF;

  -- Supersede every unreviewed local finding, whichever local method made it.
  DELETE FROM public.ai_damage_detections
    WHERE image_id = p_image_id
      AND provenance IN ('heuristic', 'model')
      AND verified_by IS NULL
      AND NOT is_rejected;

  WITH src AS (
    SELECT DISTINCT ON (x.damage_type, x.bbox) x.*
    FROM jsonb_to_recordset(p_rows) AS x(
      model_id uuid, damage_type text, severity text, severity_score double precision,
      confidence double precision, bbox jsonb, notes text, provenance text,
      crack_orientation text, crack_pattern text, crack_cause text
    )
    ORDER BY x.damage_type, x.bbox
  ), ins AS (
    INSERT INTO public.ai_damage_detections
      (image_id, model_id, damage_type, severity, severity_score, confidence, bbox, notes,
       provenance, crack_width_mm, crack_width_band, crack_orientation, crack_pattern,
       crack_cause, aci_reference)
    SELECT p_image_id, COALESCE(x.model_id, p_model_id), x.damage_type, x.severity,
           x.severity_score, x.confidence, x.bbox, x.notes, x.provenance,
           NULL, NULL, x.crack_orientation, x.crack_pattern, x.crack_cause, NULL
    FROM src x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ai_damage_detections reviewed
      WHERE reviewed.image_id = p_image_id
        AND reviewed.provenance IN ('heuristic', 'model')
        AND (reviewed.is_rejected OR reviewed.verified_by IS NOT NULL)
        AND reviewed.damage_type = x.damage_type
        AND (
          reviewed.bbox = x.bbox
          OR (x.damage_type = 'crack' AND public.bbox_iou(reviewed.bbox, x.bbox) >= 0.5)
        )
    )
    RETURNING *
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) INTO findings FROM ins;

  IF p_job_id IS NULL THEN
    INSERT INTO ai_analysis_jobs
      (image_id, model_id, method, status, started_at, completed_at, method_detail)
      VALUES (p_image_id, p_model_id, p_method, 'completed', now(), now(),
              COALESCE(p_method_detail, '{}'::jsonb))
      RETURNING * INTO job;
  ELSE
    UPDATE ai_analysis_jobs
      SET status = 'completed', completed_at = now(),
          method_detail = COALESCE(p_method_detail, '{}'::jsonb)
      WHERE id = p_job_id
      RETURNING * INTO job;
  END IF;

  UPDATE ai_analysis_jobs
    SET status = 'failed', completed_at = now(),
        error_message = 'Superseded by a completed analysis.'
    WHERE image_id = p_image_id AND method = p_method
      AND status IN ('pending', 'running')
      AND (created_at, id) < (job.created_at, job.id);

  PERFORM public.recompute_inspection_damage_risk(image_inspection);

  RETURN jsonb_build_object('job', to_jsonb(job), 'detections', findings);
END $$;

REVOKE ALL ON FUNCTION public.commit_image_analysis_v2(uuid, uuid, text, uuid, jsonb, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_image_analysis_v2(uuid, uuid, text, uuid, jsonb, uuid, jsonb)
  TO service_role;

-- -----------------------------------------------------------------
-- Registry entry for the fitted artifact. The committed manifest
-- (src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.json) is the
-- authoritative checksum pin; this row must agree with it or the loader
-- refuses to run the model.
-- -----------------------------------------------------------------
UPDATE public.ai_models
  SET name = 'DamSegment Crack Detector',
      version = '1.0.0',
      task = 'detection',
      format = 'onnx',
      architecture = 'ssdlite320_mobilenet_v3_large',
      storage_path = 'models/crack-ssdlite320-damsegment-v1.onnx',
      labels = ARRAY['crack'],
      is_active = true,
      input_width = 320,
      input_height = 320,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'artifact', 'crack-ssdlite320-damsegment-v1',
        'artifact_sha256', '7a20253df77ae6f91eb7bbc3a2c15ea4850e6404e9af6cd7f3472a375c72db5b',
        'engine', 'onnxruntime-node',
        'dataset', 'DamSegment v1 detection release',
        'dataset_doi', '10.17632/z5z6gtt5t4.1',
        'dataset_license', 'CC BY 4.0',
        'class_map', jsonb_build_object('0', 'background', '1', 'crack', '2', 'spalling'),
        'consumes', jsonb_build_array('crack'),
        'non_ml', false
      )
  WHERE metadata->>'artifact' = 'crack-ssdlite320-damsegment-v1';

INSERT INTO public.ai_models
  (name, version, task, format, architecture, storage_path, labels, is_active,
   input_width, input_height, confidence_threshold, iou_threshold, preprocessing, metadata)
SELECT
  'DamSegment Crack Detector', '1.0.0', 'detection', 'onnx',
  'ssdlite320_mobilenet_v3_large', 'models/crack-ssdlite320-damsegment-v1.onnx',
  ARRAY['crack'], true, 320, 320, 0.45, 0.50,
  '{"mean":[0.5,0.5,0.5],"std":[0.5,0.5,0.5],"letterbox":true,"rgb01":true}'::jsonb,
  jsonb_build_object(
    'artifact', 'crack-ssdlite320-damsegment-v1',
    'artifact_sha256', '7a20253df77ae6f91eb7bbc3a2c15ea4850e6404e9af6cd7f3472a375c72db5b',
    'engine', 'onnxruntime-node',
    'dataset', 'DamSegment v1 detection release',
    'dataset_doi', '10.17632/z5z6gtt5t4.1',
    'dataset_license', 'CC BY 4.0',
    'class_map', jsonb_build_object('0', 'background', '1', 'crack', '2', 'spalling'),
    'consumes', jsonb_build_array('crack'),
    'non_ml', false
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_models
  WHERE metadata->>'artifact' = 'crack-ssdlite320-damsegment-v1'
);

COMMIT;

-- Verification:
-- SELECT name, format, architecture, is_active, metadata->>'artifact_sha256'
--   FROM public.ai_models WHERE format = 'onnx';
-- SELECT method, method_detail FROM public.ai_analysis_jobs ORDER BY created_at DESC LIMIT 5;
