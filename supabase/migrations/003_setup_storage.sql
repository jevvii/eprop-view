-- =================================================================
-- ROLE-BASED ACCESS POLICIES FOR 'inspection-images' BUCKET
-- =================================================================

-- NOTE: If you get "must be owner of table objects", create the bucket
-- manually in the Supabase Dashboard (Storage tab) and ensure 
-- RLS is enabled there. Then run these policy commands.

-- 1. ADMIN: Absolute control
CREATE POLICY "admin_storage_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 2. VIEWERS/INSPECTORS: Read access (Signed URL generation)
CREATE POLICY "viewer_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('viewer', 'inspector', 'admin'));

-- 3. INSPECTORS: Permission to upload imagery
CREATE POLICY "inspector_storage_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'admin'));

-- 4. INSPECTORS: Permission to update metadata
CREATE POLICY "inspector_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'admin'))
  WITH CHECK (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'admin'));

-- 5. ADMIN ONLY: Permission to delete
CREATE POLICY "admin_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
