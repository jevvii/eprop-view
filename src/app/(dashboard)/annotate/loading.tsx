import { Skeleton, SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-5">
      <SkeletonPageHeader actions={false} />
      <Skeleton className="h-11 w-72" />
      <SkeletonTable rows={6} columns={3} />
    </div>
  )
}
