-- =================================================================
-- 024 — Review fixes for capture discipline and annotation
--
-- Three gaps found in review:
--   1. inspection_images had no UPDATE policy, so correcting capture
--      metadata silently updated zero rows.
--   2. image_annotations insert only checked role, so a writer could
--      claim another user as created_by and escape owner-scoped rules.
--   3. Mask deletion was engineer/admin only, so an inspector's own
--      draft cleanup orphaned its mask object.
-- =================================================================

DROP POLICY IF EXISTS "inspection_images_update" ON public.inspection_images;
CREATE POLICY "inspection_images_update" ON public.inspection_images
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('engineer', 'admin') OR uploader_id = auth.uid())
  WITH CHECK (get_my_role() IN ('engineer', 'admin') OR uploader_id = auth.uid());

DROP POLICY IF EXISTS image_annotations_insert ON public.image_annotations;
CREATE POLICY image_annotations_insert ON public.image_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('inspector', 'engineer', 'admin')
    AND created_by = auth.uid()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "annotations_delete" ON storage.objects;
    CREATE POLICY "annotations_delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'annotations'
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'engineer', 'admin')
      );
  END IF;
END $$;
