import { Skeleton, SkeletonPageHeader } from '@/components/ui/skeleton'

export default function DocumentLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <SkeletonPageHeader />
      <Skeleton className="h-11 w-full max-w-2xl rounded-lg" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="mt-3 h-3 w-1/2" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-3 h-24 w-full" />
              <Skeleton className="mt-3 h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
