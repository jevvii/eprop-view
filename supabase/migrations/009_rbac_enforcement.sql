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
CREATE POLICY "profiles_select_all_authenticated" ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- =================================================================
-- 2. PROJECTS
-- =================================================================
CREATE POLICY "projects_select_authenticated" ON public.projects FOR SELECT TO authenticated
  USING (true);

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
CREATE POLICY "inspections_select_policy" ON public.inspections FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'engineer', 'viewer')
    OR (get_my_role() = 'inspector' AND (lead_inspector_id = auth.uid() OR lead_inspector_id IS NULL))
  );

CREATE POLICY "inspections_insert_policy" ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'admin'
    OR (get_my_role() = 'inspector' AND (lead_inspector_id = auth.uid() OR lead_inspector_id IS NULL))
  );

CREATE POLICY "inspections_update_policy" ON public.inspections FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'engineer')
    OR (get_my_role() = 'inspector' AND lead_inspector_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'engineer')
    OR (get_my_role() = 'inspector' AND lead_inspector_id = auth.uid())
  );

CREATE POLICY "inspections_delete_policy" ON public.inspections FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- =================================================================
-- 4. INSPECTION IMAGES
-- Read: all authenticated
-- Insert: admin OR inspector (uploading to own inspection, uploader_id = auth.uid())
-- Delete: admin OR owner (uploader_id = auth.uid())
-- =================================================================
CREATE POLICY "inspection_images_read" ON public.inspection_images FOR SELECT TO authenticated
  USING (true);

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
CREATE POLICY "reports_select_policy" ON public.reports FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'viewer'));

CREATE POLICY "reports_insert_policy" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

CREATE POLICY "reports_update_policy" ON public.reports FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

CREATE POLICY "reports_delete_policy" ON public.reports FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- =================================================================
-- 6. ENVIRONMENTAL RISKS & RISK HOTSPOTS
-- Read: all authenticated
-- Insert/Update/Delete: admin, engineer
-- =================================================================
CREATE POLICY "env_risks_select_policy" ON public.environmental_risks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "env_risks_modify_policy" ON public.environmental_risks FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

CREATE POLICY "hotspots_select_policy" ON public.risk_hotspots FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hotspots_modify_policy" ON public.risk_hotspots FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

-- =================================================================
-- 7. MAINTENANCE PRIORITIES
-- Read: all authenticated
-- Insert/Update/Delete: admin, engineer
-- =================================================================
CREATE POLICY "maintenance_select_policy" ON public.maintenance_priorities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "maintenance_modify_policy" ON public.maintenance_priorities FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

-- =================================================================
-- 8. DAMAGE TRENDS & GEOSPATIAL ZONES
-- =================================================================
CREATE POLICY "trends_select_authenticated" ON public.damage_trends FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "trends_modify_policy" ON public.damage_trends FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

CREATE POLICY "zones_select_authenticated" ON public.geospatial_zones FOR SELECT TO authenticated
  USING (true);

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
CREATE POLICY "ai_models_select_all" ON public.ai_models FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_models_admin_all" ON public.ai_models FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "ai_jobs_select_all" ON public.ai_analysis_jobs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_jobs_modify_policy" ON public.ai_analysis_jobs FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

CREATE POLICY "ai_detections_select_policy" ON public.ai_damage_detections FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_detections_insert_policy" ON public.ai_damage_detections FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

CREATE POLICY "ai_detections_update_policy" ON public.ai_damage_detections FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

CREATE POLICY "ai_detections_delete_policy" ON public.ai_damage_detections FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- =================================================================
-- 10. AR SESSIONS & AR ANCHORS (Item 1: uses started_by NOT inspector_id)
-- =================================================================
CREATE POLICY "ar_sessions_select_policy" ON public.ar_sessions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ar_sessions_modify_policy" ON public.ar_sessions FOR ALL TO authenticated
  USING (
    get_my_role() = 'admin'
    OR (get_my_role() = 'inspector' AND started_by = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR (get_my_role() = 'inspector' AND started_by = auth.uid())
  );

CREATE POLICY "ar_anchors_select_policy" ON public.ar_anchors FOR SELECT TO authenticated
  USING (true);

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
