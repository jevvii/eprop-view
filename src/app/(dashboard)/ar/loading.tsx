import { Skeleton, SkeletonPageHeader } from '@/components/ui/skeleton'

export default function ARLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_390px]">
        <Skeleton className="h-[380px] w-full rounded-lg sm:h-[520px]" />
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
