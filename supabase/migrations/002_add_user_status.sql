-- Add is_active column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Drop legacy recursive policy
DROP POLICY IF EXISTS "admin_all_profiles" ON profiles;

-- Allow all authenticated users to read profiles
DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON profiles;
CREATE POLICY "profiles_select_all_authenticated" ON profiles FOR SELECT TO authenticated
  USING (true);

