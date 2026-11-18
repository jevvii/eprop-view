/**
 * Backfill capture dimensions for images stored before migration 023.
 *
 * Every pre-existing row has NULL width/height, which would exclude it from
 * dataset export for a reason that has nothing to do with its usefulness.
 * This reads each stored object, records its oriented dimensions, and marks
 * rows it cannot decode as ineligible rather than leaving them ambiguous.
 *
 * Preview only. `vercel env run` is never safe here — it loads `.env.local`.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<preview-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<preview service role key> \
 *   npm run backfill:capture
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { computeTrainingEligible, orientedDimensions } from '../app/lib/capture/geometry'

const PREVIEW_PROJECT_REF = 'gbuwldihkmapzondxkto'
const DEFAULT_BUCKET = 'inspection-images'

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
    console.error(`Refusing to backfill ${host}: it is not the preview project (${PREVIEW_PROJECT_REF}).`)
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: rows, error } = await supabase
    .from('inspection_images')
    .select('id, storage_path, storage_bucket')
    .is('width_px', null)

  if (error) {
    console.error('Could not list images:', error.message)
    process.exit(1)
  }

  let updated = 0
  let unreadable = 0

  for (const row of rows ?? []) {
    const bucket = row.storage_bucket || DEFAULT_BUCKET
    const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(row.storage_path)

    if (downloadError || !blob) {
      unreadable++
      await supabase.from('inspection_images').update({ training_eligible: false }).eq('id', row.id)
      continue
    }

    const buffer = Buffer.from(await blob.arrayBuffer())

    try {
      const metadata = await sharp(buffer).metadata()
      const oriented = orientedDimensions(metadata)
      const { error: updateError } = await supabase
        .from('inspection_images')
        .update({
          source_width_px: oriented.width,
          source_height_px: oriented.height,
          width_px: oriented.width,
          height_px: oriented.height,
          scale_source: 'unknown',
          training_eligible: computeTrainingEligible({ widthPx: oriented.width, heightPx: oriented.height }),
        })
        .eq('id', row.id)

      if (updateError) {
        console.error(`  ${row.id}: ${updateError.message}`)
        unreadable++
      } else {
        updated++
      }
    } catch {
      unreadable++
      await supabase.from('inspection_images').update({ training_eligible: false }).eq('id', row.id)
    }
  }

  console.log(`updated ${updated}, unreadable ${unreadable}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
