-- Create table for image comments
CREATE TABLE public.image_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.inspection_images(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS image_comments_image_id_idx ON public.image_comments(image_id);
CREATE INDEX IF NOT EXISTS image_comments_author_id_idx ON public.image_comments(author_id);

-- Enable RLS
ALTER TABLE public.image_comments ENABLE ROW LEVEL SECURITY;

-- Policies for image_comments
-- Anyone authenticated can read comments
CREATE POLICY "image_comments_read" ON public.image_comments
  FOR SELECT TO authenticated
  USING (true);

-- Anyone authenticated can insert a comment
CREATE POLICY "image_comments_insert" ON public.image_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- Only author or admin can delete a comment
CREATE POLICY "image_comments_delete" ON public.image_comments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only the owner of the image can update the is_read status
CREATE POLICY "image_comments_update_read" ON public.image_comments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inspection_images 
      WHERE id = image_comments.image_id AND uploader_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inspection_images 
      WHERE id = image_comments.image_id AND uploader_id = auth.uid()
    )
  );

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_image_comment_count()
RETURNS bigint AS $$
BEGIN
  RETURN (
    SELECT count(*)
    FROM public.image_comments c
    JOIN public.inspection_images i ON c.image_id = i.id
    WHERE i.uploader_id = auth.uid()
    AND c.author_id != auth.uid()
    AND c.is_read = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
