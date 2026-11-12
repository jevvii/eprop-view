import { Skeleton, SkeletonChart, SkeletonMap, SkeletonStatRow } from '@/components/ui/skeleton'

/**
 * Mirrors the dashboard's map-canvas composition: stat cards floating over the
 * map, chart docked over the lower edge. Same boxes, so nothing moves on load.
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex min-h-0 flex-col lg:h-full">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative flex min-h-0 flex-1 flex-col">
          <div className="p-4 pb-0 lg:absolute lg:left-1/2 lg:top-5 lg:z-10 lg:w-full lg:max-w-5xl lg:-translate-x-1/2 lg:p-0 lg:px-6">
            <div className="lg:flex lg:justify-center">
              <div className="w-full lg:max-w-3xl">
                <SkeletonStatRow />
              </div>
            </div>
          </div>

          <div className="mx-4 mt-4 h-[340px] sm:h-[420px] lg:m-0 lg:h-auto lg:flex-1">
            <SkeletonMap className="h-full" />
          </div>

          <div className="px-4 py-4 lg:absolute lg:bottom-5 lg:left-1/2 lg:z-10 lg:w-full lg:max-w-4xl lg:-translate-x-1/2 lg:p-0 lg:px-6">
            <SkeletonChart className="h-72 lg:h-64" />
          </div>
        </section>

        <aside className="hidden w-[390px] shrink-0 border-l border-slate-200 bg-white p-4 lg:block">
          <Skeleton className="h-3 w-28" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="mt-2 h-2.5 w-1/3" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
