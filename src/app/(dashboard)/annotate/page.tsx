import { PageHeader } from '@/components/shared/page-header'
import { AnnotationQueue } from '@/components/annotation/annotation-queue'
import { listAnnotationQueue } from '@/app/actions/annotations'

export const dynamic = 'force-dynamic'

/**
 * Annotation queue.
 *
 * Inspectors see their own captures; engineers and admins see everything.
 * The counts double as a dataset-readiness signal.
 */
export default async function AnnotatePage() {
  const items = await listAnnotationQueue()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Annotate"
        description="Label inspection evidence for model training. Inspectors label their own captures; engineers approve before anything enters a dataset."
      />
      <AnnotationQueue items={items} />
    </div>
  )
}
