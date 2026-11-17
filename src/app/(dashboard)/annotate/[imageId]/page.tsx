import { notFound } from 'next/navigation'
import { createClient } from '@/app/lib/supabase/server'
import { verifySession } from '@/app/lib/dal'
import { PageHeader } from '@/components/shared/page-header'
import { AnnotationEditor } from '@/components/annotation/annotation-editor'
import { preAnnotateImage } from '@/app/actions/pre-annotate'
import { isActionResult } from '@/app/lib/action-result'
import type { ImageAnnotation, InspectionImage } from '@/app/types'

export const dynamic = 'force-dynamic'

/**
 * Annotation editor.
 *
 * The first visit to an unlabelled image runs the heuristic once so the engineer
 * corrects candidates instead of drawing from scratch. Zero candidates is a
 * valid result and is not treated as a failure.
 */
export default async function AnnotateImagePage({ params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params
  const { role } = await verifySession()
  const supabase = await createClient()

  const { data: imageRow, error: imageError } = await supabase
    .from('inspection_images')
    .select('*')
    .eq('id', imageId)
    .maybeSingle()

  if (imageError) throw imageError
  if (!imageRow) notFound()
  const image = imageRow as InspectionImage

  const { data: annotationRows } = await supabase
    .from('image_annotations')
    .select('*')
    .eq('image_id', imageId)
    .order('created_at', { ascending: true })

  let annotations = (annotationRows ?? []) as ImageAnnotation[]

  if (annotations.length === 0) {
    try {
      const result = await preAnnotateImage(imageId)
      if (isActionResult(result) && result.ok && result.data.created > 0) {
        const { data: refreshed } = await supabase
          .from('image_annotations')
          .select('*')
          .eq('image_id', imageId)
          .order('created_at', { ascending: true })
        annotations = (refreshed ?? []) as ImageAnnotation[]
      }
    } catch {
      // Suggestions are an accelerator; their absence must not block the editor.
    }
  }

  const bucket = image.storage_bucket || 'inspection-images'
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(image.storage_path, 3600)

  const { data: siblings } = await supabase
    .from('inspection_images')
    .select('id')
    .eq('inspection_id', image.inspection_id)
    .order('uploaded_at', { ascending: true })

  const ids = ((siblings ?? []) as { id: string }[]).map((row) => row.id)
  const index = ids.indexOf(image.id)
  const nextImageId = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Annotate — ${image.caption || 'Inspection image'}`}
        description="Mark defects, measure crack widths where scale is known, and submit for engineering review."
      />

      {signed?.signedUrl ? (
        <AnnotationEditor
          image={image}
          imageUrl={signed.signedUrl}
          initialAnnotations={annotations}
          role={role}
          nextImageId={nextImageId}
        />
      ) : (
        <p className="rounded-lg border border-[#EAEAEA] bg-white p-4 text-sm font-medium text-slate-600">
          The stored image could not be opened. Its storage object may have been removed.
        </p>
      )}
    </div>
  )
}
