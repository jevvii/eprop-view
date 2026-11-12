import { Skeleton, SkeletonPageHeader } from '@/components/ui/skeleton'

export default function ProjectsLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-5 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
            <Skeleton className="mt-5 h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
