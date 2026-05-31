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
  const [isMapReady, setIsMapReady] = useState(false)

  const { data: zones, isError: zonesError } = useGeospatialZones()
  const { data: projects, isError: projectsError } = useProjects()

  // 1. Initialize Map
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (!token) return

    mapboxgl.accessToken = token

    // Determine initial view: check projects if they are already in cache
    const initialProject = projects?.[0]
    const initialCenter: [number, number] = (initialProject?.longitude && initialProject?.latitude)
      ? [initialProject.longitude, initialProject.latitude]
      : [121.0484, 14.6507]
    const initialZoom = initialProject ? 14.2 : 11

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: initialCenter,
      zoom: initialZoom,
      antialias: true
    })

    map.current.on('style.load', () => {
      setIsMapReady(true)
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
  }, [projects]) // Allow re-init if projects arrive early

  // 2. Sync Data (Markers & Layers)
  useEffect(() => {
    if (!map.current || !isMapReady) return

    // Center Logic: If map is initialized wide but projects are now available
    const project = projects?.[0]
    if (project?.longitude && project?.latitude) {
      const currentZoom = map.current.getZoom()
      if (currentZoom < 14) {
        map.current.flyTo({
          center: [project.longitude, project.latitude],
          zoom: 14.2,
          essential: true
        })
      }
    }

    const syncLayers = () => {
      if (!map.current || !map.current.isStyleLoaded()) return

      // Clear
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      addedLayersRef.current.forEach(({ sourceId, layerId }) => {
        if (map.current?.getLayer(layerId)) map.current.removeLayer(layerId)
        if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId)
      })
      addedLayersRef.current = []

      // Add Zones
      zones?.forEach((zone) => {
        if (zone.geom && (zone.geom.type === 'Polygon' || zone.geom.type === 'MultiPolygon')) {
          const sourceId = `source-${zone.id}`
          const layerId = `layer-${zone.id}`
          map.current!.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: zone.geom as any }
          })
          map.current!.addLayer({
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

      // Add Markers
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
            .addTo(map.current!)
          markersRef.current.push(marker)
        }
      })
    }

    syncLayers()
  }, [isMapReady, projects, zones])

  if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-widest border border-dashed border-slate-200 rounded-[2rem]">
        Mapbox Access Token Required
      </div>
    )
  }

  return <div ref={mapContainer} className="w-full h-full" />
}
