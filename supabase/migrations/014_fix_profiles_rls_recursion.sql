-- =================================================================
-- Migration 014: Fix Infinite Recursion in Profiles RLS Policy
-- Resolves PostgreSQL 42P17 (infinite recursion detected in policy for relation "profiles")
-- Eliminates circular subqueries on profiles and ensures safe get_my_role() resolution.
-- =================================================================

-- 1. Upgrade get_my_role() with JWT fast-path and search_path protection
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
DECLARE
  jwt_role text;
  profile_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- Step 1: Check JWT claims first (instantaneous, no DB query)
  jwt_role := COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  );
  IF jwt_role IS NOT NULL THEN
    RETURN jwt_role;
  END IF;

  -- Step 2: Query profiles table safely (profiles SELECT policy evaluates to true)
  SELECT role INTO profile_role FROM public.profiles WHERE id = auth.uid();
  IF profile_role IS NOT NULL THEN
    RETURN profile_role;
  END IF;

  RETURN 'viewer';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Drop all legacy and recursive policies on profiles
DROP POLICY IF EXISTS "admin_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

-- 3. Install clean, granular, non-recursive RLS policies on profiles
-- SELECT: All authenticated users can read profiles (required for full_name joins across app)
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: Authenticated user can create own profile row or admin can insert
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR get_my_role() = 'admin');

-- UPDATE: User can update own profile row or admin can update any
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR get_my_role() = 'admin')
  WITH CHECK (id = auth.uid() OR get_my_role() = 'admin');

-- DELETE: Only admin can delete profile rows
CREATE POLICY "profiles_delete_policy" ON public.profiles
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- 4. Clean up any redundant subqueries in image_comments policy
DROP POLICY IF EXISTS "image_comments_delete" ON public.image_comments;
CREATE POLICY "image_comments_delete" ON public.image_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR get_my_role() = 'admin');

-- 5. Backfill risk_hotspots geom coordinates if null using project geom and relative position
UPDATE public.risk_hotspots r
SET geom = ST_SetSRID(
  ST_MakePoint(
    ST_X(COALESCE(p.geom, ST_SetSRID(ST_MakePoint(121.0437, 14.676), 4326))) + ((r.position_x - 50.0) * 0.00015),
    ST_Y(COALESCE(p.geom, ST_SetSRID(ST_MakePoint(121.0437, 14.676), 4326))) + ((r.position_y - 50.0) * 0.00015)
  ),
  4326
)
FROM public.projects p
WHERE r.project_id = p.id AND r.geom IS NULL;
