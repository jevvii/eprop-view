import { Skeleton, SkeletonCard, SkeletonPageHeader } from '@/components/ui/skeleton'

export default function ProfileLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="max-w-2xl space-y-5">
      <SkeletonPageHeader actions={false} />
      <SkeletonCard lines={5} />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}
