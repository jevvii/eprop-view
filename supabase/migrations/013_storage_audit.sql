-- =================================================================
-- Migration 013: Storage Audit & Lifecycle Management
-- Creates storage_audit table to track objects, retention tiers,
-- and lifecycle states
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
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storage_audit_bucket_idx ON public.storage_audit(bucket_id);
CREATE INDEX IF NOT EXISTS storage_audit_project_idx ON public.storage_audit(project_id);
CREATE INDEX IF NOT EXISTS storage_audit_class_idx ON public.storage_audit(storage_class);
CREATE UNIQUE INDEX IF NOT EXISTS storage_audit_bucket_path_idx ON public.storage_audit(bucket_id, object_path);

ALTER TABLE public.storage_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "storage_audit_select_admin" ON public.storage_audit;
CREATE POLICY "storage_audit_select_admin" ON public.storage_audit FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "storage_audit_all_admin" ON public.storage_audit;
CREATE POLICY "storage_audit_all_admin" ON public.storage_audit FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');
