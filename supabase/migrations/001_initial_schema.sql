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
-- BTREE INDEXES
-- =================================================================

CREATE INDEX inspections_project_id_idx ON inspections(project_id);
CREATE INDEX inspections_lead_inspector_id_idx ON inspections(lead_inspector_id);
CREATE INDEX inspection_images_inspection_id_idx ON inspection_images(inspection_id);
CREATE INDEX reports_project_id_idx ON reports(project_id);
CREATE INDEX reports_inspection_id_idx ON reports(inspection_id);
CREATE INDEX reports_lead_inspector_id_idx ON reports(lead_inspector_id);
CREATE INDEX environmental_risks_project_id_idx ON environmental_risks(project_id);
CREATE INDEX risk_hotspots_project_id_idx ON risk_hotspots(project_id);
CREATE INDEX maintenance_priorities_project_id_idx ON maintenance_priorities(project_id);
CREATE INDEX maintenance_priorities_assigned_to_idx ON maintenance_priorities(assigned_to);
CREATE INDEX damage_trends_project_id_idx ON damage_trends(project_id);
CREATE INDEX geospatial_zones_project_id_idx ON geospatial_zones(project_id);

CREATE INDEX projects_created_by_idx ON projects(created_by);
CREATE INDEX projects_status_idx ON projects(status);
CREATE INDEX inspections_status_idx ON inspections(status);
CREATE INDEX reports_status_idx ON reports(status);
CREATE INDEX reports_date_idx ON reports(date);
CREATE INDEX maintenance_priorities_status_idx ON maintenance_priorities(status);
CREATE INDEX maintenance_priorities_due_date_idx ON maintenance_priorities(due_date);
CREATE INDEX inspections_inspection_date_idx ON inspections(inspection_date);

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
CREATE POLICY "admin_all_profiles" ON profiles FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_projects" ON projects FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_inspections" ON inspections FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_inspection_images" ON inspection_images FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_reports" ON reports FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_env_risks" ON environmental_risks FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_hotspots" ON risk_hotspots FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_maintenance" ON maintenance_priorities FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_trends" ON damage_trends FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_all_zones" ON geospatial_zones FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Viewer: read-only on all tables
CREATE POLICY "viewer_select_profiles" ON profiles FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_projects" ON projects FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_inspections" ON inspections FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_images" ON inspection_images FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_reports" ON reports FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_env_risks" ON environmental_risks FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_hotspots" ON risk_hotspots FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_maintenance" ON maintenance_priorities FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_trends" ON damage_trends FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');
CREATE POLICY "viewer_select_zones" ON geospatial_zones FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'viewer');

-- Inspector: read all, write operational tables
CREATE POLICY "inspector_select_profiles" ON profiles FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
CREATE POLICY "inspector_select_projects" ON projects FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
CREATE POLICY "inspector_select_zones" ON geospatial_zones FOR SELECT TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');

CREATE POLICY "inspector_all_inspections" ON inspections FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector') WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
CREATE POLICY "inspector_all_images" ON inspection_images FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector') WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
CREATE POLICY "inspector_all_reports" ON reports FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector') WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
CREATE POLICY "inspector_all_env_risks" ON environmental_risks FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector') WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
CREATE POLICY "inspector_all_hotspots" ON risk_hotspots FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector') WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
CREATE POLICY "inspector_all_maintenance" ON maintenance_priorities FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector') WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
CREATE POLICY "inspector_all_trends" ON damage_trends FOR ALL TO authenticated USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector') WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');

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

-- NOTE: inspections.risk_level is auto-derived from risk_score by the trigger above.
-- Client-provided values for risk_level are ignored on insert/update.

-- Auto-generate report_id safely using a sequence
CREATE SEQUENCE reports_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_report_id()
RETURNS trigger AS $$
BEGIN
  NEW.report_id := 'RPT-' || LPAD(nextval('reports_id_seq')::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-populate report_id
CREATE TRIGGER reports_report_id_trigger
  BEFORE INSERT ON reports
  FOR EACH ROW
  WHEN (NEW.report_id IS NULL OR NEW.report_id = '')
  EXECUTE FUNCTION generate_report_id();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at_trigger
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER inspections_updated_at_trigger
  BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER reports_updated_at_trigger
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER environmental_risks_updated_at_trigger
  BEFORE UPDATE ON environmental_risks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER maintenance_priorities_updated_at_trigger
  BEFORE UPDATE ON maintenance_priorities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
  USING (bucket_id = 'inspection-images' AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK (bucket_id = 'inspection-images' AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE POLICY "viewer_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inspection-images' AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('viewer', 'inspector'));

CREATE POLICY "inspector_storage_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-images' AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');

CREATE POLICY "inspector_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'inspection-images' AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector')
  WITH CHECK (bucket_id = 'inspection-images' AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'inspector');
