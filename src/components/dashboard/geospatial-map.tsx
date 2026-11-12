"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useGeospatialZones, useProjects, useRiskHotspots, useSettlementOverview } from "@/app/lib/queries";

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

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case '&': return '&amp;'
            case '<': return '&lt;'
            case '>': return '&gt;'
            case '"': return '&quot;'
            default: return '&#39;'
        }
    })
}

export function GeospatialMap() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const [isStyleLoaded, setIsStyleLoaded] = useState(false);
    const hasFocusedRef = useRef(false);

    const { data: zones } = useGeospatialZones();
    const { data: projects } = useProjects();
    const { data: hotspots } = useRiskHotspots();
    const {data: movements}=useSettlementOverview();
    // Heatmap is on by default: the density of recorded problems is the first
    // thing the dashboard map should say. The toggle remains for a clean view.
    const [showHeatmap, setShowHeatmap] = useState(true);

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
                    filter: ["==", ["geometry-type"], "Polygon"],
                    paint: {
                        "fill-color": ["get", "color"],
                        "fill-opacity": 0.35,
                    },
                },
                beforeId,
            );

            m.addLayer(
                {
                    id: "risk-zones-line",
                    type: "line",
                    source: "risk-zones",
                    filter: ["==", ["geometry-type"], "LineString"],
                    paint: {
                        "line-color": ["get", "color"],
                        "line-width": 3.5,
                        "line-opacity": 0.85,
                    },
                },
                beforeId,
            );

            // Risk density heatmap. Fed from hotspots only, so it measures where
            // problems have actually been recorded rather than where polygons exist.
            m.addSource("risk-heat", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });

            m.addLayer(
                {
                    id: "risk-heatmap",
                    type: "heatmap",
                    source: "risk-heat",
                    layout: { visibility: "visible" },
                    paint: {
                        "heatmap-weight": ["get", "weight"],
                        "heatmap-intensity": 0.9,
                        "heatmap-radius": 48,
                        "heatmap-opacity": 0.6,
                        "heatmap-color": [
                            "interpolate", ["linear"], ["heatmap-density"],
                            0, "rgba(16,185,129,0)",
                            0.25, "rgba(16,185,129,0.5)",
                            0.5, "rgba(251,191,36,0.7)",
                            0.75, "rgba(239,68,68,0.8)",
                            1, "rgba(127,29,29,0.9)",
                        ],
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
              <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Active Project</div>
              <div class="font-koulen text-lg text-primary tracking-wide">${escapeHtml(p.name)}</div>
            </div>
          `),
                    )
                    .addTo(m);
                markersRef.current.push(marker);
            }
        });
    }, [isStyleLoaded, projects]);

    useEffect(()=>{
        if(!map.current||!isStyleLoaded)return;
        const markers=(movements??[]).filter(row=>row.classification!=='none'&&row.latitude!=null&&row.longitude!=null).map(row=>
            new mapboxgl.Marker({color:row.classification==='action_required'?'#b91c1c':'#b45309'})
            .setLngLat([row.longitude!,row.latitude!])
            .setPopup(new mapboxgl.Popup({offset:20}).setText(`${row.building_name}: ${row.classification.replaceAll('_',' ')}. Tilt ${row.tilt_mm_per_m??'not measured'} mm/m; settlement ${row.differential_settlement_mm??'not measured'} mm. Recorded ${new Date(row.observed_at).toLocaleDateString()}.`))
            .addTo(map.current!));
        return()=>markers.forEach(marker=>marker.remove());
    },[isStyleLoaded,movements]);

    // 3. Sync Zone Data
    useEffect(() => {
        const m = map.current;
        if (!m || !isStyleLoaded) return;

        const source = m.getSource("risk-zones") as mapboxgl.GeoJSONSource;
        if (!source) return;

        const features = (zones || [])
            .filter(
                (z) =>
                    z.is_active !== false &&
                    z.geom &&
                    (z.geom.type === "Polygon" ||
                        z.geom.type === "MultiPolygon" ||
                        z.geom.type === "LineString" ||
                        z.geom.type === "MultiLineString"),
            )
            .map((z) => ({
                type: "Feature",
                geometry: z.geom,
                properties: {
                    color: z.zone_type === 'fault_line' ? '#dc2626' : (riskColors[z.risk_level] || "#94a3b8"),
                },
            }));

        source.setData({
            type: "FeatureCollection",
            features: features as any,
        });
    }, [isStyleLoaded, zones]);

    // 4. Sync heatmap data from recorded hotspots.
    useEffect(() => {
        const m = map.current;
        if (!m || !isStyleLoaded) return;

        const source = m.getSource("risk-heat") as mapboxgl.GeoJSONSource | undefined;
        if (!source) return;

        const features = (hotspots ?? [])
            .filter(
                (hotspot) =>
                    typeof hotspot.latitude === "number" && typeof hotspot.longitude === "number",
            )
            .map((hotspot) => ({
                type: "Feature" as const,
                geometry: {
                    type: "Point" as const,
                    coordinates: [hotspot.longitude as number, hotspot.latitude as number],
                },
                properties: {
                    weight:
                        hotspot.severity === "critical"
                            ? 1
                            : hotspot.severity === "moderate"
                              ? 0.6
                              : 0.3,
                },
            }));

        source.setData({ type: "FeatureCollection", features } as never);
    }, [isStyleLoaded, hotspots]);

    // 5. Heatmap visibility toggle.
    useEffect(() => {
        const m = map.current;
        if (!m || !isStyleLoaded) return;
        if (m.getLayer("risk-heatmap")) {
            m.setLayoutProperty("risk-heatmap", "visibility", showHeatmap ? "visible" : "none");
        }
    }, [isStyleLoaded, showHeatmap]);

    // 6. Camera Focus — custom frame animation for smooth zoom without flyTo
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
            <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-black text-slate-500 border border-dashed border-slate-200 rounded-lg">
                Mapbox Access Token Required
            </div>
        );
    }

    const hasCoordinates = (projects ?? []).some(
        (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number'
    )

    return (
        <div className="relative h-full w-full">
            <div ref={mapContainer} className="h-full w-full" />
            <button
                type="button"
                onClick={() => setShowHeatmap((current) => !current)}
                aria-pressed={showHeatmap}
 className={`absolute bottom-4 right-4 z-10 rounded-lg border px-3 py-2 text-[11px] font-bold transition-colors min-h-[40px] ${
                    showHeatmap
                        ? "bg-primary text-white border-primary"
                        : "bg-white/95 text-slate-700 border-slate-200 hover:bg-white"
                }`}
            >
                Risk heatmap
            </button>
            {showHeatmap && (hotspots ?? []).length === 0 && (
                <div className="pointer-events-none absolute bottom-16 right-4 z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] font-medium text-slate-600 max-w-[220px]">
                    No hotspots recorded yet, so the heatmap is empty.
                </div>
            )}
            {projects !== undefined && !hasCoordinates && (
                <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:right-auto rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-700">
                    No project coordinates yet — showing the regional default extent.
                </div>
            )}
        </div>
    );
}
