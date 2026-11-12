import { Skeleton, SkeletonMap, SkeletonPageHeader } from '@/components/ui/skeleton'

export default function EnvironmentalLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
        <SkeletonMap className="h-[420px]" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-16 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
