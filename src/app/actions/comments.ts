'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole, verifySession } from '@/app/lib/dal'
import type { ImageComment } from '@/app/types'

/**
 * Add a technical comment/observation to an inspection image.
 * Gated to Inspector, Engineer, and Admin roles (Viewers cannot comment).
 */
export async function addImageCommentAction(
  imageId: string,
  content: string
): Promise<ImageComment> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])

  if (!imageId || !content.trim()) {
    throw new Error('Image ID and non-empty comment content are required')
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('image_comments')
    .insert({
      image_id: imageId,
      content: content.trim(),
      author_id: userId,
    })
    .select()
    .single()

  if (error || !data) {
    throw error ?? new Error('Failed to post comment')
  }

  return data as ImageComment
}

/**
 * Mark all comments for an image as read.
 */
export async function markCommentsReadAction(imageId: string): Promise<void> {
  await verifySession()
  const supabase = await createClient()

  const { error } = await supabase
    .from('image_comments')
    .update({ is_read: true })
    .eq('image_id', imageId)
    .eq('is_read', false)

  if (error) throw error
}
