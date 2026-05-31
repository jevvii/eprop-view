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
      setIsMapReady(true)
    })

    // Handle container resize
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

  useEffect(() => {
    if (!map.current || !isMapReady || (!zones && !projects)) return

    const updateLayers = () => {
      if (!map.current) return

      // Center map on the first project if available
      if (projects && projects.length > 0 && projects[0].longitude && projects[0].latitude) {
        map.current.flyTo({
          center: [projects[0].longitude, projects[0].latitude],
          zoom: 14.2,
          speed: 1.5,
          curve: 1.42,
          essential: true
        })
      }

      // Clear existing markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      // Clear existing layers
      addedLayersRef.current.forEach(({ sourceId, layerId }) => {
        if (map.current?.getLayer(layerId)) map.current.removeLayer(layerId)
        if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId)
      })
      addedLayersRef.current = []

      zones?.forEach((zone) => {
        if (zone.geom && zone.geom.type === 'Polygon') {
          const sourceId = `source-${zone.id}`
          const layerId = `layer-${zone.id}`

          if (!map.current!.getSource(sourceId)) {
            map.current!.addSource(sourceId, {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: zone.geom,
              },
            })

            map.current!.addLayer({
              id: layerId,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': riskColors[zone.risk_level] || '#94a3b8',
                'fill-opacity': 0.3,
              },
            })
            addedLayersRef.current.push({ sourceId, layerId })
          }
        }
      })

      projects?.forEach((project) => {
        if (project.latitude && project.longitude) {
          const marker = new mapboxgl.Marker({ color: '#346BDA' })
            .setLngLat([project.longitude, project.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
              <div class="p-2">
                <div class="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Active Project</div>
                <div class="font-koulen text-lg text-primary tracking-wide">${project.name}</div>
              </div>
            `))
            .addTo(map.current!)
          markersRef.current.push(marker)
        }
      })
    }

    if (map.current.isStyleLoaded()) {
      updateLayers()
    } else {
      map.current.once('idle', updateLayers)
    }
  }, [zones, projects])

  if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-widest border border-dashed border-slate-200 rounded-[2rem]">
        Mapbox Access Token Required
      </div>
    )
  }

  if (zonesError || projectsError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-red-50 text-xs font-black text-red-400 uppercase tracking-widest rounded-[2rem]">
        Telemetry Error: Unable to sync geospatial data
      </div>
    )
  }

  return <div ref={mapContainer} className="w-full h-full" />
}
