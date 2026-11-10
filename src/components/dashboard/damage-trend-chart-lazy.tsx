'use client'

import dynamic from 'next/dynamic'

/** Chart.js (~73 KB gzip) loads in its own chunk instead of the route bundle. */
export const DamageTrendChart = dynamic(
  () => import('./damage-trend-chart').then((mod) => mod.DamageTrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-full animate-pulse rounded-2xl bg-slate-100" aria-hidden="true" />
    ),
  }
)
