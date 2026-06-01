-- 1. Add uploader_id to inspection_images to track ownership
ALTER TABLE public.inspection_images 
ADD COLUMN uploader_id uuid REFERENCES public.profiles(id) DEFAULT auth.uid();

-- 2. Update RLS policies for inspection_images table
-- DROP existing policies if they exist (adjust names if necessary based on your initial schema)
DROP POLICY IF EXISTS "admin_all_inspection_images" ON public.inspection_images;
DROP POLICY IF EXISTS "viewer_select_images" ON public.inspection_images;
DROP POLICY IF EXISTS "inspector_all_images" ON public.inspection_images;

-- CREATE new secure policies
-- Viewers/Inspectors: Can see all images
CREATE POLICY "inspection_images_read" ON public.inspection_images
  FOR SELECT TO authenticated
  USING (true);

-- Inspectors/Admins: Can upload new images
CREATE POLICY "inspection_images_insert" ON public.inspection_images
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'admin')
  );

-- DELETION: Only the owner (uploader) or an Admin can delete the record
CREATE POLICY "inspection_images_delete" ON public.inspection_images
  FOR DELETE TO authenticated
  USING (
    uploader_id = auth.uid() OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 3. Update Storage Policies for 'inspection-images' bucket
-- These must be done in the Supabase Dashboard UI for best results (as per previous fix), 
-- but here is the logic to mirror:

/*
NAME: Allow Owner or Admin Delete
OPERATION: DELETE
USING: 
  bucket_id = 'inspection-images' AND (
    (SELECT auth.uid()) = (owner) OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
*/
