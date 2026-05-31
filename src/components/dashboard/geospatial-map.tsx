'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useGeospatialZones, useProjects } from '@/app/lib/queries'

const riskColors: Record<string, string> = {
  zone_a: '#ef4444', // Red
  zone_b: '#fbbf24', // Amber
  zone_c: '#10b981', // Emerald
}

export function GeospatialMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const addedLayersRef = useRef<{ sourceId: string; layerId: string }[]>([])
  const [isStyleLoaded, setIsStyleLoaded] = useState(false)
  const hasJumpedRef = useRef(false)

  const { data: zones } = useGeospatialZones()
  const { data: projects } = useProjects()

  // 1. Initialize Map once
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (!token) return

    mapboxgl.accessToken = token

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [121.0484, 14.6507],
      zoom: 11,
      antialias: true
    })

    map.current.on('style.load', () => {
      setIsStyleLoaded(true)
    })

    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize()
    })
    resizeObserver.observe(mapContainer.current)

    return () => {
      resizeObserver.disconnect()
      map.current?.remove()
      map.current = null
    }
  }, [])

  // 2. Initial Jump to Project
  useEffect(() => {
    if (!map.current || !projects || projects.length === 0 || hasJumpedRef.current) return

    const project = projects[0]
    if (project.longitude && project.latitude) {
      map.current.jumpTo({
        center: [project.longitude, project.latitude],
        zoom: 14.2
      })
      hasJumpedRef.current = true
    }
  }, [projects])

  // 3. Sync Markers and Layers
  useEffect(() => {
    if (!map.current || !isStyleLoaded) return

    const syncMap = () => {
      const m = map.current
      if (!m || !m.isStyleLoaded()) return

      // --- Markers ---
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []

      projects?.forEach((p) => {
        if (p.latitude && p.longitude) {
          const marker = new mapboxgl.Marker({ color: '#346BDA' })
            .setLngLat([p.longitude, p.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
              <div class="p-2">
                <div class="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Active Project</div>
                <div class="font-koulen text-lg text-primary tracking-wide">${p.name}</div>
              </div>
            `))
            .addTo(m)
          markersRef.current.push(marker)
        }
      })

      // --- Layers ---
      // Clean up previous layers/sources recorded in our ref
      addedLayersRef.current.forEach(({ sourceId, layerId }) => {
        if (m.getLayer(layerId)) m.removeLayer(layerId)
        if (m.getSource(sourceId)) m.removeSource(sourceId)
      })
      addedLayersRef.current = []

      // Add Zones
      zones?.forEach((zone) => {
        if (zone.geom && (zone.geom.type === 'Polygon' || zone.geom.type === 'MultiPolygon')) {
          const sourceId = `source-${zone.id}`
          const layerId = `layer-${zone.id}`

          // Double check Mapbox internal state to prevent crashes
          if (m.getSource(sourceId)) return

          m.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: zone.geom as any }
          })

          m.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': riskColors[zone.risk_level] || '#94a3b8',
              'fill-opacity': 0.35
            }
          })
          addedLayersRef.current.push({ sourceId, layerId })
        }
      })
    }

    syncMap()

    // Also listen for re-loads (e.g. if style changes or map resets)
    map.current.on('style.load', syncMap)
    return () => {
      map.current?.off('style.load', syncMap)
    }
  }, [isStyleLoaded, projects, zones])

  if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-widest border border-dashed border-slate-200 rounded-[2rem]">
        Mapbox Access Token Required
      </div>
    )
  }

  return <div ref={mapContainer} className="w-full h-full rounded-none" />
}
