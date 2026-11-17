/**
 * Export an approved annotation set as a YOLO-seg dataset.
 *
 * Preview only: real client imagery must not leave the production boundary.
 * Splits are keyed by building (falling back to inspection) so repeat visits to
 * one structure never straddle train and test.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<preview-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<preview service role key> \
 *   npm run export:dataset
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { assignSplits, buildManifest, toYoloSegLine, type ManifestImage } from '../app/lib/annotation/export'
import type { DamageType, ImageAnnotation, Point } from '../app/types'

const PREVIEW_PROJECT_REF = 'gbuwldihkmapzondxkto'
const OUTPUT_DIR = 'dataset'
const SPLIT_SEED = 42
const ANNOTATION_BUCKET = 'annotations'
const IMAGE_BUCKET = 'inspection-images'

interface ExportImage {
  id: string
  inspection_id: string
  storage_path: string
  storage_bucket: string | null
  width_px: number | null
  height_px: number | null
  scale_source: string | null
  gsd_mm_per_px: number | null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    console.error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`)
    process.exit(1)
  }

  if (host !== `${PREVIEW_PROJECT_REF}.supabase.co`) {
    console.error(`Refusing to export from ${host}: it is not the preview project (${PREVIEW_PROJECT_REF}).`)
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: images, error: imageError } = await supabase
    .from('inspection_images')
    .select('id, inspection_id, storage_path, storage_bucket, width_px, height_px, scale_source, gsd_mm_per_px')
    .eq('training_eligible', true)
    .not('width_px', 'is', null)
    .not('height_px', 'is', null)

  if (imageError) {
    console.error('Could not list images:', imageError.message)
    process.exit(1)
  }

  const eligible = (images ?? []) as ExportImage[]
  if (eligible.length === 0) {
    console.log('exported 0 images, 0 annotations, 0 negatives')
    return
  }

  const imageIds = eligible.map((image) => image.id)
  const { data: annotations, error: annotationError } = await supabase
    .from('image_annotations')
    .select('*')
    .eq('status', 'approved')
    .in('image_id', imageIds)

  if (annotationError) {
    console.error('Could not list annotations:', annotationError.message)
    process.exit(1)
  }

  const byImage = new Map<string, ImageAnnotation[]>()
  for (const annotation of (annotations ?? []) as ImageAnnotation[]) {
    const list = byImage.get(annotation.image_id) ?? []
    list.push(annotation)
    byImage.set(annotation.image_id, list)
  }

  // Structure identity comes from the building, not the inspection: a building
  // visited twice must not have one visit in train and the other in test.
  const inspectionIds = [...new Set(eligible.map((image) => image.inspection_id))]
  const { data: inspections } = await supabase
    .from('inspections')
    .select('id, building_id')
    .in('id', inspectionIds)

  const buildingByInspection = new Map<string, string | null>(
    ((inspections ?? []) as { id: string; building_id: string | null }[]).map((row) => [row.id, row.building_id])
  )
  const structureKeyFor = (image: ExportImage) =>
    buildingByInspection.get(image.inspection_id) ?? image.inspection_id

  const exported = eligible.filter((image) => (byImage.get(image.id)?.length ?? 0) > 0)
  if (exported.length === 0) {
    console.log('exported 0 images, 0 annotations, 0 negatives')
    return
  }

  const splits = assignSplits(exported.map((image) => ({ structureKey: structureKeyFor(image) })), SPLIT_SEED)

  await mkdir(join(OUTPUT_DIR, 'images'), { recursive: true })
  await mkdir(join(OUTPUT_DIR, 'labels'), { recursive: true })
  await mkdir(join(OUTPUT_DIR, 'masks'), { recursive: true })

  const manifestImages: ManifestImage[] = []
  const splitRows: { image_id: string; structure_key: string; split: string }[] = []
  const widthRows: {
    annotation_id: string
    image_id: string
    damage_type: string
    crack_width_mm: number | null
  }[] = []
  let annotationCount = 0
  let negativeCount = 0

  for (const [index, image] of exported.entries()) {
    const rows = byImage.get(image.id) ?? []
    const bucket = image.storage_bucket || IMAGE_BUCKET
    const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(image.storage_path)
    if (downloadError || !blob) {
      console.error(`  skipping ${image.id}: ${downloadError?.message ?? 'image unavailable'}`)
      continue
    }

    await writeFile(join(OUTPUT_DIR, 'images', `${image.id}.jpg`), Buffer.from(await blob.arrayBuffer()))

    const labelLines: string[] = []
    const classes: Record<string, number> = {}
    let widthOmitted = 0

    for (const annotation of rows) {
      if (annotation.geometry_kind === 'none') continue
      if (annotation.crack_width_mm === null) widthOmitted++
      classes[annotation.damage_type] = (classes[annotation.damage_type] ?? 0) + 1
      widthRows.push({
        annotation_id: annotation.id,
        image_id: image.id,
        damage_type: annotation.damage_type,
        crack_width_mm: annotation.crack_width_mm,
      })

      if (annotation.geometry_kind === 'polygon' && annotation.polygon && annotation.polygon.length >= 3) {
        labelLines.push(toYoloSegLine(annotation.damage_type as Exclude<DamageType, 'none'>, annotation.polygon as Point[]))
      } else if (annotation.geometry_kind === 'box' && annotation.bbox) {
        const { x, y, width, height } = annotation.bbox
        const polygon: Point[] = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ]
        labelLines.push(toYoloSegLine(annotation.damage_type as Exclude<DamageType, 'none'>, polygon))
      }

      if (annotation.mask_path) {
        const { data: mask, error: maskError } = await supabase.storage
          .from(ANNOTATION_BUCKET)
          .download(annotation.mask_path)
        if (!maskError && mask) {
          await writeFile(join(OUTPUT_DIR, 'masks', `${annotation.id}.png`), Buffer.from(await mask.arrayBuffer()))
        }
      }
    }

    // An image whose only approved annotation is 'none' exports an empty label
    // file: a valid negative, and the only domain-matched background there is.
    await writeFile(join(OUTPUT_DIR, 'labels', `${image.id}.txt`), labelLines.join('\n'))
    if (labelLines.length === 0) negativeCount++
    annotationCount += rows.filter((row) => row.geometry_kind !== 'none').length

    manifestImages.push({
      id: image.id,
      structureKey: structureKeyFor(image),
      approved: rows.filter((row) => row.geometry_kind !== 'none').length,
      negativeOnly: labelLines.length === 0,
      widthOmitted,
      classes,
      scaleSource: image.scale_source ?? 'unknown',
      gsdKnown: image.gsd_mm_per_px !== null && image.gsd_mm_per_px !== undefined,
    })
    splitRows.push({ image_id: image.id, structure_key: structureKeyFor(image), split: splits[index] })
  }

  const manifest = buildManifest({
    images: manifestImages,
    seed: SPLIT_SEED,
    generatedAt: new Date().toISOString(),
  })

  await writeFile(join(OUTPUT_DIR, 'widths.json'), JSON.stringify(widthRows, null, 2))
  await writeFile(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await writeFile(join(OUTPUT_DIR, 'splits.json'), JSON.stringify({ seed: SPLIT_SEED, rows: splitRows }, null, 2))

  console.log(
    `exported ${manifestImages.length} images, ${annotationCount} annotations, ${negativeCount} negatives`
  )
  console.log(`widths omitted for ${manifest.widthOmittedCount} annotations without a known scale`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
