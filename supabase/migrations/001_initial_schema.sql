-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

-- =================================================================
-- TABLES
-- =================================================================

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'inspector', 'viewer')) DEFAULT 'viewer',
  full_name text DEFAULT '',
  phone text DEFAULT '',
  department text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL DEFAULT '',
  description text DEFAULT '',
  status text NOT NULL CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')) DEFAULT 'active',
  geom geometry(Point, 4326),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lead_inspector_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  inspection_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'requires_followup')) DEFAULT 'pending',
  risk_score float NOT NULL CHECK (risk_score >= 0 AND risk_score <= 10),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  location text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE inspection_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text DEFAULT '',
  uploaded_at timestamptz DEFAULT now()
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text UNIQUE NOT NULL,
  title text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES inspections(id) ON DELETE SET NULL,
  date date NOT NULL,
  location text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('open', 'in_review', 'critical', 'completed')) DEFAULT 'open',
  lead_inspector_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  risk_score float NOT NULL CHECK (risk_score >= 0 AND risk_score <= 10),
  key_findings text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE environmental_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  fault_line_proximity text NOT NULL CHECK (fault_line_proximity IN ('none', 'low', 'moderate', 'high', 'very_high')) DEFAULT 'none',
  soil_liquefaction_risk text NOT NULL CHECK (soil_liquefaction_risk IN ('zone_a', 'zone_b', 'zone_c', 'none')) DEFAULT 'zone_c',
  erosion_potential text NOT NULL CHECK (erosion_potential IN ('severe', 'moderate', 'low', 'negligible')) DEFAULT 'low',
  overall_risk_score float NOT NULL CHECK (overall_risk_score >= 0 AND overall_risk_score <= 10) DEFAULT 0,
  additional_analysis text DEFAULT '',
  assessed_date date DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE risk_hotspots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'moderate', 'low')),
  description text DEFAULT '',
  position_x float NOT NULL CHECK (position_x >= 0 AND position_x <= 100),
  position_y float NOT NULL CHECK (position_y >= 0 AND position_y <= 100),
  geom geometry(Point, 4326),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE maintenance_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  location text NOT NULL DEFAULT '',
  risk_score float NOT NULL CHECK (risk_score >= 0 AND risk_score <= 10),
  status text NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'deferred')) DEFAULT 'pending',
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  due_date date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE damage_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date date NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'moderate', 'low')),
  value float NOT NULL CHECK (value >= 0),
  notes text DEFAULT '',
  UNIQUE (project_id, date, severity)
);

CREATE TABLE geospatial_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  zone_type text NOT NULL CHECK (zone_type IN ('fault_line', 'liquefaction', 'erosion', 'flood', 'general')),
  risk_level text NOT NULL CHECK (risk_level IN ('zone_a', 'zone_b', 'zone_c')),
  geom geometry(Polygon, 4326),
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- =================================================================
-- SPATIAL INDEXES
-- =================================================================
CREATE INDEX projects_geom_idx ON projects USING GIST (geom);
CREATE INDEX risk_hotspots_geom_idx ON risk_hotspots USING GIST (geom);
CREATE INDEX geospatial_zones_geom_idx ON geospatial_zones USING GIST (geom);

-- =================================================================
-- ROW LEVEL SECURITY
-- =================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE environmental_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_hotspots ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE geospatial_zones ENABLE ROW LEVEL SECURITY;

-- Admin: full access to all tables
CREATE POLICY "admin_all_profiles" ON profiles FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_projects" ON projects FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_inspections" ON inspections FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_inspection_images" ON inspection_images FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_reports" ON reports FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_env_risks" ON environmental_risks FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_hotspots" ON risk_hotspots FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_maintenance" ON maintenance_priorities FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_trends" ON damage_trends FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "admin_all_zones" ON geospatial_zones FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');

-- Viewer: read-only on all tables
CREATE POLICY "viewer_select_profiles" ON profiles FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_projects" ON projects FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_inspections" ON inspections FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_images" ON inspection_images FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_reports" ON reports FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_env_risks" ON environmental_risks FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_hotspots" ON risk_hotspots FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_maintenance" ON maintenance_priorities FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_trends" ON damage_trends FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');
CREATE POLICY "viewer_select_zones" ON geospatial_zones FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'viewer');

-- Inspector: read all, write operational tables
CREATE POLICY "inspector_select_profiles" ON profiles FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'inspector');
CREATE POLICY "inspector_select_projects" ON projects FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'inspector');
CREATE POLICY "inspector_select_zones" ON geospatial_zones FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'inspector');

CREATE POLICY "inspector_all_inspections" ON inspections FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'inspector') WITH CHECK (auth.jwt() ->> 'role' = 'inspector');
CREATE POLICY "inspector_all_images" ON inspection_images FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'inspector') WITH CHECK (auth.jwt() ->> 'role' = 'inspector');
CREATE POLICY "inspector_all_reports" ON reports FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'inspector') WITH CHECK (auth.jwt() ->> 'role' = 'inspector');
CREATE POLICY "inspector_all_env_risks" ON environmental_risks FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'inspector') WITH CHECK (auth.jwt() ->> 'role' = 'inspector');
CREATE POLICY "inspector_all_hotspots" ON risk_hotspots FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'inspector') WITH CHECK (auth.jwt() ->> 'role' = 'inspector');
CREATE POLICY "inspector_all_maintenance" ON maintenance_priorities FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'inspector') WITH CHECK (auth.jwt() ->> 'role' = 'inspector');
CREATE POLICY "inspector_all_trends" ON damage_trends FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'inspector') WITH CHECK (auth.jwt() ->> 'role' = 'inspector');

-- =================================================================
-- DATABASE FUNCTIONS
-- =================================================================

-- Auto-calculate risk_level from risk_score
CREATE OR REPLACE FUNCTION calculate_risk_level()
RETURNS trigger AS $$
BEGIN
  IF NEW.risk_score > 8.0 THEN
    NEW.risk_level := 'critical';
  ELSIF NEW.risk_score > 6.0 THEN
    NEW.risk_level := 'high';
  ELSIF NEW.risk_score >= 4.0 THEN
    NEW.risk_level := 'moderate';
  ELSE
    NEW.risk_level := 'low';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inspections_risk_level_trigger
  BEFORE INSERT OR UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION calculate_risk_level();

-- Auto-generate report_id atomically
CREATE OR REPLACE FUNCTION generate_report_id()
RETURNS text AS $$
DECLARE
  next_num int;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(report_id FROM 5) AS int)), 0) + 1
  INTO next_num FROM reports;
  RETURN 'RPT-' || LPAD(next_num::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Geospatial: find projects within radius
CREATE OR REPLACE FUNCTION get_projects_within_radius(
  center_long float,
  center_lat float,
  radius_meters float
)
RETURNS TABLE (id uuid, name text, lat float, long float) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, ST_Y(p.geom) as lat, ST_X(p.geom) as long
  FROM projects p
  WHERE ST_DWithin(
    p.geom::geography,
    ST_SetSRID(ST_MakePoint(center_long, center_lat), 4326)::geography,
    radius_meters
  );
END;
$$ LANGUAGE plpgsql;

-- Geospatial: find zones containing point
CREATE OR REPLACE FUNCTION get_zones_containing_point(
  target_long float,
  target_lat float
)
RETURNS TABLE (id uuid, name text) AS $$
BEGIN
  RETURN QUERY
  SELECT z.id, z.name
  FROM geospatial_zones z
  WHERE ST_Contains(
    z.geom,
    ST_SetSRID(ST_MakePoint(target_long, target_lat), 4326)
  );
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- STORAGE BUCKETS
-- =================================================================

-- Create bucket via Supabase Dashboard or SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('inspection-images', 'inspection-images', false);

-- Storage RLS policies
CREATE POLICY "admin_storage_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'inspection-images' AND auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (bucket_id = 'inspection-images' AND auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "viewer_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inspection-images' AND auth.jwt() ->> 'role' IN ('viewer', 'inspector'));

CREATE POLICY "inspector_storage_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-images' AND auth.jwt() ->> 'role' = 'inspector');

CREATE POLICY "inspector_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'inspection-images' AND auth.jwt() ->> 'role' = 'inspector')
  WITH CHECK (bucket_id = 'inspection-images' AND auth.jwt() ->> 'role' = 'inspector');
