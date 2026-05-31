'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useGeospatialZones, useRiskHotspots } from '@/app/lib/queries'
import type { RiskHotspot } from '@/app/types'
import { StatusBadge } from '@/components/shared/status-badge'

type EnvMapProps = {
  projectId: string
  center?: [number, number]
}

const zoneColors: Record<string, string> = {
  fault_line: '#dc2626',
  liquefaction: '#f97316',
  erosion: '#eab308',
  flood: '#3b82f6',
  general: '#6366f1',
}

function hotspotColor(severity: RiskHotspot['severity']) {
  if (severity === 'critical') return '#dc2626'
  if (severity === 'moderate') return '#f59e0b'
  return '#22c55e'
}

export function EnvMap({ projectId, center }: EnvMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const addedLayersRef = useRef<{ sourceId: string; layerId: string }[]>([])
  const styleReadyRef = useRef(false)
  const [tokenMissing, setTokenMissing] = useState(false)

  const { data: zones, isError: zonesError } = useGeospatialZones(projectId)
  const { data: hotspots, isError: hotspotsError } = useRiskHotspots(projectId)

  const mapCenter = useMemo<[number, number]>(() => {
    if (center) return center
    return [121.0437, 14.676]
  }, [center])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (!token) {
      setTokenMissing(true)
      return
    }
    mapboxgl.accessToken = token

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: mapCenter,
      zoom: 13,
    })

    map.current.on('load', () => {
      styleReadyRef.current = true
    })

    return () => {
      map.current?.remove()
      map.current = null
      styleReadyRef.current = false
    }
  }, [mapCenter])

  useEffect(() => {
    if (!map.current || !center) return
    map.current.flyTo({ center, zoom: 13, essential: true })
  }, [center])

  useEffect(() => {
    if (!map.current || !zones) return

    const updateLayers = () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []

      addedLayersRef.current.forEach(({ sourceId, layerId }) => {
        if (map.current?.getLayer(layerId)) map.current.removeLayer(layerId)
        if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId)
      })
      addedLayersRef.current = []

      zones.forEach((zone) => {
        const sourceId = `env-zone-${zone.id}`
        const layerId = `env-zone-layer-${zone.id}`

        if (zone.coordinates?.length > 0 && map.current && !map.current.getSource(sourceId)) {
          const geojson = {
            type: 'Feature' as const,
            geometry: {
              type: 'Polygon' as const,
              coordinates: [zone.coordinates],
            },
            properties: {},
          }

          map.current.addSource(sourceId, { type: 'geojson', data: geojson })
          map.current.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': zoneColors[zone.zone_type] ?? '#94a3b8',
              'fill-opacity': 0.28,
            },
          })
          addedLayersRef.current.push({ sourceId, layerId })
        }
      })

      hotspots?.forEach((hotspot) => {
        if (hotspot.latitude && hotspot.longitude && map.current) {
          const marker = new mapboxgl.Marker({ color: hotspotColor(hotspot.severity) })
            .setLngLat([hotspot.longitude, hotspot.latitude])
            .setPopup(new mapboxgl.Popup().setHTML(`<strong>${hotspot.title}</strong><br/>${hotspot.description}`))
            .addTo(map.current)
          markersRef.current.push(marker)
        }
      })
    }

    if (styleReadyRef.current || map.current.isStyleLoaded()) {
      updateLayers()
    } else {
      map.current.once('load', updateLayers)
    }
  }, [zones, hotspots])

  if (tokenMissing) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-amber-700">
        Mapbox token is missing. Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the map.
      </div>
    )
  }

  if (zonesError || hotspotsError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load environmental map data
      </div>
    )
  }

  return (
    <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col h-full min-h-[500px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Geospatial Hazards</h3>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Multi-layer risk visualization.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status="fault_line" label="Fault" />
          <StatusBadge status="liquefaction" label="Liquefaction" />
          <StatusBadge status="erosion" label="Erosion" />
          <StatusBadge status="flood" label="Flood" />
        </div>
      </div>
      <div ref={mapContainer} className="flex-1 rounded-[1.8rem] overflow-hidden border border-slate-100 shadow-inner" />
    </div>
  )
}
