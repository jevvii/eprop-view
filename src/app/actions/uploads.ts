'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import type { InspectionImage } from '@/app/types'

/**
 * Upload an inspection image to Supabase storage and create the database record.
 * Role-gated strictly to Inspector and Admin.
 * Inspectors are restricted to uploading to inspections they own (lead_inspector_id = auth.uid()).
 */
export async function uploadInspectionImage(formData: FormData): Promise<InspectionImage> {
  const { userId, role } = await requireRole(['inspector', 'admin'])

  const inspectionId = formData.get('inspectionId') as string
  const file = formData.get('file') as File | null
  const caption = (formData.get('caption') as string) || file?.name || 'Site Photo'

  if (!inspectionId || !file) {
    throw new Error('Missing inspectionId or file in upload payload')
  }

  const supabase = await createClient()

  // Verify parent inspection exists and belongs to the inspector
  const { data: inspection, error: inspError } = await supabase
    .from('inspections')
    .select('id, lead_inspector_id')
    .eq('id', inspectionId)
    .single()

  if (inspError || !inspection) {
    throw new Error('Parent inspection not found')
  }

  if (role === 'inspector' && inspection.lead_inspector_id && inspection.lead_inspector_id !== userId) {
    throw new Error('Access denied: inspectors may only upload imagery to their assigned inspections')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${inspectionId}/${Date.now()}-${safeName}`
  const fileBuffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('inspection-images')
    .upload(storagePath, fileBuffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  const { data: imageRecord, error: insertError } = await supabase
    .from('inspection_images')
    .insert({
      inspection_id: inspectionId,
      storage_path: storagePath,
      caption,
      uploader_id: userId,
    })
    .select()
    .single()

  if (insertError || !imageRecord) {
    // Attempt rollback of uploaded file
    await supabase.storage.from('inspection-images').remove([storagePath])
    throw new Error(`Database record creation failed: ${insertError?.message}`)
  }

  return imageRecord as InspectionImage
}

/**
 * Permanently delete an inspection asset.
 * Restricted to asset uploader or Admin.
 */
export async function deleteInspectionImage(imageId: string, storagePath: string): Promise<void> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  const supabase = await createClient()

  const { data: image, error: imgError } = await supabase
    .from('inspection_images')
    .select('uploader_id')
    .eq('id', imageId)
    .single()

  if (imgError || !image) {
    throw new Error('Asset not found')
  }

  if (role === 'inspector' && image.uploader_id !== userId) {
    throw new Error('Access denied: inspectors may only delete their own uploaded assets')
  }

  await supabase.storage.from('inspection-images').remove([storagePath])
  const { error: delError } = await supabase.from('inspection_images').delete().eq('id', imageId)
  if (delError) throw delError
}
