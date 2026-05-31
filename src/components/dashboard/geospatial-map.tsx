"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useGeospatialZones, useProjects } from "@/app/lib/queries";

const riskColors: Record<string, string> = {
    zone_a: "#ef4444", // Red
    zone_b: "#fbbf24", // Amber
    zone_c: "#10b981", // Emerald
};

// Frame-by-frame jumpTo gives the same visual smoothness as flyTo/easeTo
// but completely avoids the Mapbox v3.x tile-loading blank-out bug that
// strikes when animated zoom completes at the destination.
function animateJumpTo(
    m: mapboxgl.Map,
    target: [number, number],
    targetZoom: number,
    durationMs: number,
) {
    const startCenter = m.getCenter();
    const startZoom = m.getZoom();
    const startTime = performance.now();

    const frame = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        // easeOutCubic for a natural deceleration feel
        const eased = 1 - Math.pow(1 - t, 3);

        const lng = startCenter.lng + (target[0] - startCenter.lng) * eased;
        const lat = startCenter.lat + (target[1] - startCenter.lat) * eased;
        const zoom = startZoom + (targetZoom - startZoom) * eased;

        m.jumpTo({ center: [lng, lat], zoom });

        if (t < 1) {
            requestAnimationFrame(frame);
        } else {
            // Final resize forces Mapbox to confirm tile coverage at the new
            // zoom — this was the proven stabiliser in the non-animated version.
            m.resize();
        }
    };

    requestAnimationFrame(frame);
}

export function GeospatialMap() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const [isStyleLoaded, setIsStyleLoaded] = useState(false);
    const hasFocusedRef = useRef(false);

    const { data: zones } = useGeospatialZones();
    const { data: projects } = useProjects();

    // 1. Initialize Map (Strictly Once)
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (!token) return;

        mapboxgl.accessToken = token;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/light-v11",
            center: [121.0484, 14.6507],
            zoom: 11,
            antialias: true,
            trackResize: true,
            preserveDrawingBuffer: true,
            failIfMajorPerformanceCaveat: false,
        });

        map.current.on("style.load", () => {
            const m = map.current;
            if (!m) return;

            // Single persistent GeoJSON source — data updates via setData only,
            // never recreating layers. This is the architecture that stayed stable.
            m.addSource("risk-zones", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });

            // Insert the translucent fill BEFORE road layers so streets and labels
            // render crisply on top of the zones instead of being fogged underneath.
            const style = m.getStyle();
            const firstOverlayLayer = style?.layers?.find(
                (l) =>
                    l.id.startsWith("road-") ||
                    l.id.startsWith("bridge-") ||
                    l.id.startsWith("tunnel-") ||
                    l.id.startsWith("poi-"),
            );
            const beforeId = firstOverlayLayer?.id;

            m.addLayer(
                {
                    id: "risk-zones-fill",
                    type: "fill",
                    source: "risk-zones",
                    paint: {
                        "fill-color": ["get", "color"],
                        "fill-opacity": 0.35,
                    },
                },
                beforeId,
            );

            setIsStyleLoaded(true);
        });

        const resizeObserver = new ResizeObserver(() => {
            map.current?.resize();
        });
        resizeObserver.observe(mapContainer.current);

        return () => {
            resizeObserver.disconnect();
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // 2. Sync Markers
    useEffect(() => {
        const m = map.current;
        if (!m || !isStyleLoaded || !projects) return;

        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];

        projects.forEach((p) => {
            if (p.latitude && p.longitude) {
                const marker = new mapboxgl.Marker({ color: "#346BDA" })
                    .setLngLat([p.longitude, p.latitude])
                    .setPopup(
                        new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2">
              <div class="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Active Project</div>
              <div class="font-koulen text-lg text-primary tracking-wide">${p.name}</div>
            </div>
          `),
                    )
                    .addTo(m);
                markersRef.current.push(marker);
            }
        });
    }, [isStyleLoaded, projects]);

    // 3. Sync Zone Data
    useEffect(() => {
        const m = map.current;
        if (!m || !isStyleLoaded) return;

        const source = m.getSource("risk-zones") as mapboxgl.GeoJSONSource;
        if (!source) return;

        const features = (zones || [])
            .filter(
                (z) =>
                    z.geom &&
                    (z.geom.type === "Polygon" ||
                        z.geom.type === "MultiPolygon"),
            )
            .map((z) => ({
                type: "Feature",
                geometry: z.geom,
                properties: {
                    color: riskColors[z.risk_level] || "#94a3b8",
                },
            }));

        source.setData({
            type: "FeatureCollection",
            features: features as any,
        });
    }, [isStyleLoaded, zones]);

    // 4. Camera Focus — custom frame animation for smooth zoom without flyTo
    useEffect(() => {
        const m = map.current;
        if (!m || !isStyleLoaded) return;
        if (!projects || projects.length === 0 || hasFocusedRef.current) return;
        if (zones === undefined) return;

        const p = projects[0];
        const lng = p.longitude;
        const lat = p.latitude;
        if (lng == null || lat == null) return;

        hasFocusedRef.current = true;

        const timer = setTimeout(() => {
            animateJumpTo(m, [lng, lat], 13.6, 1000);
        }, 400);

        return () => clearTimeout(timer);
    }, [isStyleLoaded, projects, zones]);

    if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-widest border border-dashed border-slate-200 rounded-[2rem]">
                Mapbox Access Token Required
            </div>
        );
    }

    return <div ref={mapContainer} className="w-full h-full" />;
}
