-- =================================================================
-- Migration 008: RBAC & Use Case Parity Alignment
-- Updates profiles role constraint to include 'engineer'
-- Configures comprehensive RLS policies for Engineer, Inspector, Admin
-- Adds structural element and floor attributes to inspections
-- =================================================================

-- 1. Update profiles table role constraint to support 'engineer'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'engineer', 'inspector', 'viewer'));

-- 2. Add structural element and floor columns to inspections if not present
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS structural_element text DEFAULT 'general';
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS floor text DEFAULT 'Ground';

-- Index for structural element queries
CREATE INDEX IF NOT EXISTS inspections_structural_element_idx ON public.inspections(structural_element);

-- 3. Enhance RLS Policies for Engineer Role across all operational tables

-- Profiles: Authenticated users can read all profiles (needed for assigning maintenance tasks & reviewer names)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_all_authenticated" ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- Projects: Engineers have read access
DROP POLICY IF EXISTS "engineer_select_projects" ON public.projects;
CREATE POLICY "engineer_select_projects" ON public.projects FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector', 'viewer'));

-- Inspections: Engineers can read and update inspections
DROP POLICY IF EXISTS "engineer_select_inspections" ON public.inspections;
DROP POLICY IF EXISTS "engineer_update_inspections" ON public.inspections;
CREATE POLICY "engineer_select_inspections" ON public.inspections FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector', 'viewer'));
CREATE POLICY "engineer_update_inspections" ON public.inspections FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

-- Inspection Images: Engineers have read access
DROP POLICY IF EXISTS "engineer_select_images" ON public.inspection_images;
CREATE POLICY "engineer_select_images" ON public.inspection_images FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector', 'viewer'));

-- Reports: Engineers have full management access
DROP POLICY IF EXISTS "engineer_all_reports" ON public.reports;
CREATE POLICY "engineer_all_reports" ON public.reports FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

-- Environmental Risks: Engineers can assess and update geohazard risk data
DROP POLICY IF EXISTS "engineer_all_env_risks" ON public.environmental_risks;
CREATE POLICY "engineer_all_env_risks" ON public.environmental_risks FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

-- Risk Hotspots: Engineers can manage hotspots
DROP POLICY IF EXISTS "engineer_all_hotspots" ON public.risk_hotspots;
CREATE POLICY "engineer_all_hotspots" ON public.risk_hotspots FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

-- Maintenance Priorities: Engineers have full management and assignment access
DROP POLICY IF EXISTS "engineer_all_maintenance" ON public.maintenance_priorities;
CREATE POLICY "engineer_all_maintenance" ON public.maintenance_priorities FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

-- Damage Trends: Engineers have full access
DROP POLICY IF EXISTS "engineer_all_trends" ON public.damage_trends;
CREATE POLICY "engineer_all_trends" ON public.damage_trends FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

-- Geospatial Zones: Engineers can view zones
DROP POLICY IF EXISTS "engineer_select_zones" ON public.geospatial_zones;
CREATE POLICY "engineer_select_zones" ON public.geospatial_zones FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector', 'viewer'));

-- AI Damage Detections: Engineers can review, validate, and adjust detections
DROP POLICY IF EXISTS "ai_detections_engineer_all" ON public.ai_damage_detections;
CREATE POLICY "ai_detections_engineer_all" ON public.ai_damage_detections FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

-- AI Analysis Jobs: Engineers can run and view jobs
DROP POLICY IF EXISTS "ai_jobs_engineer_all" ON public.ai_analysis_jobs;
CREATE POLICY "ai_jobs_engineer_all" ON public.ai_analysis_jobs FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

-- AR Sessions & Anchors: Engineers can inspect AR records and anchors
DROP POLICY IF EXISTS "ar_sessions_engineer_all" ON public.ar_sessions;
CREATE POLICY "ar_sessions_engineer_all" ON public.ar_sessions FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

DROP POLICY IF EXISTS "ar_anchors_engineer_all" ON public.ar_anchors;
CREATE POLICY "ar_anchors_engineer_all" ON public.ar_anchors FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer', 'inspector'));

-- Ensure AI models seed includes baseline models
INSERT INTO public.ai_models (name, version, task, format, labels, is_active)
SELECT
  'ResNet50-DamageClassifier-v2',
  '2.1.0',
  'classification',
  'mock',
  ARRAY['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none'],
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_models WHERE name = 'ResNet50-DamageClassifier-v2'
);

INSERT INTO public.ai_models (name, version, task, format, labels, is_active)
SELECT
  'YOLOv8-StructuralDefects-v1',
  '1.4.0',
  'detection',
  'mock',
  ARRAY['crack', 'corrosion', 'spalling', 'deformation', 'leakage'],
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_models WHERE name = 'YOLOv8-StructuralDefects-v1'
);
