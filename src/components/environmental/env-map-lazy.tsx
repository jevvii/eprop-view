'use client'

import dynamic from 'next/dynamic'

export const EnvMap = dynamic(
  () => import('./env-map').then((mod) => mod.EnvMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse rounded-2xl bg-slate-100" aria-hidden="true" />
    ),
  }
)
