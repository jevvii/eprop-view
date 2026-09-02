'use client'

import { useEffect, useRef, useState } from 'react'
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
  const [isStyleLoaded, setIsStyleLoaded] = useState(false)
  const [tokenMissing, setTokenMissing] = useState(false)

  const initialCenterRef = useRef<[number, number]>(center || [121.0437, 14.676])

  const { data: zones, isError: zonesError } = useGeospatialZones(projectId)
  const { data: hotspots, isError: hotspotsError } = useRiskHotspots(projectId)

  // 1. Initialize Map Strictly Once on Mount
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (!token) {
      setTokenMissing(true)
      return
    }
    mapboxgl.accessToken = token

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: initialCenterRef.current,
      zoom: 13,
      antialias: true,
      trackResize: true,
    })
    map.current = m

    m.on('style.load', () => {
      setIsStyleLoaded(true)
    })

    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize()
    })
    if (mapContainer.current) {
      resizeObserver.observe(mapContainer.current)
    }

    return () => {
      resizeObserver.disconnect()
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      m.remove()
      map.current = null
      setIsStyleLoaded(false)
    }
  }, [])

  // 2. Smoothly reposition camera when coordinates numerically change (without destroying the map)
  const centerLng = center?.[0]
  const centerLat = center?.[1]

  useEffect(() => {
    const m = map.current
    if (!m || centerLng == null || centerLat == null) return

    const currentCenter = m.getCenter()
    if (Math.abs(currentCenter.lng - centerLng) > 0.0001 || Math.abs(currentCenter.lat - centerLat) > 0.0001) {
      m.flyTo({ center: [centerLng, centerLat], zoom: 13, essential: true })
    }
  }, [centerLng, centerLat])

  // 3. Synchronize Hazard Zone Layers
  useEffect(() => {
    const m = map.current
    if (!m || !isStyleLoaded) return

    // Clean up existing hazard layers & sources
    addedLayersRef.current.forEach(({ sourceId, layerId }) => {
      if (m.getLayer(layerId)) m.removeLayer(layerId)
      if (m.getSource(sourceId)) m.removeSource(sourceId)
    })
    addedLayersRef.current = []

    if (!zones || zones.length === 0) return

    zones.forEach((zone) => {
      if (zone.is_active === false) return

      const sourceId = `env-zone-${zone.id}`
      const layerId = `env-zone-layer-${zone.id}`

      if (zone.coordinates && zone.coordinates.length > 0 && !m.getSource(sourceId)) {
        const isLine = zone.geom?.type === 'LineString' || zone.zone_type === 'fault_line'
        const geojson = {
          type: 'Feature' as const,
          geometry: isLine
            ? ({
                type: 'LineString' as const,
                coordinates: zone.coordinates,
              })
            : ({
                type: 'Polygon' as const,
                coordinates: [zone.coordinates],
              }),
          properties: {},
        }

        m.addSource(sourceId, { type: 'geojson', data: geojson })

        if (isLine) {
          m.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': zoneColors[zone.zone_type] ?? '#dc2626',
              'line-width': 3.5,
              'line-opacity': 0.85,
            },
          })
        } else {
          m.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': zoneColors[zone.zone_type] ?? '#94a3b8',
              'fill-opacity': 0.28,
            },
          })
        }
        addedLayersRef.current.push({ sourceId, layerId })
      }
    })
  }, [zones, isStyleLoaded])

  // 4. Synchronize Geo Markers (Hotspots & Project Center)
  useEffect(() => {
    const m = map.current
    if (!m || !isStyleLoaded) return

    // Remove old markers
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    // 1. Hotspot markers
    hotspots?.forEach((hotspot) => {
      if (hotspot.latitude && hotspot.longitude) {
        const popupContent = `
          <div style="font-family: sans-serif; padding: 4px;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">
              ${hotspot.title}
            </div>
            <div style="font-size: 10px; color: #64748b; line-height: 1.3;">
              ${hotspot.description || 'Sector Risk Hotspot'}
            </div>
            <div style="margin-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${hotspotColor(hotspot.severity)};">
              Severity: ${hotspot.severity}
            </div>
          </div>
        `
        const marker = new mapboxgl.Marker({ color: hotspotColor(hotspot.severity) })
          .setLngLat([hotspot.longitude, hotspot.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(popupContent))
          .addTo(m)
        markersRef.current.push(marker)
      }
    })

    // 2. Project Site Location pin
    if (centerLng != null && centerLat != null) {
      const sitePopup = `
        <div style="font-family: sans-serif; padding: 4px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #2563eb;">
            Project Site Center
          </div>
          <div style="font-size: 10px; color: #64748b;">
            Active Structural Assessment Boundary
          </div>
        </div>
      `
      const siteMarker = new mapboxgl.Marker({ color: '#2563eb' })
        .setLngLat([centerLng, centerLat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(sitePopup))
        .addTo(m)
      markersRef.current.push(siteMarker)
    }
  }, [hotspots, centerLng, centerLat, isStyleLoaded])

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
