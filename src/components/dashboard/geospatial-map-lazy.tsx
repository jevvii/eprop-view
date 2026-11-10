'use client'

import dynamic from 'next/dynamic'

/**
 * Mapbox GL is ~450 KB gzip and only needed once the map enters the page.
 * Loading it as a separate chunk keeps it out of the route's initial JS.
 */
export const GeospatialMap = dynamic(
  () => import('./geospatial-map').then((mod) => mod.GeospatialMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-slate-100" aria-hidden="true" />
    ),
  }
)
