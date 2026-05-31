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
  const [isStyleLoaded, setIsStyleLoaded] = useState(false)
  const hasFocusedRef = useRef(false)

  const { data: zones } = useGeospatialZones()
  const { data: projects } = useProjects()

  // 1. Initialize Map (Strictly Once)
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
      antialias: true,
      trackResize: true
    })

    map.current.on('style.load', () => {
      const m = map.current
      if (!m) return

      // Initialize persistent sources
      m.addSource('risk-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })

      m.addLayer({
        id: 'risk-zones-fill',
        type: 'fill',
        source: 'risk-zones',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.35
        }
      })

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

  // 2. Sync Data & Camera
  useEffect(() => {
    const m = map.current
    if (!m || !isStyleLoaded) return

    // --- CAMERA FOCUS ---
    if (projects && projects.length > 0 && !hasFocusedRef.current) {
      const p = projects[0]
      if (p.longitude && p.latitude) {
        m.flyTo({
          center: [p.longitude, p.latitude],
          zoom: 14.2,
          speed: 1.2,
          essential: true
        })
        hasFocusedRef.current = true
      }
    }

    // --- MARKERS ---
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

    // --- ZONE DATA (FeatureCollection) ---
    const source = m.getSource('risk-zones') as mapboxgl.GeoJSONSource
    if (source) {
      const features = (zones || [])
        .filter(z => z.geom && (z.geom.type === 'Polygon' || z.geom.type === 'MultiPolygon'))
        .map(z => ({
          type: 'Feature',
          geometry: z.geom,
          properties: {
            color: riskColors[z.risk_level] || '#94a3b8'
          }
        }))
      
      source.setData({
        type: 'FeatureCollection',
        features: features as any
      })
    }
  }, [isStyleLoaded, projects, zones])

  if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-widest border border-dashed border-slate-200 rounded-[2rem]">
        Mapbox Access Token Required
      </div>
    )
  }

  return <div ref={mapContainer} className="w-full h-full" />
}
