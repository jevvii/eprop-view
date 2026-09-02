-- =================================================================
-- Migration 009: Strict Role-Based Access Control (RBAC) Enforcement
-- Aligns database RLS policies strictly with EPROPVIEW RBAC Matrix:
--   - Inspector: Field capture, AR scan/anchors, own inspections, inference
--   - Engineer: Review all, AI validation/adjustment, geohazards, maintenance, reports
--   - Admin: Full governance, audit logs, models, user management
--   - Viewer: Read-only access to published artifacts
-- =================================================================

-- 1. INSPECTIONS: Scope inspector SELECT to own inspections (lead_inspector_id = auth.uid())
DROP POLICY IF EXISTS "engineer_select_inspections" ON public.inspections;
DROP POLICY IF EXISTS "engineer_update_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspector_select_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspector_insert_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspector_update_inspections" ON public.inspections;
DROP POLICY IF EXISTS "inspections_select_policy" ON public.inspections;
DROP POLICY IF EXISTS "inspections_insert_policy" ON public.inspections;
DROP POLICY IF EXISTS "inspections_update_policy" ON public.inspections;

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

-- 2. INSPECTION IMAGES: Only inspector/admin upload, deletion by owner/admin only
DROP POLICY IF EXISTS "inspection_images_read" ON public.inspection_images;
DROP POLICY IF EXISTS "inspection_images_insert" ON public.inspection_images;
DROP POLICY IF EXISTS "inspection_images_delete" ON public.inspection_images;
DROP POLICY IF EXISTS "engineer_select_images" ON public.inspection_images;

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

-- 3. REPORTS: Engineer & Admin create/update/export; Inspector blocked from reports
DROP POLICY IF EXISTS "engineer_all_reports" ON public.reports;
DROP POLICY IF EXISTS "reports_select_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_insert_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_update_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_delete_policy" ON public.reports;

CREATE POLICY "reports_select_policy" ON public.reports FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'engineer', 'viewer'));

CREATE POLICY "reports_insert_policy" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

CREATE POLICY "reports_update_policy" ON public.reports FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

CREATE POLICY "reports_delete_policy" ON public.reports FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- 4. ENVIRONMENTAL RISKS & RISK HOTSPOTS: Engineer & Admin assess/update; Inspector read-only
DROP POLICY IF EXISTS "engineer_all_env_risks" ON public.environmental_risks;
DROP POLICY IF EXISTS "engineer_all_hotspots" ON public.risk_hotspots;
DROP POLICY IF EXISTS "env_risks_select_policy" ON public.environmental_risks;
DROP POLICY IF EXISTS "env_risks_modify_policy" ON public.environmental_risks;
DROP POLICY IF EXISTS "hotspots_select_policy" ON public.risk_hotspots;
DROP POLICY IF EXISTS "hotspots_modify_policy" ON public.risk_hotspots;

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

-- 5. MAINTENANCE PRIORITIES: Engineer & Admin prioritize/assign; Inspector & Viewer read-only
DROP POLICY IF EXISTS "engineer_all_maintenance" ON public.maintenance_priorities;
DROP POLICY IF EXISTS "maintenance_select_policy" ON public.maintenance_priorities;
DROP POLICY IF EXISTS "maintenance_modify_policy" ON public.maintenance_priorities;

CREATE POLICY "maintenance_select_policy" ON public.maintenance_priorities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "maintenance_modify_policy" ON public.maintenance_priorities FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

-- 6. AI DAMAGE DETECTIONS: Inspector inserts on inference; Engineer & Admin validate/adjust
DROP POLICY IF EXISTS "ai_detections_engineer_all" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_select_policy" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_insert_policy" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_update_policy" ON public.ai_damage_detections;
DROP POLICY IF EXISTS "ai_detections_delete_policy" ON public.ai_damage_detections;

CREATE POLICY "ai_detections_select_policy" ON public.ai_damage_detections FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_detections_insert_policy" ON public.ai_damage_detections FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

CREATE POLICY "ai_detections_update_policy" ON public.ai_damage_detections FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'engineer'))
  WITH CHECK (get_my_role() IN ('admin', 'engineer'));

CREATE POLICY "ai_detections_delete_policy" ON public.ai_damage_detections FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- 7. AR SESSIONS & AR ANCHORS: Inspector & Admin create/update; Engineer & Viewer read-only
DROP POLICY IF EXISTS "ar_sessions_engineer_all" ON public.ar_sessions;
DROP POLICY IF EXISTS "ar_anchors_engineer_all" ON public.ar_anchors;
DROP POLICY IF EXISTS "ar_sessions_select_policy" ON public.ar_sessions;
DROP POLICY IF EXISTS "ar_sessions_modify_policy" ON public.ar_sessions;
DROP POLICY IF EXISTS "ar_anchors_select_policy" ON public.ar_anchors;
DROP POLICY IF EXISTS "ar_anchors_modify_policy" ON public.ar_anchors;

CREATE POLICY "ar_sessions_select_policy" ON public.ar_sessions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ar_sessions_modify_policy" ON public.ar_sessions FOR ALL TO authenticated
  USING (
    get_my_role() = 'admin'
    OR (get_my_role() = 'inspector' AND inspector_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR (get_my_role() = 'inspector' AND inspector_id = auth.uid())
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
        WHERE s.id = session_id AND s.inspector_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'inspector'
      AND EXISTS (
        SELECT 1 FROM public.ar_sessions s
        WHERE s.id = session_id AND s.inspector_id = auth.uid()
      )
    )
  );

-- 8. STORAGE (inspection-images bucket): Allow engineer read; restrict write to inspector & admin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    EXECUTE 'DROP POLICY IF EXISTS "viewer_storage_read" ON storage.objects';
    EXECUTE 'CREATE POLICY "viewer_storage_read" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = ''inspection-images'' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN (''viewer'', ''inspector'', ''engineer'', ''admin''))';
  END IF;
END $$;
