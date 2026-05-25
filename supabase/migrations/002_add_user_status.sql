-- Add is_active column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update RLS policies to allow admins to list all profiles
-- (The existing "profiles_admin_all" already covers this if it exists, let's re-verify/ensure)
DROP POLICY IF EXISTS "admin_all_profiles" ON profiles;
CREATE POLICY "admin_all_profiles" ON profiles FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
