-- =================================================================
-- 023 — Capture discipline and in-app annotation
--
-- Two changes:
--   1. inspection_images gains the capture metadata that makes an
--      image a training example (dimensions, GSD, lighting, element).
--   2. image_annotations stores human ground truth, deliberately
--      separate from ai_damage_detections so candidates and labels
--      never share a lifecycle.
-- =================================================================

ALTER TABLE public.inspection_images
  ADD COLUMN IF NOT EXISTS source_width_px integer,
  ADD COLUMN IF NOT EXISTS source_height_px integer,
  ADD COLUMN IF NOT EXISTS width_px integer,
  ADD COLUMN IF NOT EXISTS height_px integer,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS distance_mm numeric,
  ADD COLUMN IF NOT EXISTS gsd_mm_per_px numeric,
  ADD COLUMN IF NOT EXISTS scale_source text
    CHECK (scale_source IN ('printed_reference','manual_gsd','unknown')),
  ADD COLUMN IF NOT EXISTS lighting text
    CHECK (lighting IN ('direct_sun','diffuse','flash','low_light','unknown')),
  ADD COLUMN IF NOT EXISTS surface_state text
    CHECK (surface_state IN ('dry','wet','efflorescence','debris','unknown')),
  ADD COLUMN IF NOT EXISTS element_type text
    CHECK (element_type IN ('deck','wall','column','beam','slab','pavement','foundation','other')),
  ADD COLUMN IF NOT EXISTS capture_method text
    CHECK (capture_method IN ('upload','ar_printed_reference','ar_markerless')),
  ADD COLUMN IF NOT EXISTS camera_model text,
  ADD COLUMN IF NOT EXISTS training_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capture_notes text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.image_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.inspection_images(id) ON DELETE CASCADE,
  damage_type text NOT NULL CHECK (damage_type IN ('crack','corrosion','spalling','deformation','leakage','none')),
  severity text CHECK (severity IN ('low','medium','high','critical')),
  severity_score numeric,
  geometry_kind text NOT NULL CHECK (geometry_kind IN ('polygon','box','none')),
  polygon jsonb,
  bbox jsonb,
  crack_width_mm numeric,
  measured_width_px numeric,
  mask_path text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','heuristic','gemini','model')),
  source_confidence numeric,
  original_geometry jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT image_annotations_geometry_matches_kind CHECK (
    (geometry_kind = 'none' AND polygon IS NULL AND bbox IS NULL AND severity IS NULL)
    OR (geometry_kind = 'polygon' AND polygon IS NOT NULL AND bbox IS NULL AND severity IS NOT NULL)
    OR (geometry_kind = 'box' AND bbox IS NOT NULL AND polygon IS NULL AND severity IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS image_annotations_image_id_idx ON public.image_annotations(image_id);
CREATE INDEX IF NOT EXISTS image_annotations_status_idx ON public.image_annotations(status);
CREATE INDEX IF NOT EXISTS image_annotations_damage_type_idx ON public.image_annotations(damage_type);

DROP TRIGGER IF EXISTS image_annotations_set_updated_at ON public.image_annotations;
CREATE TRIGGER image_annotations_set_updated_at
  BEFORE UPDATE ON public.image_annotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.image_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS image_annotations_select ON public.image_annotations;
CREATE POLICY image_annotations_select ON public.image_annotations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS image_annotations_insert ON public.image_annotations;
CREATE POLICY image_annotations_insert ON public.image_annotations
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('inspector','engineer','admin'));

DROP POLICY IF EXISTS image_annotations_update ON public.image_annotations;
CREATE POLICY image_annotations_update ON public.image_annotations
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('engineer','admin')
    OR (created_by = auth.uid() AND status IN ('draft','submitted')))
  WITH CHECK (get_my_role() IN ('engineer','admin')
    OR (created_by = auth.uid() AND status IN ('draft','submitted')));

DROP POLICY IF EXISTS image_annotations_delete ON public.image_annotations;
CREATE POLICY image_annotations_delete ON public.image_annotations
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin'
    OR (created_by = auth.uid() AND status IN ('draft','submitted')));

INSERT INTO storage.buckets (id, name, public)
VALUES ('annotations','annotations',false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "annotations_read" ON storage.objects;
    CREATE POLICY "annotations_read" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'annotations');

    DROP POLICY IF EXISTS "annotations_write" ON storage.objects;
    CREATE POLICY "annotations_write" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'annotations'
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector','engineer','admin'));

    DROP POLICY IF EXISTS "annotations_delete" ON storage.objects;
    CREATE POLICY "annotations_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'annotations'
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('engineer','admin'));
  END IF;
END $$;
