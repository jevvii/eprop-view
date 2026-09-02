-- =================================================================
-- Migration 011: Building Master Data Hierarchy
-- Establishes buildings, floors, and structural elements master tables
-- Connects inspections to master data via foreign keys
-- =================================================================

CREATE TABLE IF NOT EXISTS public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text DEFAULT '',
  latitude float,
  longitude float,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  name text NOT NULL,
  level int,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.structural_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  element_type text NOT NULL CHECK (element_type IN ('beam','column','slab','wall','foundation','facade','roof','general','other')),
  identifier text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buildings_project_id_idx ON public.buildings(project_id);
CREATE INDEX IF NOT EXISTS floors_building_id_idx ON public.floors(building_id);
CREATE INDEX IF NOT EXISTS structural_elements_floor_id_idx ON public.structural_elements(floor_id);

ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.structural_elements ENABLE ROW LEVEL SECURITY;

-- Select policies (accessible to all authenticated roles)
DROP POLICY IF EXISTS "buildings_select_all" ON public.buildings;
CREATE POLICY "buildings_select_all" ON public.buildings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "floors_select_all" ON public.floors;
CREATE POLICY "floors_select_all" ON public.floors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "structural_elements_select_all" ON public.structural_elements;
CREATE POLICY "structural_elements_select_all" ON public.structural_elements FOR SELECT TO authenticated USING (true);

-- Admin mutation policies
DROP POLICY IF EXISTS "buildings_admin_all" ON public.buildings;
CREATE POLICY "buildings_admin_all" ON public.buildings FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "floors_admin_all" ON public.floors;
CREATE POLICY "floors_admin_all" ON public.floors FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "structural_elements_admin_all" ON public.structural_elements;
CREATE POLICY "structural_elements_admin_all" ON public.structural_elements FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- Update inspections table with references to master data
ALTER TABLE public.inspections
ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS floor_id uuid REFERENCES public.floors(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS structural_element_id uuid REFERENCES public.structural_elements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inspections_building_id_idx ON public.inspections(building_id);
CREATE INDEX IF NOT EXISTS inspections_floor_id_idx ON public.inspections(floor_id);
CREATE INDEX IF NOT EXISTS inspections_structural_element_id_idx ON public.inspections(structural_element_id);
