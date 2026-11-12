-- Evidence locations and verified archival. Additive, safe to rerun.
BEGIN;
ALTER TABLE public.inspection_images ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'inspection-images';
ALTER TABLE public.ar_anchors ADD COLUMN IF NOT EXISTS snapshot_bucket text NOT NULL DEFAULT 'inspection-images';
DO $$ BEGIN
  ALTER TABLE public.inspection_images ADD CONSTRAINT inspection_images_storage_bucket_check CHECK (storage_bucket IN ('inspection-images','reports-archive'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ar_anchors ADD CONSTRAINT ar_anchors_snapshot_bucket_check CHECK (snapshot_bucket IN ('inspection-images','reports-archive'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The application verifies copied bytes before this metadata transaction. The
-- old location is an optimistic concurrency guard. No bytes are deleted here.
CREATE OR REPLACE FUNCTION public.commit_storage_archive(
  p_audit_id uuid, p_expected_bucket text, p_expected_path text,
  p_bucket_id text, p_object_path text, p_storage_class text, p_size_bytes bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE current_row public.storage_audit%ROWTYPE;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO current_row FROM public.storage_audit WHERE id=p_audit_id FOR UPDATE;
  IF NOT FOUND OR current_row.bucket_id IS DISTINCT FROM p_expected_bucket OR current_row.object_path IS DISTINCT FROM p_expected_path THEN
    RAISE EXCEPTION 'Storage object changed; refresh before archiving';
  END IF;
  IF p_expected_bucket <> 'inspection-images' OR p_bucket_id <> 'reports-archive'
     OR p_object_path <> 'archive/' || p_audit_id::text || '/' || p_expected_path
     OR p_storage_class NOT IN ('cold','archive') OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'Invalid archive destination';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket_id AND name=p_object_path) THEN
    RAISE EXCEPTION 'Verified archive object is missing';
  END IF;
  UPDATE public.inspection_images SET storage_bucket=p_bucket_id,storage_path=p_object_path
    WHERE storage_bucket=p_expected_bucket AND storage_path=p_expected_path;
  UPDATE public.ar_anchors SET snapshot_bucket=p_bucket_id,snapshot_path=p_object_path
    WHERE snapshot_bucket=p_expected_bucket AND snapshot_path=p_expected_path;
  -- Merge an audit entry created by a sync after an earlier staged copy.
  DELETE FROM public.storage_audit WHERE bucket_id=p_bucket_id AND object_path=p_object_path AND id<>p_audit_id;
  UPDATE public.storage_audit SET bucket_id=p_bucket_id,object_path=p_object_path,storage_class=p_storage_class,size_bytes=p_size_bytes
    WHERE id=p_audit_id;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_storage_archive(uuid,text,text,text,text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_storage_archive(uuid,text,text,text,text,text,bigint) TO authenticated;

-- Archived evidence follows the same inspection ownership rules as primary
-- evidence. Archive writes are admin-only; readers cannot obtain arbitrary files.
DROP POLICY IF EXISTS archive_evidence_read ON storage.objects;
CREATE POLICY archive_evidence_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='reports-archive' AND public.get_my_role() IS NOT NULL AND (
    public.get_my_role() IN ('admin','engineer') OR
    EXISTS (SELECT 1 FROM public.inspection_images im JOIN public.inspections i ON i.id=im.inspection_id
      WHERE im.storage_bucket='reports-archive' AND im.storage_path=name
      AND (public.get_my_role()='inspector' AND i.lead_inspector_id=auth.uid())) OR
    EXISTS (SELECT 1 FROM public.ar_anchors a JOIN public.inspections i ON i.id=a.inspection_id
      WHERE a.snapshot_bucket='reports-archive' AND a.snapshot_path=name
      AND (public.get_my_role()='inspector' AND i.lead_inspector_id=auth.uid()))
  )
);
DROP POLICY IF EXISTS archive_admin_write ON storage.objects;
CREATE POLICY archive_admin_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='reports-archive' AND public.get_my_role()='admin')
  WITH CHECK (bucket_id='reports-archive' AND public.get_my_role()='admin');
-- A record transfer is a single transaction, including the new project and
-- all remapped children. Binary evidence and immutable approval history are
-- deliberately excluded. Imported reports must pass a fresh engineering review.
CREATE OR REPLACE FUNCTION public.import_project_records(p_export jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_project uuid := gen_random_uuid();
  names text[] := ARRAY['buildings','floors','structural_elements','inspections','reports',
    'maintenance_priorities','environmental_risks','risk_hotspots','geospatial_zones',
    'settlement_observations','rebound_tests','rebound_readings','soil_investigations',
    'checklist_responses','forensic_assessments','report_limitations','cost_estimates','recommendations'];
  identities jsonb := '{}'::jsonb;
  target_table text;
  item jsonb;
  row_data jsonb;
  source_id text;
  new_id uuid;
  field record;
  column_list text;
  actor_fields text[] := ARRAY['created_by','last_edited_by','reviewed_by','lead_inspector_id','assigned_to',
    'recorded_by','performed_by','completed_by','author_id','reopened_by','confirmed_by','signed_by'];
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin role required' USING ERRCODE='42501'; END IF;
  IF p_export->>'schemaVersion' IS DISTINCT FROM '2' OR jsonb_typeof(p_export->'records') IS DISTINCT FROM 'object'
    OR NULLIF(btrim(p_export->'project'->>'name'),'') IS NULL OR octet_length(p_export::text)>41943040 THEN
    RAISE EXCEPTION 'Invalid or oversized operational record export';
  END IF;

  -- Allocate the complete identity map first and reject ambiguous source IDs.
  IF p_export->'project'->>'id' IS NOT NULL THEN
    identities := jsonb_build_object(p_export->'project'->>'id',new_project::text);
  END IF;
  FOREACH target_table IN ARRAY names LOOP
    IF jsonb_typeof(p_export->'records'->target_table) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Missing record collection: %',target_table;
    END IF;
    IF jsonb_array_length(p_export->'records'->target_table)>100000 THEN RAISE EXCEPTION 'Record limit exceeded'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_export->'records'->target_table) LOOP
      source_id := item->>'id';
      IF source_id IS NULL OR source_id = '' OR identities ? source_id THEN RAISE EXCEPTION 'Missing or duplicate record identity'; END IF;
      identities := identities || jsonb_build_object(source_id,gen_random_uuid()::text);
    END LOOP;
  END LOOP;

  row_data := p_export->'project' || jsonb_build_object('id',new_project,'name',(p_export->'project'->>'name') || ' (restored)',
    'created_by',auth.uid(),'created_at',now(),'updated_at',now(),'archived_at',NULL,'archived_by',NULL);
  SELECT string_agg(format('%I',column_name),',' ORDER BY ordinal_position) INTO column_list
    FROM information_schema.columns WHERE table_schema='public' AND information_schema.columns.table_name='projects'
      AND row_data ? column_name AND is_generated='NEVER' AND is_identity='NO';
  EXECUTE format('INSERT INTO public.projects (%s) SELECT %s FROM jsonb_populate_record(NULL::public.projects,$1)',column_list,column_list) USING row_data;

  FOREACH target_table IN ARRAY names LOOP
    FOR item IN SELECT value FROM jsonb_array_elements(p_export->'records'->target_table) LOOP
      new_id := (identities->>(item->>'id'))::uuid;
      row_data := item || jsonb_build_object('id',new_id);
      FOR field IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND information_schema.columns.table_name=target_table LOOP
        IF field.column_name='project_id' THEN
          row_data := row_data || jsonb_build_object('project_id',new_project);
        ELSIF field.column_name=ANY(actor_fields) THEN
          row_data := row_data || jsonb_build_object(field.column_name,NULL);
        ELSIF field.column_name IN ('image_id','detection_id') THEN
          row_data := row_data || jsonb_build_object(field.column_name,NULL);
        ELSIF field.column_name='report_id' AND target_table='reports' THEN
          row_data := row_data || jsonb_build_object('report_id','RPT-R-' || new_id::text);
        ELSIF field.column_name LIKE '%\_id' ESCAPE '\' AND field.column_name<>'id' AND row_data->>field.column_name IS NOT NULL THEN
          source_id := row_data->>field.column_name;
          IF NOT identities ? source_id THEN RAISE EXCEPTION 'Missing reference % in %',field.column_name,target_table; END IF;
          row_data := row_data || jsonb_build_object(field.column_name,identities->>source_id);
        ELSIF field.column_name IN ('created_at','updated_at','content_updated_at') THEN
          row_data := row_data || jsonb_build_object(field.column_name,now());
        END IF;
      END LOOP;
      IF target_table='reports' THEN
        row_data := row_data || jsonb_build_object('status','open','created_by',auth.uid(),
          'reviewed_by',NULL,'reviewed_at',NULL,'last_edited_by',NULL,'last_edited_at',NULL);
      ELSIF target_table='recommendations' THEN
        row_data := row_data || jsonb_build_object('status','draft','draft_text',COALESCE(NULLIF(item->'final_text','null'::jsonb),item->'draft_text'),
          'final_text',NULL,'signed_by',NULL,'signed_at',NULL);
      ELSIF target_table='cost_estimates' THEN
        row_data := row_data || jsonb_build_object('confirmed_by',NULL,'confirmed_at',NULL,'override_reason',NULL,'override_php',NULL);
      END IF;
      -- Identifiers are chosen from the literal allowlist above; values are
      -- parameterized JSON and table CHECK/FK constraints still apply.
      SELECT string_agg(format('%I',column_name),',' ORDER BY ordinal_position) INTO column_list
        FROM information_schema.columns WHERE table_schema='public' AND information_schema.columns.table_name=target_table
          AND row_data ? column_name AND is_generated='NEVER' AND is_identity='NO';
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)',target_table,column_list,column_list,target_table) USING row_data;
    END LOOP;
  END LOOP;
  RETURN new_project;
END;
$$;
REVOKE ALL ON FUNCTION public.import_project_records(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_project_records(jsonb) TO authenticated;
COMMIT;
