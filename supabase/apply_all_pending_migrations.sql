-- Add is_active column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update RLS policies to allow admins to list all profiles
-- (The existing "profiles_admin_all" already covers this if it exists, let's re-verify/ensure)
DROP POLICY IF EXISTS "admin_all_profiles" ON profiles;
CREATE POLICY "admin_all_profiles" ON profiles FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

CREATE INDEX IF NOT EXISTS reports_created_by_idx ON reports(created_by);
CREATE INDEX IF NOT EXISTS reports_reviewed_by_idx ON reports(reviewed_by);
CREATE INDEX IF NOT EXISTS reports_last_edited_by_idx ON reports(last_edited_by);

CREATE OR REPLACE FUNCTION create_report_with_id(report_data jsonb)
RETURNS SETOF reports AS $$
DECLARE
  reviewer_id uuid := NULL;
  reviewer_at timestamptz := NULL;
BEGIN
  IF report_data->>'status' = 'completed' THEN
    reviewer_id := auth.uid();
    reviewer_at := now();
  END IF;

  RETURN QUERY
  INSERT INTO reports (
    title,
    project_id,
    inspection_id,
    date,
    location,
    status,
    risk_score,
    key_findings,
    created_by,
    last_edited_by,
    last_edited_at,
    reviewed_by,
    reviewed_at
  )
  VALUES (
    report_data->>'title',
    (report_data->>'project_id')::uuid,
    NULLIF(report_data->>'inspection_id', '')::uuid,
    (report_data->>'date')::date,
    report_data->>'location',
    report_data->>'status',
    (report_data->>'risk_score')::float,
    report_data->>'key_findings',
    auth.uid(),
    auth.uid(),
    now(),
    reviewer_id,
    reviewer_at
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;
-- =================================================================
-- ROLE-BASED ACCESS POLICIES FOR 'inspection-images' BUCKET
-- =================================================================

-- NOTE: If you get "must be owner of table objects", create the bucket
-- manually in the Supabase Dashboard (Storage tab) and ensure 
-- RLS is enabled there. Then run these policy commands.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    -- 1. ADMIN: Absolute control
    DROP POLICY IF EXISTS "admin_storage_all" ON storage.objects;
    CREATE POLICY "admin_storage_all" ON storage.objects FOR ALL TO authenticated
      USING (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
      WITH CHECK (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

    -- 2. VIEWERS/INSPECTORS: Read access (Signed URL generation)
    DROP POLICY IF EXISTS "viewer_storage_read" ON storage.objects;
    CREATE POLICY "viewer_storage_read" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('viewer', 'inspector', 'admin'));

    -- 3. INSPECTORS: Permission to upload imagery
    DROP POLICY IF EXISTS "inspector_storage_write" ON storage.objects;
    CREATE POLICY "inspector_storage_write" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'admin'));

    -- 4. INSPECTORS: Permission to update metadata
    DROP POLICY IF EXISTS "inspector_storage_update" ON storage.objects;
    CREATE POLICY "inspector_storage_update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'admin'))
      WITH CHECK (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'admin'));

    -- 5. ADMIN ONLY: Permission to delete
    DROP POLICY IF EXISTS "admin_storage_delete" ON storage.objects;
    CREATE POLICY "admin_storage_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'inspection-images' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
  END IF;
END $$;
-- =================================================================
-- 2. Add uploader_id to inspection_images to track ownership
-- =================================================================
ALTER TABLE public.inspection_images 
ADD COLUMN IF NOT EXISTS uploader_id uuid REFERENCES public.profiles(id) DEFAULT auth.uid();

-- 3. Update RLS policies for inspection_images table
-- DROP existing policies if they exist
DROP POLICY IF EXISTS "admin_all_inspection_images" ON public.inspection_images;
DROP POLICY IF EXISTS "viewer_select_images" ON public.inspection_images;
DROP POLICY IF EXISTS "inspector_all_images" ON public.inspection_images;
DROP POLICY IF EXISTS "inspection_images_read" ON public.inspection_images;
DROP POLICY IF EXISTS "inspection_images_insert" ON public.inspection_images;
DROP POLICY IF EXISTS "inspection_images_delete" ON public.inspection_images;

-- CREATE new secure policies
-- Viewers/Inspectors: Can see all images
CREATE POLICY "inspection_images_read" ON public.inspection_images
  FOR SELECT TO authenticated
  USING (true);

-- Inspectors/Admins: Can upload new images
CREATE POLICY "inspection_images_insert" ON public.inspection_images
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('inspector', 'admin')
  );

-- DELETION: Only the owner (uploader) or an Admin can delete the record
CREATE POLICY "inspection_images_delete" ON public.inspection_images
  FOR DELETE TO authenticated
  USING (
    uploader_id = auth.uid() OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
-- Create table for image comments
CREATE TABLE IF NOT EXISTS public.image_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.inspection_images(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS image_comments_image_id_idx ON public.image_comments(image_id);
CREATE INDEX IF NOT EXISTS image_comments_author_id_idx ON public.image_comments(author_id);

-- Enable RLS
ALTER TABLE public.image_comments ENABLE ROW LEVEL SECURITY;

-- Policies for image_comments
-- Anyone authenticated can read comments
DROP POLICY IF EXISTS "image_comments_read" ON public.image_comments;
CREATE POLICY "image_comments_read" ON public.image_comments
  FOR SELECT TO authenticated
  USING (true);

-- Anyone authenticated can insert a comment
DROP POLICY IF EXISTS "image_comments_insert" ON public.image_comments;
CREATE POLICY "image_comments_insert" ON public.image_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- Only author or admin can delete a comment
DROP POLICY IF EXISTS "image_comments_delete" ON public.image_comments;
CREATE POLICY "image_comments_delete" ON public.image_comments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only the owner of the image can update the is_read status
DROP POLICY IF EXISTS "image_comments_update_read" ON public.image_comments;
CREATE POLICY "image_comments_update_read" ON public.image_comments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inspection_images 
      WHERE id = image_comments.image_id AND uploader_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inspection_images 
      WHERE id = image_comments.image_id AND uploader_id = auth.uid()
    )
  );

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_image_comment_count()
RETURNS bigint AS $$
BEGIN
  RETURN (
    SELECT count(*)
    FROM public.image_comments c
    JOIN public.inspection_images i ON c.image_id = i.id
    WHERE i.uploader_id = auth.uid()
    AND c.author_id != auth.uid()
    AND c.is_read = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- =================================================================
-- AI MODULE (Core Feature)
-- Tables, indexes, and RLS for automated damage detection,
-- severity classification, and AI model registry.
-- =================================================================

-- Registered AI models / checkpoints
CREATE TABLE IF NOT EXISTS ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  task text NOT NULL CHECK (task IN ('classification', 'detection', 'segmentation')),
  format text NOT NULL CHECK (format IN ('tfjs', 'onnx', 'mock')),
  storage_path text,                -- optional path in Supabase storage to model artifact
  labels text[] NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- AI damage detection results attached to inspection images
CREATE TABLE IF NOT EXISTS ai_damage_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES inspection_images(id) ON DELETE CASCADE,
  model_id uuid REFERENCES ai_models(id) ON DELETE SET NULL,
  damage_type text NOT NULL CHECK (damage_type IN ('crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  severity_score float NOT NULL CHECK (severity_score >= 0 AND severity_score <= 100),
  confidence float NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  bbox jsonb,                       -- { x, y, width, height } normalized 0-1
  mask_url text,                    -- optional segmentation mask signed URL
  verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Per-image AI analysis job queue / status
CREATE TABLE IF NOT EXISTS ai_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES inspection_images(id) ON DELETE CASCADE,
  model_id uuid REFERENCES ai_models(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  error_message text DEFAULT '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- =================================================================
-- INDEXES
-- =================================================================
CREATE INDEX IF NOT EXISTS ai_detections_image_id_idx ON ai_damage_detections(image_id);
CREATE INDEX IF NOT EXISTS ai_detections_damage_type_idx ON ai_damage_detections(damage_type);
CREATE INDEX IF NOT EXISTS ai_detections_severity_idx ON ai_damage_detections(severity);
CREATE INDEX IF NOT EXISTS ai_models_active_idx ON ai_models(is_active);
CREATE INDEX IF NOT EXISTS ai_jobs_image_id_idx ON ai_analysis_jobs(image_id);
CREATE INDEX IF NOT EXISTS ai_jobs_status_idx ON ai_analysis_jobs(status);

-- =================================================================
-- ROW LEVEL SECURITY
-- =================================================================
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_damage_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_jobs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read AI results; only admins can manage models
DROP POLICY IF EXISTS "ai_models_select_all" ON ai_models;
CREATE POLICY "ai_models_select_all" ON ai_models FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ai_models_admin_all" ON ai_models;
CREATE POLICY "ai_models_admin_all" ON ai_models FOR ALL TO authenticated USING (get_my_role() = 'admin');

-- Inspectors and admins can create/verify detections; everyone authenticated can read
DROP POLICY IF EXISTS "ai_detections_select_all" ON ai_damage_detections;
CREATE POLICY "ai_detections_select_all" ON ai_damage_detections FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ai_detections_inspector_all" ON ai_damage_detections;
CREATE POLICY "ai_detections_inspector_all" ON ai_damage_detections FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

DROP POLICY IF EXISTS "ai_detections_admin_all" ON ai_damage_detections;
CREATE POLICY "ai_detections_admin_all" ON ai_damage_detections FOR ALL TO authenticated USING (get_my_role() = 'admin');

-- Inspectors and admins can create/update jobs; everyone authenticated can read
DROP POLICY IF EXISTS "ai_jobs_select_all" ON ai_analysis_jobs;
CREATE POLICY "ai_jobs_select_all" ON ai_analysis_jobs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ai_jobs_inspector_all" ON ai_analysis_jobs;
CREATE POLICY "ai_jobs_inspector_all" ON ai_analysis_jobs FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

DROP POLICY IF EXISTS "ai_jobs_admin_all" ON ai_analysis_jobs;
CREATE POLICY "ai_jobs_admin_all" ON ai_analysis_jobs FOR ALL TO authenticated USING (get_my_role() = 'admin');

-- Seed a mock/demo model so the UI and data flow can be demonstrated
-- without a trained checkpoint. Idempotent: only insert if no mock model exists.
INSERT INTO ai_models (name, version, task, format, labels)
SELECT
  'EPROPVIEW Mock Damage Classifier',
  '0.1.0-prototype',
  'classification',
  'mock',
  ARRAY['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']
WHERE NOT EXISTS (
  SELECT 1 FROM ai_models WHERE format = 'mock'
);
-- =================================================================
-- AR MODULE (Core Feature)
-- Tables, indexes, and RLS for AR inspection sessions and
-- persistent spatial anchors attached to physical structures.
-- =================================================================

-- AR sessions created during an inspection
CREATE TABLE IF NOT EXISTS ar_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  started_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'completed')) DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  device_info jsonb DEFAULT '{}'
);

-- Persistent AR anchors attached to physical structures
CREATE TABLE IF NOT EXISTS ar_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ar_sessions(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  detection_id uuid REFERENCES ai_damage_detections(id) ON DELETE SET NULL,
  label text NOT NULL,
  damage_type text CHECK (damage_type IN ('crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none')),
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  pose jsonb NOT NULL,              -- { position: {x,y,z}, quaternion: {x,y,z,w} }
  world_position jsonb,             -- optional GPS/UTM position
  notes text DEFAULT '',
  snapshot_path text,               -- optional camera snapshot in storage
  created_at timestamptz DEFAULT now()
);

-- =================================================================
-- INDEXES
-- =================================================================
CREATE INDEX IF NOT EXISTS ar_sessions_inspection_id_idx ON ar_sessions(inspection_id);
CREATE INDEX IF NOT EXISTS ar_sessions_status_idx ON ar_sessions(status);
CREATE INDEX IF NOT EXISTS ar_anchors_session_id_idx ON ar_anchors(session_id);
CREATE INDEX IF NOT EXISTS ar_anchors_inspection_id_idx ON ar_anchors(inspection_id);

-- =================================================================
-- ROW LEVEL SECURITY
-- =================================================================
ALTER TABLE ar_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_anchors ENABLE ROW LEVEL SECURITY;

-- Inspectors and admins can manage AR sessions; everyone authenticated can read
DROP POLICY IF EXISTS "ar_sessions_select_all" ON ar_sessions;
CREATE POLICY "ar_sessions_select_all" ON ar_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ar_sessions_inspector_all" ON ar_sessions;
CREATE POLICY "ar_sessions_inspector_all" ON ar_sessions FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

DROP POLICY IF EXISTS "ar_sessions_admin_all" ON ar_sessions;
CREATE POLICY "ar_sessions_admin_all" ON ar_sessions FOR ALL TO authenticated USING (get_my_role() = 'admin');

-- Inspectors and admins can manage AR anchors; everyone authenticated can read
DROP POLICY IF EXISTS "ar_anchors_select_all" ON ar_anchors;
CREATE POLICY "ar_anchors_select_all" ON ar_anchors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ar_anchors_inspector_all" ON ar_anchors;
CREATE POLICY "ar_anchors_inspector_all" ON ar_anchors FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

DROP POLICY IF EXISTS "ar_anchors_admin_all" ON ar_anchors;
CREATE POLICY "ar_anchors_admin_all" ON ar_anchors FOR ALL TO authenticated USING (get_my_role() = 'admin');
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
-- =================================================================
-- Migration 009: Strict Role-Based Access Control (RBAC) Enforcement
-- Aligns database RLS policies strictly with EPROPVIEW RBAC Matrix:
--   - Inspector: Field capture, AR scan/anchors, own inspections, inference
--   - Engineer: Review all, AI validation/adjustment, geohazards, maintenance, reports
--   - Admin: Full governance, audit logs, models, user management
--   - Viewer: Read-only access to published artifacts
-- =================================================================

-- =================================================================
-- 0. ROLE RESOLUTION & PROFILE SYNCHRONIZATION
-- Upgrades get_my_role() to resolve role from profiles, falling back to
-- JWT app_metadata and user_metadata. Also installs auto-sync trigger
-- on auth.users so any created user always has a profiles row.
-- =================================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
DECLARE
  profile_role text;
  jwt_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Try profiles table
  SELECT role INTO profile_role FROM public.profiles WHERE id = auth.uid();
  IF profile_role IS NOT NULL THEN
    RETURN profile_role;
  END IF;

  -- 2. Fallback to auth.jwt() claims
  jwt_role := COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  );

  IF jwt_role IS NOT NULL THEN
    -- Self-heal the missing profile row in the background
    BEGIN
      INSERT INTO public.profiles (id, role, full_name, is_active)
      VALUES (
        auth.uid(),
        jwt_role,
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'full_name', 'User'),
        true
      )
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'get_my_role self-healing profile insert warning for user %: % (SQLSTATE: %)', auth.uid(), SQLERRM, SQLSTATE;
    END;

    RETURN jwt_role;
  END IF;

  -- 3. Default fallback for any authenticated user
  RETURN 'viewer';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-provision profile row whenever a new user is created in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_app_meta_data->>'role', NEW.raw_user_meta_data->>'role', 'viewer'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET role = COALESCE(profiles.role, EXCLUDED.role);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_auth_user profile creation warning for user %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
  END IF;
END $$;

-- Backfill any existing auth.users missing from profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    INSERT INTO public.profiles (id, role, full_name, is_active)
    SELECT 
      u.id,
      COALESCE(u.raw_app_meta_data->>'role', u.raw_user_meta_data->>'role', 'viewer'),
      COALESCE(u.raw_user_meta_data->>'full_name', u.email),
      true
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =================================================================
-- 1. CLEANUP: DROP ALL LEGACY POLICIES (FROM 001, 006, 007, 008)
-- Permissive policies in Postgres are additive (OR-evaluated), so
-- all legacy broad policies must be explicitly dropped to avoid
-- unauthorized privilege bypass.
-- =================================================================

-- 0a. PROFILES
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;

-- 0b. PROJECTS
DROP POLICY IF EXISTS "admin_all_projects" ON public.projects;
DROP POLICY IF EXISTS "viewer_select_projects" ON public.projects;
DROP POLICY IF EXISTS "inspector_select_projects" ON public.projects;
DROP POLICY IF EXISTS "engineer_select_projects" ON public.projects;
DROP POLICY IF EXISTS "projects_select_authenticated" ON public.projects;

-- 0c. INSPECTIONS
DROP POLICY IF EXISTS "admin_all_inspections" ON public.inspections;
DROP POLICY IF EXISTS "viewer_select_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspector_select_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspector_all_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspector_insert_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspector_update_inspections" ON public.inspections;
DROP POLICY IF EXISTS "engineer_select_inspections" ON public.inspections;
DROP POLICY IF EXISTS "engineer_update_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspections_select_policy" ON public.inspections;
DROP POLICY IF EXISTS "inspections_insert_policy" ON public.inspections;
DROP POLICY IF EXISTS "inspections_update_policy" ON public.inspections;
DROP POLICY IF EXISTS "inspections_delete_policy" ON public.inspections;

-- 0d. INSPECTION IMAGES
DROP POLICY IF EXISTS "admin_all_inspection_images" ON public.inspection_images;
DROP POLICY IF EXISTS "viewer_select_images" ON public.inspection_images;
DROP POLICY IF EXISTS "inspector_all_images" ON public.inspection_images;
DROP POLICY IF EXISTS "engineer_select_images" ON public.inspection_images;
DROP POLICY IF EXISTS "inspection_images_read" ON public.inspection_images;
DROP POLICY IF EXISTS "inspection_images_insert" ON public.inspection_images;
DROP POLICY IF EXISTS "inspection_images_delete" ON public.inspection_images;

-- 0e. REPORTS
DROP POLICY IF EXISTS "admin_all_reports" ON public.reports;
DROP POLICY IF EXISTS "viewer_select_reports" ON public.reports;
DROP POLICY IF EXISTS "inspector_all_reports" ON public.reports;
DROP POLICY IF EXISTS "engineer_all_reports" ON public.reports;
DROP POLICY IF EXISTS "reports_select_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_insert_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_update_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_delete_policy" ON public.reports;

-- 0f. ENVIRONMENTAL RISKS & HOTSPOTS
DROP POLICY IF EXISTS "admin_all_env_risks" ON public.environmental_risks;
DROP POLICY IF EXISTS "viewer_select_env_risks" ON public.environmental_risks;
DROP POLICY IF EXISTS "inspector_all_env_risks" ON public.environmental_risks;
DROP POLICY IF EXISTS "engineer_all_env_risks" ON public.environmental_risks;
DROP POLICY IF EXISTS "env_risks_select_policy" ON public.environmental_risks;
DROP POLICY IF EXISTS "env_risks_modify_policy" ON public.environmental_risks;

DROP POLICY IF EXISTS "admin_all_hotspots" ON public.risk_hotspots;
DROP POLICY IF EXISTS "viewer_select_hotspots" ON public.risk_hotspots;
DROP POLICY IF EXISTS "inspector_all_hotspots" ON public.risk_hotspots;
DROP POLICY IF EXISTS "engineer_all_hotspots" ON public.risk_hotspots;
DROP POLICY IF EXISTS "hotspots_select_policy" ON public.risk_hotspots;
DROP POLICY IF EXISTS "hotspots_modify_policy" ON public.risk_hotspots;

-- 0g. MAINTENANCE PRIORITIES
DROP POLICY IF EXISTS "admin_all_maintenance" ON public.maintenance_priorities;
DROP POLICY IF EXISTS "viewer_select_maintenance" ON public.maintenance_priorities;
DROP POLICY IF EXISTS "inspector_all_maintenance" ON public.maintenance_priorities;
DROP POLICY IF EXISTS "engineer_all_maintenance" ON public.maintenance_priorities;
DROP POLICY IF EXISTS "maintenance_select_policy" ON public.maintenance_priorities;
DROP POLICY IF EXISTS "maintenance_modify_policy" ON public.maintenance_priorities;

-- 0h. DAMAGE TRENDS & GEOSPATIAL ZONES
DROP POLICY IF EXISTS "admin_all_trends" ON public.damage_trends;
DROP POLICY IF EXISTS "viewer_select_trends" ON public.damage_trends;
DROP POLICY IF EXISTS "inspector_all_trends" ON public.damage_trends;
DROP POLICY IF EXISTS "engineer_all_trends" ON public.damage_trends;

DROP POLICY IF EXISTS "admin_all_zones" ON public.geospatial_zones;
DROP POLICY IF EXISTS "viewer_select_zones" ON public.geospatial_zones;
DROP POLICY IF EXISTS "inspector_select_zones" ON public.geospatial_zones;
DROP POLICY IF EXISTS "engineer_select_zones" ON public.geospatial_zones;

-- 0i. AI MODULE POLICIES
DROP POLICY IF EXISTS "ai_models_select_all" ON public.ai_models;
DROP POLICY IF EXISTS "ai_models_admin_all" ON public.ai_models;

DROP POLICY IF EXISTS "ai_detections_select_all" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_inspector_all" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_engineer_all" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_admin_all" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_select_policy" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_insert_policy" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_update_policy" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_delete_policy" ON public.ai_damage_detections;

DROP POLICY IF EXISTS "ai_jobs_select_all" ON public.ai_analysis_jobs;
DROP POLICY IF EXISTS "ai_jobs_inspector_all" ON public.ai_analysis_jobs;
DROP POLICY IF EXISTS "ai_jobs_engineer_all" ON public.ai_analysis_jobs;
DROP POLICY IF EXISTS "ai_jobs_admin_all" ON public.ai_analysis_jobs;
DROP POLICY IF EXISTS "ai_jobs_modify_policy" ON public.ai_analysis_jobs;

-- 0j. AR MODULE POLICIES
DROP POLICY IF EXISTS "ar_sessions_select_all" ON public.ar_sessions;
DROP POLICY IF EXISTS "ar_sessions_inspector_all" ON public.ar_sessions;
DROP POLICY IF EXISTS "ar_sessions_engineer_all" ON public.ar_sessions;
DROP POLICY IF EXISTS "ar_sessions_admin_all" ON public.ar_sessions;
DROP POLICY IF EXISTS "ar_sessions_select_policy" ON public.ar_sessions;
DROP POLICY IF EXISTS "ar_sessions_modify_policy" ON public.ar_sessions;

DROP POLICY IF EXISTS "ar_anchors_select_all" ON public.ar_anchors;
DROP POLICY IF EXISTS "ar_anchors_inspector_all" ON public.ar_anchors;
DROP POLICY IF EXISTS "ar_anchors_engineer_all" ON public.ar_anchors;
DROP POLICY IF EXISTS "ar_anchors_admin_all" ON public.ar_anchors;
DROP POLICY IF EXISTS "ar_anchors_select_policy" ON public.ar_anchors;
DROP POLICY IF EXISTS "ar_anchors_modify_policy" ON public.ar_anchors;

-- =================================================================
-- 1. PROFILES (Item 7: Allow all authenticated users to read staff/assignee names)
-- =================================================================
DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_all_authenticated" ON public.profiles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- =================================================================
-- 2. PROJECTS
-- =================================================================
DROP POLICY IF EXISTS "projects_select_authenticated" ON public.projects;
CREATE POLICY "projects_select_authenticated" ON public.projects FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "projects_admin_all" ON public.projects;
CREATE POLICY "projects_admin_all" ON public.projects FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- =================================================================
-- 3. INSPECTIONS
-- Inspector: scoped to own inspections (lead_inspector_id = auth.uid() OR IS NULL for initial creation)
-- Engineer: read all, update status/review
-- Admin: full access
-- Viewer: read all
-- =================================================================
DROP POLICY IF EXISTS "inspections_select_policy" ON public.inspections;
CREATE POLICY "inspections_select_policy" ON public.inspections FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'engineer', 'viewer')
    OR (get_my_role() = 'inspector' AND (lead_inspector_id = auth.uid() OR lead_inspector_id IS NULL))
  );

DROP POLICY IF EXISTS "inspections_insert_policy" ON public.inspections;
CREATE POLICY "inspections_insert_policy" ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'admin'
    OR (get_my_role() = 'inspector' AND (lead_inspector_id = auth.uid() OR lead_inspector_id IS NULL))
  );

DROP POLICY IF EXISTS "inspections_update_policy" ON public.inspections;
CREATE POLICY "inspections_update_policy" ON public.inspections FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'engineer')
    OR (get_my_role() = 'inspector' AND lead_inspector_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'engineer')
    OR (get_my_role() = 'inspector' AND lead_inspector_id = auth.uid())
  );

DROP POLICY IF EXISTS "inspections_delete_policy" ON public.inspections;
CREATE POLICY "inspections_delete_policy" ON public.inspections FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- =================================================================
-- 4. INSPECTION IMAGES
-- Read: all authenticated
-- Insert: admin OR inspector (uploading to own inspection, uploader_id = auth.uid())
-- Delete: admin OR owner (uploader_id = auth.uid())
-- =================================================================
DROP POLICY IF EXISTS "inspection_images_read" ON public.inspection_images;
CREATE POLICY "inspection_images_read" ON public.inspection_images FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "inspection_images_insert" ON public.inspection_images;
CREATE POLICY "inspection_images_insert" ON public.inspection_images FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'inspector'
      AND (
        uploader_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.inspections i
          WHERE i.id = inspection_id
            AND (i.lead_inspector_id = auth.uid() OR i.lead_inspector_id IS NULL)
        )
      )
    )
  );

DROP POLICY IF EXISTS "inspection_images_delete" ON public.inspection_images;
CREATE POLICY "inspection_images_delete" ON public.inspection_images FOR DELETE TO authenticated
  USING (
    get_my_role() = 'admin'
    OR uploader_id = auth.uid()
  );

-- =================================================================
-- 5. REPORTS
-- Read: admin, engineer, viewer
-- Insert/Update: admin, engineer
-- Delete: admin
-- Inspector: BLOCKED from report authoring/updating
-- =================================================================
DROP POLICY IF EXISTS "reports_select_policy" ON public.reports;
CREATE POLICY "reports_select_policy" ON public.reports FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'viewer'));

DROP POLICY IF EXISTS "reports_insert_policy" ON public.reports;
CREATE POLICY "reports_insert_policy" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

DROP POLICY IF EXISTS "reports_update_policy" ON public.reports;
CREATE POLICY "reports_update_policy" ON public.reports FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

DROP POLICY IF EXISTS "reports_delete_policy" ON public.reports;
CREATE POLICY "reports_delete_policy" ON public.reports FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- =================================================================
-- 6. ENVIRONMENTAL RISKS & RISK HOTSPOTS
-- Read: all authenticated
-- Insert/Update/Delete: admin, engineer
-- =================================================================
DROP POLICY IF EXISTS "env_risks_select_policy" ON public.environmental_risks;
CREATE POLICY "env_risks_select_policy" ON public.environmental_risks FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "env_risks_modify_policy" ON public.environmental_risks;
CREATE POLICY "env_risks_modify_policy" ON public.environmental_risks FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

DROP POLICY IF EXISTS "hotspots_select_policy" ON public.risk_hotspots;
CREATE POLICY "hotspots_select_policy" ON public.risk_hotspots FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "hotspots_modify_policy" ON public.risk_hotspots;
CREATE POLICY "hotspots_modify_policy" ON public.risk_hotspots FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

-- =================================================================
-- 7. MAINTENANCE PRIORITIES
-- Read: all authenticated
-- Insert/Update/Delete: admin, engineer
-- =================================================================
DROP POLICY IF EXISTS "maintenance_select_policy" ON public.maintenance_priorities;
CREATE POLICY "maintenance_select_policy" ON public.maintenance_priorities FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "maintenance_modify_policy" ON public.maintenance_priorities;
CREATE POLICY "maintenance_modify_policy" ON public.maintenance_priorities FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

-- =================================================================
-- 8. DAMAGE TRENDS & GEOSPATIAL ZONES
-- =================================================================
DROP POLICY IF EXISTS "trends_select_authenticated" ON public.damage_trends;
CREATE POLICY "trends_select_authenticated" ON public.damage_trends FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "trends_modify_policy" ON public.damage_trends;
CREATE POLICY "trends_modify_policy" ON public.damage_trends FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

DROP POLICY IF EXISTS "zones_select_authenticated" ON public.geospatial_zones;
CREATE POLICY "zones_select_authenticated" ON public.geospatial_zones FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "zones_admin_all" ON public.geospatial_zones;
CREATE POLICY "zones_admin_all" ON public.geospatial_zones FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- =================================================================
-- 9. AI MODELS & INFERENCE JOBS & DETECTIONS
-- Models: read all, admin manages
-- Jobs: read all, inspector/admin triggers
-- Detections:
--   - Select: all authenticated
--   - Insert: inspector, admin (inference)
--   - Update: engineer, admin (validation, review, adjustments)
--   - Delete: admin
-- =================================================================
DROP POLICY IF EXISTS "ai_models_select_all" ON public.ai_models;
CREATE POLICY "ai_models_select_all" ON public.ai_models FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ai_models_admin_all" ON public.ai_models;
CREATE POLICY "ai_models_admin_all" ON public.ai_models FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "ai_jobs_select_all" ON public.ai_analysis_jobs;
CREATE POLICY "ai_jobs_select_all" ON public.ai_analysis_jobs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ai_jobs_modify_policy" ON public.ai_analysis_jobs;
CREATE POLICY "ai_jobs_modify_policy" ON public.ai_analysis_jobs FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

DROP POLICY IF EXISTS "ai_detections_select_policy" ON public.ai_damage_detections;
CREATE POLICY "ai_detections_select_policy" ON public.ai_damage_detections FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ai_detections_insert_policy" ON public.ai_damage_detections;
CREATE POLICY "ai_detections_insert_policy" ON public.ai_damage_detections FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

DROP POLICY IF EXISTS "ai_detections_update_policy" ON public.ai_damage_detections;
CREATE POLICY "ai_detections_update_policy" ON public.ai_damage_detections FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

DROP POLICY IF EXISTS "ai_detections_delete_policy" ON public.ai_damage_detections;
CREATE POLICY "ai_detections_delete_policy" ON public.ai_damage_detections FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- =================================================================
-- 10. AR SESSIONS & AR ANCHORS (Item 1: uses started_by NOT inspector_id)
-- =================================================================
DROP POLICY IF EXISTS "ar_sessions_select_policy" ON public.ar_sessions;
CREATE POLICY "ar_sessions_select_policy" ON public.ar_sessions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ar_sessions_modify_policy" ON public.ar_sessions;
CREATE POLICY "ar_sessions_modify_policy" ON public.ar_sessions FOR ALL TO authenticated
  USING (
    get_my_role() = 'admin'
    OR (get_my_role() = 'inspector' AND started_by = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR (get_my_role() = 'inspector' AND started_by = auth.uid())
  );

DROP POLICY IF EXISTS "ar_anchors_select_policy" ON public.ar_anchors;
CREATE POLICY "ar_anchors_select_policy" ON public.ar_anchors FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ar_anchors_modify_policy" ON public.ar_anchors;
CREATE POLICY "ar_anchors_modify_policy" ON public.ar_anchors FOR ALL TO authenticated
  USING (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'inspector'
      AND EXISTS (
        SELECT 1 FROM public.ar_sessions s
        WHERE s.id = session_id AND s.started_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'inspector'
      AND EXISTS (
        SELECT 1 FROM public.ar_sessions s
        WHERE s.id = session_id AND s.started_by = auth.uid()
      )
    )
  );

-- =================================================================
-- 11. STORAGE: INSPECTION-IMAGES BUCKET (Item 3: complete policies)
-- Read: all authenticated (viewer, inspector, engineer, admin)
-- Insert: inspector, admin
-- Update: owner OR admin
-- Delete: owner OR admin (allows inspector to delete own uploaded assets)
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    -- Drop legacy policies
    EXECUTE 'DROP POLICY IF EXISTS "admin_storage_all" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "viewer_storage_read" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "inspector_storage_write" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "inspector_storage_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "admin_storage_delete" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "allow_owner_or_admin_delete" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_inspection_images_select" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_inspection_images_insert" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_inspection_images_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_inspection_images_delete" ON storage.objects';

    -- Create unified scoped storage policies
    EXECUTE 'CREATE POLICY "storage_inspection_images_select" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = ''inspection-images'')';

    EXECUTE 'CREATE POLICY "storage_inspection_images_insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = ''inspection-images''
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN (''inspector'', ''admin'')
      )';

    EXECUTE 'CREATE POLICY "storage_inspection_images_update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = ''inspection-images''
        AND (
          (SELECT role FROM public.profiles WHERE id = auth.uid()) = ''admin''
          OR owner = auth.uid()
          OR (owner_id)::text = (auth.uid())::text
        )
      )
      WITH CHECK (
        bucket_id = ''inspection-images''
        AND (
          (SELECT role FROM public.profiles WHERE id = auth.uid()) = ''admin''
          OR owner = auth.uid()
          OR (owner_id)::text = (auth.uid())::text
        )
      )';

    EXECUTE 'CREATE POLICY "storage_inspection_images_delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = ''inspection-images''
        AND (
          (SELECT role FROM public.profiles WHERE id = auth.uid()) = ''admin''
          OR owner = auth.uid()
          OR (owner_id)::text = (auth.uid())::text
        )
      )';
  END IF;
END $$;
-- =================================================================
-- Migration 010: AI Model Registry V2
-- Enhances ai_models table with architecture, tensor dimensions,
-- confidence and IoU thresholds, and preprocessing configuration
-- =================================================================

ALTER TABLE public.ai_models
ADD COLUMN IF NOT EXISTS architecture text DEFAULT 'yolov8',
ADD COLUMN IF NOT EXISTS input_width int DEFAULT 640,
ADD COLUMN IF NOT EXISTS input_height int DEFAULT 640,
ADD COLUMN IF NOT EXISTS confidence_threshold float DEFAULT 0.25,
ADD COLUMN IF NOT EXISTS iou_threshold float DEFAULT 0.45,
ADD COLUMN IF NOT EXISTS preprocessing jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

COMMENT ON COLUMN public.ai_models.architecture IS 'Neural network architecture (e.g. yolov8, efficientdet, rtdetr, custom)';
COMMENT ON COLUMN public.ai_models.confidence_threshold IS 'Minimum detection probability threshold (0.0 to 1.0)';
COMMENT ON COLUMN public.ai_models.iou_threshold IS 'Intersection over Union threshold for Non-Maximum Suppression';
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
-- =================================================================
-- Migration 013: Storage Audit & Lifecycle Management
-- Creates storage_audit table to track objects, retention tiers,
-- orphaned states, and lifecycle transitions
-- =================================================================

CREATE TABLE IF NOT EXISTS public.storage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  size_bytes bigint DEFAULT 0,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  uploaded_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  storage_class text DEFAULT 'standard' CHECK (storage_class IN ('standard', 'cold', 'glacier', 'archive')),
  is_orphan boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storage_audit_bucket_idx ON public.storage_audit(bucket_id);
CREATE INDEX IF NOT EXISTS storage_audit_project_idx ON public.storage_audit(project_id);
CREATE INDEX IF NOT EXISTS storage_audit_class_idx ON public.storage_audit(storage_class);
CREATE INDEX IF NOT EXISTS storage_audit_is_orphan_idx ON public.storage_audit(is_orphan);
CREATE UNIQUE INDEX IF NOT EXISTS storage_audit_bucket_path_idx ON public.storage_audit(bucket_id, object_path);

ALTER TABLE public.storage_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "storage_audit_select_admin" ON public.storage_audit;
CREATE POLICY "storage_audit_select_admin" ON public.storage_audit FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "storage_audit_all_admin" ON public.storage_audit;
CREATE POLICY "storage_audit_all_admin" ON public.storage_audit FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');
