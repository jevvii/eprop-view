import { Skeleton, SkeletonPageHeader, SkeletonStatRow, SkeletonTable } from '@/components/ui/skeleton'

export default function ReportsLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <SkeletonPageHeader />
      <Skeleton className="h-12 w-full rounded-lg" />
      <SkeletonStatRow />
      <SkeletonTable rows={7} columns={5} />
    </div>
  )
}
