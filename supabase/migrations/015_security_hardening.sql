-- =================================================================
-- Migration 015: Security Hardening
-- Closes the role-escalation chain:
--   1. Authoritative role source is public.profiles (never user_metadata)
--   2. profile.role / profile.is_active are guarded against client writes
--   3. Signup trigger can no longer copy an attacker-supplied role
--   4. Deactivated users lose RLS access immediately
--   5. Owner-scoped AI detection deletion
--   6. Admin-only geohazard RPC with a pinned search_path
--   7. DB-backed rate limiting
--   8. AI detection provenance for quarantining synthetic rows
--   9. Idempotent storage buckets with MIME/size limits
--  10. Risk thresholds aligned with the TypeScript implementation
--
-- Idempotent: safe to re-run.
-- =================================================================
BEGIN;

-- -----------------------------------------------------------------
-- 1. Authoritative, active-aware role resolution
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_role   text;
  v_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role, is_active
    INTO v_role, v_active
    FROM public.profiles
   WHERE id = auth.uid();

  -- No profile yet: least privilege, not an empty result set.
  IF v_role IS NULL THEN
    RETURN 'viewer';
  END IF;

  -- Deactivation takes effect on the very next policy evaluation.
  IF v_active IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  RETURN v_role;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;

-- -----------------------------------------------------------------
-- 2. Guard profiles.role / profiles.is_active against client writes
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- auth.uid() is NULL for service-role / SECURITY DEFINER contexts.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins may change privileges.
  IF public.get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'viewer' OR NEW.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Only admins may create a privileged profile'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Only admins may change role or active status'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_guard_privileges ON public.profiles;
CREATE TRIGGER profiles_guard_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- Belt and braces for deployments without table-level UPDATE.
REVOKE UPDATE (role, is_active) ON public.profiles FROM authenticated, anon;
REVOKE INSERT (role, is_active) ON public.profiles FROM authenticated, anon;

-- Self-service inserts are limited to an unprivileged, active profile.
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'admin'
    OR (id = auth.uid() AND role = 'viewer' AND is_active IS TRUE)
  );

-- -----------------------------------------------------------------
-- 3. Signup can never mint a privileged profile
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, is_active)
  VALUES (
    NEW.id,
    'viewer',
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_auth_user profile creation warning for user %: % (SQLSTATE: %)',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$fn$;

-- -----------------------------------------------------------------
-- 4. Deactivated users lose read access on every permissive policy
--    (these policies were USING (true) and never consulted the role)
-- -----------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND cmd = 'SELECT'
       AND qual = 'true'
       AND roles::text LIKE '%authenticated%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I USING (public.get_my_role() IS NOT NULL)',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------
-- 5. Inspectors may replace their own detections (fixes silent
--    zero-row deletes that duplicated AI results on re-analysis)
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "ai_detections_delete_policy" ON public.ai_damage_detections;
CREATE POLICY "ai_detections_delete_policy" ON public.ai_damage_detections
  FOR DELETE TO authenticated
  USING (
    get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1
        FROM public.inspection_images ii
        JOIN public.inspections i ON i.id = ii.inspection_id
       WHERE ii.id = ai_damage_detections.image_id
         AND i.lead_inspector_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------
-- 6. Geohazard RPC: admin-only, pinned search_path, not callable by anon
-- -----------------------------------------------------------------
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
SET search_path = public, extensions
AS $fn$
DECLARE
  v_geom geometry;
  v_id uuid;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_zone_type NOT IN ('fault_line', 'liquefaction', 'flood', 'landslide', 'erosion', 'other') THEN
    RAISE EXCEPTION 'Invalid zone type: %', p_zone_type USING ERRCODE = '22023';
  END IF;

  IF p_risk_level NOT IN ('zone_a', 'zone_b', 'zone_c', 'zone_d') THEN
    RAISE EXCEPTION 'Invalid risk level: %', p_risk_level USING ERRCODE = '22023';
  END IF;

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
$fn$;

REVOKE ALL ON FUNCTION public.upsert_geospatial_zone(uuid, text, text, text, text, text, text, text, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_geospatial_zone(uuid, text, text, text, text, text, text, text, date)
  TO authenticated;

-- -----------------------------------------------------------------
-- 7. DB-backed rate limiting (shared across instances)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer NOT NULL DEFAULT 0
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER function below may touch this table.

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF p_key IS NULL OR p_limit <= 0 OR p_window_seconds <= 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limits AS rl (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rl.window_start < now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE rl.count + 1
    END,
    window_start = CASE
      WHEN rl.window_start < now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE rl.window_start
    END
  RETURNING rl.count INTO v_count;

  RETURN v_count <= p_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO authenticated;

-- -----------------------------------------------------------------
-- 8. AI detection provenance (quarantine synthetic rows)
-- -----------------------------------------------------------------
ALTER TABLE public.ai_damage_detections
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'heuristic';

ALTER TABLE public.ai_damage_detections
  DROP CONSTRAINT IF EXISTS ai_damage_detections_provenance_check;
ALTER TABLE public.ai_damage_detections
  ADD CONSTRAINT ai_damage_detections_provenance_check
  CHECK (provenance IN ('model', 'heuristic', 'synthetic', 'legacy_synthetic'));

CREATE INDEX IF NOT EXISTS ai_damage_detections_provenance_idx
  ON public.ai_damage_detections (provenance);

-- Rows written by the old fabricated pipeline are flagged, never deleted.
UPDATE public.ai_damage_detections
   SET provenance = 'legacy_synthetic'
 WHERE provenance = 'heuristic'
   AND (
     notes ILIKE '%YOLOv8%'
     OR (severity_score >= 95 AND confidence IN (0.88, 0.92))
   );

-- -----------------------------------------------------------------
-- 9. Storage buckets: idempotent, private, typed and size-capped
-- -----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inspection-images', 'inspection-images', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-models', 'ai-models', false), ('reports-archive', 'reports-archive', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies resolve the role from profiles, not a raw column subquery.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    EXECUTE 'DROP POLICY IF EXISTS "storage_inspection_images_select" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_inspection_images_insert" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_inspection_images_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_inspection_images_delete" ON storage.objects';

    EXECUTE 'CREATE POLICY "storage_inspection_images_select" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = ''inspection-images'' AND public.get_my_role() IS NOT NULL)';

    EXECUTE 'CREATE POLICY "storage_inspection_images_insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = ''inspection-images'' AND public.get_my_role() IN (''inspector'', ''admin''))';

    EXECUTE 'CREATE POLICY "storage_inspection_images_update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = ''inspection-images''
        AND (public.get_my_role() = ''admin'' OR owner = auth.uid() OR (owner_id)::text = (auth.uid())::text)
      )
      WITH CHECK (
        bucket_id = ''inspection-images''
        AND (public.get_my_role() = ''admin'' OR owner = auth.uid() OR (owner_id)::text = (auth.uid())::text)
      )';

    EXECUTE 'CREATE POLICY "storage_inspection_images_delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = ''inspection-images''
        AND (public.get_my_role() = ''admin'' OR owner = auth.uid() OR (owner_id)::text = (auth.uid())::text)
      )';
  END IF;
END $$;

-- -----------------------------------------------------------------
-- 10. Align risk thresholds with damage-score.ts (>= boundaries)
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_risk_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.risk_score >= 8.0 THEN
    NEW.risk_level := 'critical';
  ELSIF NEW.risk_score >= 6.0 THEN
    NEW.risk_level := 'high';
  ELSIF NEW.risk_score >= 4.0 THEN
    NEW.risk_level := 'moderate';
  ELSE
    NEW.risk_level := 'low';
  END IF;
  RETURN NEW;
END;
$fn$;

COMMIT;

-- =================================================================
-- Verification (run manually; every row must report t)
-- =================================================================
-- SELECT pg_get_functiondef('public.get_my_role'::regproc) ILIKE '%user_metadata%' = false AS role_fn_clean;
-- SELECT count(*) = 0 AS no_permissive_true_policies
--   FROM pg_policies WHERE schemaname='public' AND cmd='SELECT' AND qual='true';
-- SELECT tgname IS NOT NULL AS profile_guard_installed
--   FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='profiles_guard_privileges';
-- SELECT count(*) AS flagged_synthetic FROM public.ai_damage_detections WHERE provenance='legacy_synthetic';
