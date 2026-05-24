'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useGeospatialZones, useProjects } from '@/app/lib/queries'

export function GeospatialMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const addedLayersRef = useRef<{ sourceId: string; layerId: string }[]>([])
  const styleReadyRef = useRef(false)
  const { data: zones, isError: zonesError } = useGeospatialZones()
  const { data: projects, isError: projectsError } = useProjects()

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (!token) {
      throw new Error('Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN')
    }
    mapboxgl.accessToken = token

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [121.0437, 14.6760], // Quezon City
      zoom: 14,
    })

    map.current.on('load', () => {
      styleReadyRef.current = true
    })

    return () => {
      map.current?.remove()
      map.current = null
      styleReadyRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!map.current || !zones) return

    const updateLayers = () => {
      // Clear previous markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      // Clear previous layers/sources
      addedLayersRef.current.forEach(({ sourceId, layerId }) => {
        if (map.current!.getLayer(layerId)) map.current!.removeLayer(layerId)
        if (map.current!.getSource(sourceId)) map.current!.removeSource(sourceId)
      })
      addedLayersRef.current = []

      zones.forEach((zone) => {
        const sourceId = `zone-${zone.id}`
        const layerId = `zone-layer-${zone.id}`

        const colors: Record<string, string> = {
          fault_line: '#dc2626',
          liquefaction: '#f97316',
          erosion: '#eab308',
          flood: '#3b82f6',
          general: '#6366f1',
        }

        if (zone.coordinates?.length > 0) {
          const geojson = {
            type: 'Feature' as const,
            geometry: {
              type: 'Polygon' as const,
              coordinates: [zone.coordinates],
            },
            properties: {},
          }

          if (!map.current!.getSource(sourceId)) {
            map.current!.addSource(sourceId, { type: 'geojson', data: geojson })
            map.current!.addLayer({
              id: layerId,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': colors[zone.zone_type] || '#94a3b8',
                'fill-opacity': 0.3,
              },
            })
            addedLayersRef.current.push({ sourceId, layerId })
          }
        }
      })

      projects?.forEach((project) => {
        if (project.latitude && project.longitude) {
          const marker = new mapboxgl.Marker({ color: '#2563eb' })
            .setLngLat([project.longitude, project.latitude])
            .setPopup(new mapboxgl.Popup().setHTML(`<strong>${project.name}</strong>`))
            .addTo(map.current!)
          markersRef.current.push(marker)
        }
      })
    }

    if (styleReadyRef.current || map.current.isStyleLoaded()) {
      updateLayers()
    } else {
      map.current.once('load', updateLayers)
    }
  }, [zones, projects])

  if (zonesError || projectsError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load map data
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg">
      <h3 className="text-sm font-bold text-slate-900 mb-4 tracking-wide">GEOSPATIAL RISK SCORE ASSESSMENT OVERVIEW</h3>
      <div ref={mapContainer} className="w-full h-80 rounded-xl overflow-hidden border border-slate-200" />
    </div>
  )
}
