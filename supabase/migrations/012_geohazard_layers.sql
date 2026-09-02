-- =================================================================
-- Migration 012: Geohazard Layer Management
-- Extends geospatial_zones with file upload source metadata and lifecycle
-- Supports multi-geometry types (Polygon, MultiPolygon, LineString)
-- and upsert deduplication
-- =================================================================

-- Allow regional geohazard layers that are not tied to a single project
ALTER TABLE public.geospatial_zones
  ALTER COLUMN project_id DROP NOT NULL;

-- Broaden geometry constraint to accept LineStrings (fault lines) and MultiPolygons
ALTER TABLE public.geospatial_zones
  ALTER COLUMN geom TYPE geometry(Geometry, 4326);

-- Add metadata and lifecycle columns
ALTER TABLE public.geospatial_zones
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS source_format text CHECK (source_format IN ('geojson','shapefile','kml','manual')),
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Deduplication unique index for idempotent layer imports
CREATE UNIQUE INDEX IF NOT EXISTS geospatial_zones_proj_name_type_idx 
  ON public.geospatial_zones (COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), name, zone_type);

CREATE INDEX IF NOT EXISTS geospatial_zones_is_active_idx ON public.geospatial_zones(is_active);
CREATE INDEX IF NOT EXISTS geospatial_zones_source_format_idx ON public.geospatial_zones(source_format);

-- Clean up any redundant duplicate policies since 009_rbac_enforcement.sql
-- already defines zones_select_authenticated and zones_admin_all
DROP POLICY IF EXISTS "authenticated_select_geospatial_zones" ON public.geospatial_zones;
DROP POLICY IF EXISTS "admin_manage_geospatial_zones" ON public.geospatial_zones;

-- Function to import or update geospatial zones from GeoJSON geometries safely
CREATE OR REPLACE FUNCTION public.upsert_geospatial_zone(
  p_project_id uuid,
  p_name text,
  p_zone_type text,
  p_risk_level text,
  p_geojson text,
  p_description text DEFAULT '',
  p_source_file text DEFAULT NULL,
  p_source_format text DEFAULT 'geojson',
  p_effective_date date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_geom geometry;
  v_id uuid;
BEGIN
  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson), 4326);

  INSERT INTO public.geospatial_zones (
    project_id, name, zone_type, risk_level, geom, description,
    source_file, source_format, effective_date, is_active
  ) VALUES (
    p_project_id, p_name, p_zone_type, p_risk_level, v_geom, p_description,
    p_source_file, p_source_format, p_effective_date, true
  )
  ON CONFLICT (COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), name, zone_type)
  DO UPDATE SET
    geom = EXCLUDED.geom,
    risk_level = EXCLUDED.risk_level,
    description = EXCLUDED.description,
    source_file = EXCLUDED.source_file,
    source_format = EXCLUDED.source_format,
    effective_date = EXCLUDED.effective_date,
    is_active = true
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
