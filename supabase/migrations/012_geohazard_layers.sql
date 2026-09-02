-- =================================================================
-- Migration 012: Geohazard Layer Management
-- Extends geospatial_zones with file upload source metadata and lifecycle
-- =================================================================

ALTER TABLE public.geospatial_zones
ADD COLUMN IF NOT EXISTS source_file text,
ADD COLUMN IF NOT EXISTS source_format text CHECK (source_format IN ('geojson','shapefile','kml','manual')),
ADD COLUMN IF NOT EXISTS effective_date date,
ADD COLUMN IF NOT EXISTS expiry_date date,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Ensure RLS allows admin management of geospatial zones
DROP POLICY IF EXISTS "admin_manage_geospatial_zones" ON public.geospatial_zones;
CREATE POLICY "admin_manage_geospatial_zones" ON public.geospatial_zones FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- Ensure all authenticated roles can view active geospatial zones
DROP POLICY IF EXISTS "authenticated_select_geospatial_zones" ON public.geospatial_zones;
CREATE POLICY "authenticated_select_geospatial_zones" ON public.geospatial_zones FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS geospatial_zones_is_active_idx ON public.geospatial_zones(is_active);
CREATE INDEX IF NOT EXISTS geospatial_zones_source_format_idx ON public.geospatial_zones(source_format);
