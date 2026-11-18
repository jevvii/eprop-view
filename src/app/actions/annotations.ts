'use server'

import { z } from 'zod'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { recordAuditEvent } from '@/app/lib/audit'
import { actionOk, actionRefuse, type ActionResult } from '@/app/lib/action-result'
import { validatePolygon } from '@/app/lib/annotation/geometry'
import { rasteriseMask } from '@/app/lib/annotation/rasterise'
import { canEditAnnotation, nextStatusAfterReview, shouldSnapshotCandidate } from '@/app/lib/annotation/lifecycle'
import { deriveCrackWidthMm } from '@/app/lib/capture/geometry'
import { computeTrainingEligible } from '@/app/lib/capture/geometry'
import { severityToScore } from '@/app/lib/damage-score'
import type {
  AnnotationStatus,
  CaptureMetadataInput,
  DamageType,
  ImageAnnotation,
  InspectionImage,
  Point,
  SeverityLevel,
} from '@/app/types'

/**
 * Annotation actions.
 *
 * Ground truth lives here, never in ai_damage_detections. Expected refusals are
 * returned as values so production does not replace their message with a digest,
 * and every mutation is audited.
 */

const ANNOTATION_BUCKET = 'annotations'
const uuid = z.string().uuid()

const pointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict()
const bboxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()

const damageTypeSchema = z.enum(['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none'])
const severitySchema = z.enum(['low', 'medium', 'high', 'critical'])

const createSchema = z
  .object({
    imageId: uuid,
    damageType: damageTypeSchema,
    severity: severitySchema.nullable(),
    geometryKind: z.enum(['polygon', 'box', 'none']),
    polygon: z.array(pointSchema).nullable().optional(),
    bbox: bboxSchema.nullable().optional(),
    crackWidthMm: z.number().positive().max(1000).nullable().optional(),
    measuredWidthPx: z.number().positive().max(100_000).nullable().optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict()

const updateSchema = z
  .object({
    annotationId: uuid,
    polygon: z.array(pointSchema).nullable().optional(),
    bbox: bboxSchema.nullable().optional(),
    damageType: damageTypeSchema.optional(),
    severity: severitySchema.nullable().optional(),
    crackWidthMm: z.number().positive().max(1000).nullable().optional(),
    measuredWidthPx: z.number().positive().max(100_000).nullable().optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict()

const reviewSchema = z
  .object({
    annotationId: uuid,
    decision: z.enum(['approved', 'rejected']),
    notes: z.string().max(4000).optional(),
  })
  .strict()

const captureSchema = z
  .object({
    lighting: z.enum(['direct_sun', 'diffuse', 'flash', 'low_light', 'unknown']),
    surfaceState: z.enum(['dry', 'wet', 'efflorescence', 'debris', 'unknown']),
    elementType: z.enum(['deck', 'wall', 'column', 'beam', 'slab', 'pavement', 'foundation', 'other']),
    distanceMm: z.number().positive().max(100_000).nullish(),
    gsdMmPerPx: z.number().positive().max(100).nullish(),
    scaleSource: z.enum(['printed_reference', 'manual_gsd', 'unknown']).optional(),
    referenceTargetId: uuid.nullish(),
  })
  .strict()

export interface AnnotationQueueItem {
  image: InspectionImage
  draftCount: number
  submittedCount: number
  approvedCount: number
}

async function loadImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  imageId: string
): Promise<InspectionImage | null> {
  const { data, error } = await supabase.from('inspection_images').select('*').eq('id', imageId).maybeSingle()
  if (error) throw error
  return (data as InspectionImage | null) ?? null
}

/** Polygon geometry must be a simple shape inside the image; boxes likewise. */
function geometryRefusal(input: {
  geometryKind: 'polygon' | 'box' | 'none'
  polygon?: Point[] | null
  bbox?: { x: number; y: number; width: number; height: number } | null
}): string | null {
  if (input.geometryKind === 'polygon') {
    if (!input.polygon || input.polygon.length < 3) return 'A polygon needs at least three points.'
    const result = validatePolygon(input.polygon)
    return result.ok ? null : result.reason
  }
  if (input.geometryKind === 'box') {
    if (!input.bbox) return 'A box annotation needs a rectangle.'
    if (input.bbox.x + input.bbox.width > 1.0001 || input.bbox.y + input.bbox.height > 1.0001) {
      return 'The rectangle must lie inside the image.'
    }
  }
  return null
}

function severityScoreFor(severity: SeverityLevel | null): number | null {
  if (!severity) return null
  return severityToScore(severity)
}

export async function createAnnotation(input: unknown): Promise<ActionResult<ImageAnnotation>> {
  const { userId, role } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return actionRefuse('Invalid annotation.')
  const value = parsed.data

  const refusal = geometryRefusal(value)
  if (refusal) return actionRefuse(refusal)

  const supabase = await createClient()
  const image = await loadImage(supabase, value.imageId)
  if (!image) return actionRefuse('The image no longer exists.')

  // Inspectors label their own captures; engineers and admins label anything.
  if (role === 'inspector' && image.uploader_id && image.uploader_id !== userId) {
    return actionRefuse('Inspectors may only annotate their own captures.')
  }

  const crackWidthMm =
    value.crackWidthMm ??
    deriveCrackWidthMm(value.measuredWidthPx ?? null, image.gsd_mm_per_px ?? null)

  const { data, error } = await supabase
    .from('image_annotations')
    .insert({
      image_id: value.imageId,
      damage_type: value.damageType,
      severity: value.geometryKind === 'none' ? null : value.severity,
      severity_score: severityScoreFor(value.geometryKind === 'none' ? null : value.severity),
      geometry_kind: value.geometryKind,
      polygon: value.geometryKind === 'polygon' ? value.polygon : null,
      bbox: value.geometryKind === 'box' ? value.bbox : null,
      crack_width_mm: crackWidthMm,
      measured_width_px: value.measuredWidthPx ?? null,
      source: 'manual',
      status: 'draft',
      notes: value.notes ?? '',
      created_by: userId,
    })
    .select()
    .single()

  if (error || !data) return actionRefuse(error?.message ?? 'The annotation could not be saved.')

  await recordAuditEvent({
    action: 'annotation.create',
    entityType: 'image_annotation',
    entityId: data.id,
    metadata: { imageId: value.imageId, damageType: value.damageType, geometryKind: value.geometryKind },
  })

  return actionOk(data as ImageAnnotation)
}

export async function updateAnnotation(input: unknown): Promise<ActionResult<ImageAnnotation>> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return actionRefuse('Invalid annotation update.')
  const value = parsed.data

  const supabase = await createClient()
  const { data: existing, error: readError } = await supabase
    .from('image_annotations')
    .select('*')
    .eq('id', value.annotationId)
    .maybeSingle()

  if (readError) throw readError
  if (!existing) return actionRefuse('The annotation no longer exists.')

  const current = existing as ImageAnnotation
  if (!canEditAnnotation(current.status)) {
    return actionRefuse('A reviewed annotation can no longer be edited.')
  }

  const geometryKind = current.geometry_kind
  const nextPolygon = value.polygon !== undefined ? value.polygon : current.polygon
  const nextBbox = value.bbox !== undefined ? value.bbox : current.bbox

  const refusal = geometryRefusal({ geometryKind, polygon: nextPolygon, bbox: nextBbox })
  if (refusal) return actionRefuse(refusal)

  // Only a real geometry or class change claims the candidate as manual.
  const snapshotCandidate = shouldSnapshotCandidate(current, {
    polygon: value.polygon,
    bbox: value.bbox,
    damageType: value.damageType,
  })
  const editedCandidate = snapshotCandidate
    ? {
        original_geometry: {
          polygon: current.polygon,
          bbox: current.bbox,
          damage_type: current.damage_type,
          severity: current.severity,
        },
        source: 'manual' as const,
      }
    : {}

  const patch: Record<string, unknown> = {
    ...editedCandidate,
    ...(value.polygon !== undefined ? { polygon: value.polygon } : {}),
    ...(value.bbox !== undefined ? { bbox: value.bbox } : {}),
    ...(value.damageType !== undefined ? { damage_type: value.damageType } : {}),
    ...(value.severity !== undefined ? { severity: value.severity, severity_score: severityScoreFor(value.severity) } : {}),
    ...(value.notes !== undefined ? { notes: value.notes } : {}),
    ...(value.measuredWidthPx !== undefined ? { measured_width_px: value.measuredWidthPx } : {}),
  }

  if (value.crackWidthMm !== undefined) {
    patch.crack_width_mm = value.crackWidthMm
  } else if (value.measuredWidthPx !== undefined) {
    const image = await loadImage(supabase, current.image_id)
    patch.crack_width_mm = deriveCrackWidthMm(value.measuredWidthPx, image?.gsd_mm_per_px ?? null)
  }

  // A submitted annotation is still editable, so its mask must follow the
  // geometry. Otherwise approval could ship a mask that disagrees with its label.
  const geometryTouched = value.polygon !== undefined || value.bbox !== undefined
  if (current.status === 'submitted' && geometryTouched && geometryKind !== 'none') {
    const image = await loadImage(supabase, current.image_id)
    const width = image?.width_px ?? image?.source_width_px ?? 0
    const height = image?.height_px ?? image?.source_height_px ?? 0
    const polygon = value.polygon !== undefined ? value.polygon : current.polygon
    const bbox = value.bbox !== undefined ? value.bbox : current.bbox

    if (image && width > 0 && height > 0 && (polygon || bbox)) {
      try {
        const mask = await rasteriseMask(
          geometryKind === 'polygon'
            ? { kind: 'polygon', polygon: polygon ?? [] }
            : { kind: 'box', bbox: bbox! },
          width,
          height
        )
        const maskPath = `${image.inspection_id}/${current.image_id}/${current.id}.png`
        const { error: uploadError } = await supabase.storage
          .from(ANNOTATION_BUCKET)
          .upload(maskPath, mask, { contentType: 'image/png', upsert: true })
        if (!uploadError) patch.mask_path = maskPath
      } catch (caught) {
        console.error('Annotation mask refresh failed:', caught)
      }
    }
  }

  const { data, error } = await supabase
    .from('image_annotations')
    .update(patch)
    .eq('id', value.annotationId)
    .select()
    .single()

  if (error || !data) return actionRefuse(error?.message ?? 'The annotation could not be updated.')

  await recordAuditEvent({
    action: 'annotation.update',
    entityType: 'image_annotation',
    entityId: value.annotationId,
    metadata: { actor: userId },
  })

  return actionOk(data as ImageAnnotation)
}

export async function deleteAnnotation(annotationId: string): Promise<ActionResult<{ deleted: true }>> {
  await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = uuid.safeParse(annotationId)
  if (!parsed.success) return actionRefuse('Invalid annotation id.')

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('image_annotations')
    .select('mask_path, status')
    .eq('id', annotationId)
    .maybeSingle()

  if (!existing) return actionOk({ deleted: true })
  if (!canEditAnnotation((existing.status as AnnotationStatus) ?? 'draft')) {
    return actionRefuse('A reviewed annotation can no longer be deleted.')
  }

  const { error } = await supabase.from('image_annotations').delete().eq('id', annotationId)
  if (error) return actionRefuse(error.message)

  if (existing.mask_path) {
    const { error: storageError } = await supabase.storage.from(ANNOTATION_BUCKET).remove([existing.mask_path])
    if (storageError) console.error('Annotation mask cleanup failed:', storageError.message)
  }

  await recordAuditEvent({
    action: 'annotation.delete',
    entityType: 'image_annotation',
    entityId: annotationId,
    metadata: {},
  })

  return actionOk({ deleted: true })
}

/**
 * Submit every draft annotation for an image and rasterise its mask.
 * Masks are written here rather than on autosave so the stored label always
 * derives from geometry the database holds.
 */
export async function submitImageAnnotations(imageId: string): Promise<ActionResult<{ submitted: number }>> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = uuid.safeParse(imageId)
  if (!parsed.success) return actionRefuse('Invalid image id.')

  const supabase = await createClient()
  const image = await loadImage(supabase, imageId)
  if (!image) return actionRefuse('The image no longer exists.')

  const { data: drafts, error: readError } = await supabase
    .from('image_annotations')
    .select('*')
    .eq('image_id', imageId)
    .eq('status', 'draft')

  if (readError) throw readError

  let submitted = 0
  const width = image.width_px ?? image.source_width_px ?? 0
  const height = image.height_px ?? image.source_height_px ?? 0

  for (const row of (drafts ?? []) as ImageAnnotation[]) {
    const patch: Record<string, unknown> = { status: 'submitted' }

    if (row.geometry_kind !== 'none' && width > 0 && height > 0) {
      try {
        const mask = await rasteriseMask(
          row.geometry_kind === 'polygon'
            ? { kind: 'polygon', polygon: row.polygon ?? [] }
            : { kind: 'box', bbox: row.bbox! },
          width,
          height
        )
        const maskPath = `${image.inspection_id}/${imageId}/${row.id}.png`
        const { error: uploadError } = await supabase.storage
          .from(ANNOTATION_BUCKET)
          .upload(maskPath, mask, { contentType: 'image/png', upsert: true })

        if (uploadError) {
          console.error('Annotation mask upload failed:', uploadError.message)
        } else {
          patch.mask_path = maskPath
        }
      } catch (caught) {
        console.error('Annotation mask rasterisation failed:', caught)
      }
    }

    const { data: updated, error } = await supabase
      .from('image_annotations')
      .update(patch)
      .eq('id', row.id)
      .select('id')
    if (!error && updated && updated.length > 0) submitted++
  }

  await recordAuditEvent({
    action: 'annotation.submit',
    entityType: 'inspection_image',
    entityId: imageId,
    metadata: { submitted, actor: userId },
  })

  return actionOk({ submitted })
}

export async function reviewAnnotation(input: unknown): Promise<ActionResult<ImageAnnotation>> {
  const { userId } = await requireRole(['engineer', 'admin'])
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return actionRefuse('Invalid review.')
  const value = parsed.data

  const supabase = await createClient()
  const { data: existing, error: readError } = await supabase
    .from('image_annotations')
    .select('*')
    .eq('id', value.annotationId)
    .maybeSingle()

  if (readError) throw readError
  if (!existing) return actionRefuse('The annotation no longer exists.')

  const current = existing as ImageAnnotation
  const status = nextStatusAfterReview(current.status, value.decision)

  // Idempotent: re-approving an approved annotation changes nothing.
  if (status === current.status) return actionOk(current)

  const { data, error } = await supabase
    .from('image_annotations')
    .update({
      status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      ...(value.notes !== undefined ? { notes: value.notes } : {}),
    })
    .eq('id', value.annotationId)
    .select()
    .single()

  if (error || !data) return actionRefuse(error?.message ?? 'The review could not be saved.')

  await recordAuditEvent({
    action: `annotation.${value.decision}`,
    entityType: 'image_annotation',
    entityId: value.annotationId,
    metadata: { actor: userId },
  })

  return actionOk(data as ImageAnnotation)
}

export async function updateImageCaptureMetadata(input: unknown): Promise<ActionResult<InspectionImage>> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = z.object({ imageId: uuid, capture: captureSchema }).strict().safeParse(input)
  if (!parsed.success) return actionRefuse('Invalid capture metadata.')

  const { imageId, capture } = parsed.data
  const supabase = await createClient()
  const image = await loadImage(supabase, imageId)
  if (!image) return actionRefuse('The image no longer exists.')

  const width = image.width_px ?? image.source_width_px ?? 0
  const height = image.height_px ?? image.source_height_px ?? 0

  const gsd = capture.gsdMmPerPx ?? null
  const scaleSource = capture.scaleSource ?? (gsd !== null ? 'manual_gsd' : 'unknown')

  const { data, error } = await supabase
    .from('inspection_images')
    .update({
      lighting: capture.lighting,
      surface_state: capture.surfaceState,
      element_type: capture.elementType,
      distance_mm: capture.distanceMm ?? null,
      gsd_mm_per_px: gsd,
      scale_source: scaleSource,
      training_eligible: computeTrainingEligible({ widthPx: width, heightPx: height }),
    })
    .eq('id', imageId)
    .select()
    .single()

  if (error || !data) return actionRefuse(error?.message ?? 'Capture metadata could not be saved.')

  await recordAuditEvent({
    action: 'image.capture_metadata.update',
    entityType: 'inspection_image',
    entityId: imageId,
    before: {
      lighting: image.lighting,
      surface_state: image.surface_state,
      element_type: image.element_type,
      gsd_mm_per_px: image.gsd_mm_per_px,
      scale_source: image.scale_source,
    },
    after: {
      lighting: capture.lighting,
      surface_state: capture.surfaceState,
      element_type: capture.elementType,
      gsd_mm_per_px: gsd,
      scale_source: scaleSource,
    },
    metadata: { actor: userId },
  })

  return actionOk(data as InspectionImage)
}

export async function listAnnotationQueue(input?: {
  inspectionId?: string
  status?: AnnotationStatus
  mineOnly?: boolean
  showIneligible?: boolean
}): Promise<AnnotationQueueItem[]> {
  const { userId, role } = await requireRole(['inspector', 'engineer', 'admin'])
  const supabase = await createClient()

  let query = supabase
    .from('inspection_images')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(100)

  // Seeded placeholders and sub-resolution images are not labelable data.
  if (!input?.showIneligible) query = query.eq('training_eligible', true)
  if (input?.inspectionId) query = query.eq('inspection_id', input.inspectionId)
  if (input?.mineOnly || role === 'inspector') query = query.eq('uploader_id', userId)

  const { data: images, error } = await query
  if (error) throw error
  if (!images || images.length === 0) return []

  const imageIds = (images as InspectionImage[]).map((image) => image.id)
  const { data: annotations, error: annotationError } = await supabase
    .from('image_annotations')
    .select('image_id, status')
    .in('image_id', imageIds)

  if (annotationError) throw annotationError

  const counts = new Map<string, { draft: number; submitted: number; approved: number }>()
  for (const row of (annotations ?? []) as { image_id: string; status: AnnotationStatus }[]) {
    const entry = counts.get(row.image_id) ?? { draft: 0, submitted: 0, approved: 0 }
    if (row.status === 'draft') entry.draft++
    if (row.status === 'submitted') entry.submitted++
    if (row.status === 'approved') entry.approved++
    counts.set(row.image_id, entry)
  }

  return (images as InspectionImage[])
    .map((image) => {
      const entry = counts.get(image.id) ?? { draft: 0, submitted: 0, approved: 0 }
      return {
        image,
        draftCount: entry.draft,
        submittedCount: entry.submitted,
        approvedCount: entry.approved,
      }
    })
    .filter((item) => {
      if (!input?.status) return true
      if (input.status === 'draft') return item.draftCount > 0
      if (input.status === 'submitted') return item.submittedCount > 0
      if (input.status === 'approved') return item.approvedCount > 0
      return item.draftCount + item.submittedCount + item.approvedCount === 0
    })
}
