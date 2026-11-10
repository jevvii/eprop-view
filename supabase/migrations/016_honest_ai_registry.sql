-- =================================================================
-- Migration 016: Honest AI model registry
-- The seeded "YOLOv8" / "ResNet50" rows are relabelled as what they are:
-- a deterministic edge-gradient heuristic, not a trained checkpoint.
-- Only one heuristic entry stays active; the duplicate mock rows are retired
-- rather than deleted, so any historical reference remains resolvable.
-- =================================================================
BEGIN;

ALTER TABLE public.ai_models
  DROP CONSTRAINT IF EXISTS ai_models_format_check;

ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_format_check
  CHECK (format IN ('tfjs', 'onnx', 'heuristic', 'mock'));

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.ai_models
  WHERE format = 'mock'
     OR name ILIKE '%YOLOv8%'
     OR name ILIKE '%ResNet50%'
)
UPDATE public.ai_models AS m
   SET name = CASE
         WHEN r.rn = 1 THEN 'Edge-Gradient Heuristic'
         ELSE 'Retired Heuristic Entry ' || r.rn
       END,
       version = '2.0.0',
       task = 'detection',
       format = 'heuristic',
       architecture = 'heuristic',
       storage_path = NULL,
       labels = ARRAY['crack', 'corrosion', 'spalling', 'deformation', 'leakage'],
       is_active = (r.rn = 1),
       metadata = COALESCE(m.metadata, '{}'::jsonb) || '{"engine":"heuristic","non_ml":true}'::jsonb
  FROM ranked AS r
 WHERE m.id = r.id;

-- Always leave at least one usable analysis model.
INSERT INTO public.ai_models (
  name, version, task, format, architecture, labels, is_active,
  input_width, input_height, confidence_threshold, iou_threshold, metadata
)
SELECT
  'Edge-Gradient Heuristic', '2.0.0', 'detection', 'heuristic', 'heuristic',
  ARRAY['crack', 'corrosion', 'spalling', 'deformation', 'leakage'], true,
  640, 640, 0.25, 0.45, '{"engine":"heuristic","non_ml":true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.ai_models WHERE is_active = true);

COMMIT;

-- Verification:
-- SELECT name, format, architecture, is_active FROM public.ai_models ORDER BY created_at;
