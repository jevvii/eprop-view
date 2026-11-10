'use server'

import sharp from 'sharp'
import type { Metadata as SharpMetadata } from 'sharp'
import { z } from 'zod'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import type { InspectionImage } from '@/app/types'

const BUCKET = 'inspection-images'
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const MAX_DIMENSION = 4096

const ACCEPTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

const prepareSchema = z
  .object({
    inspectionId: z.string().uuid(),
    fileName: z.string().min(1).max(200),
    mimeType: z.enum(ACCEPTED_MIME),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  })
  .strict()

const finalizeSchema = z
  .object({
    inspectionId: z.string().uuid(),
    storagePath: z.string().min(1).max(500),
    caption: z.string().trim().max(200).optional(),
  })
  .strict()

async function assertInspectionAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inspectionId: string,
  userId: string,
  role: string
) {
  const { data: inspection, error } = await supabase
    .from('inspections')
    .select('id, lead_inspector_id')
    .eq('id', inspectionId)
    .maybeSingle()

  if (error || !inspection) {
    throw new Error('Parent inspection not found')
  }

  if (role === 'inspector' && inspection.lead_inspector_id && inspection.lead_inspector_id !== userId) {
    throw new Error('Access denied: inspectors may only upload imagery to their assigned inspections')
  }
}

/**
 * Step 1: authorize the upload and return a short-lived signed upload URL.
 * The browser sends the bytes straight to storage, so Server Action body limits
 * and platform request caps never come into play.
 */
export async function prepareInspectionImageUpload(input: unknown): Promise<{
  storagePath: string
  token: string
}> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  const parsed = prepareSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('Unsupported file. Use a JPEG, PNG, WebP or HEIC image under 10 MB.')
  }

  await enforceRateLimit(`upload:${userId}`, 30, 60)

  const supabase = await createClient()
  await assertInspectionAccess(supabase, parsed.data.inspectionId, userId, role)

  // Always store a .jpg path: the finalise step re-encodes to a clean JPEG.
  const storagePath = `${parsed.data.inspectionId}/${userId}/${crypto.randomUUID()}.jpg`

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)
  if (error || !data?.token) {
    throw new Error('Could not prepare the upload. Please retry.')
  }

  return { storagePath, token: data.token }
}

/**
 * Step 2: verify what actually landed in storage, re-encode it to strip
 * metadata and cap dimensions, then create the database row.
 * A file's extension and declared MIME type prove nothing; the decoded format does.
 */
export async function finalizeInspectionImageUpload(input: unknown): Promise<InspectionImage> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  const parsed = finalizeSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('Invalid upload reference')
  }

  const { inspectionId, storagePath, caption } = parsed.data
  await enforceRateLimit(`upload-finalize:${userId}`, 60, 60)

  const supabase = await createClient()
  await assertInspectionAccess(supabase, inspectionId, userId, role)

  // The path must be one this exact user could have been issued.
  const expectedPrefix = `${inspectionId}/${userId}/`
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new Error('Access denied: upload path does not belong to this inspection')
  }

  const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(storagePath)
  if (downloadError || !blob) {
    throw new Error('Uploaded file could not be read')
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error('Uploaded file is empty or too large')
  }

  let metadata: SharpMetadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error('Uploaded file is not a readable image')
  }

  if (!metadata.format || !['jpeg', 'png', 'webp', 'heif'].includes(metadata.format)) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error('Uploaded file is not a supported image format')
  }

  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error('Image dimensions are not supported')
  }

  let normalized: Buffer
  try {
    normalized = await sharp(buffer)
      .rotate() // honour EXIF orientation
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()
  } catch {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error('Image could not be processed. Try a JPEG or PNG export.')
  }

  const { error: reuploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, normalized, { contentType: 'image/jpeg', upsert: true })

  if (reuploadError) {
    throw new Error('Could not finalise the upload. Please retry.')
  }

  const { data: imageRecord, error: insertError } = await supabase
    .from('inspection_images')
    .insert({
      inspection_id: inspectionId,
      storage_path: storagePath,
      caption: caption || 'Site photo',
      uploader_id: userId,
    })
    .select()
    .single()

  if (insertError || !imageRecord) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error(`Database record creation failed: ${insertError?.message ?? 'unknown error'}`)
  }

  return imageRecord as InspectionImage
}

/**
 * Permanently delete an inspection asset.
 * The storage path is read from the database row, never accepted from the caller.
 */
export async function deleteInspectionImage(imageId: string): Promise<void> {
  const { userId, role } = await requireRole(['inspector', 'admin'])

  const parsedId = z.string().uuid().safeParse(imageId)
  if (!parsedId.success) throw new Error('Invalid image id')

  const supabase = await createClient()

  const { data: image, error: imgError } = await supabase
    .from('inspection_images')
    .select('uploader_id, storage_path')
    .eq('id', parsedId.data)
    .maybeSingle()

  if (imgError || !image) {
    throw new Error('Asset not found')
  }

  if (role === 'inspector' && image.uploader_id !== userId) {
    throw new Error('Access denied: inspectors may only delete their own uploaded assets')
  }

  const { error: delError } = await supabase.from('inspection_images').delete().eq('id', parsedId.data)
  if (delError) throw delError

  if (image.storage_path) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([image.storage_path])
    if (storageError) {
      console.error('Orphaned storage object after row delete:', image.storage_path, storageError.message)
    }
  }
}
