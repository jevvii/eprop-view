import { Skeleton, SkeletonCard, SkeletonPageHeader } from '@/components/ui/skeleton'

export default function ReportWorkbenchLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <SkeletonPageHeader />
      <SkeletonCard lines={6} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
