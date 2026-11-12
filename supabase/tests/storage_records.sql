-- Run on an isolated database after migrations 001-019. Fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users(id) VALUES ('fa111111-1111-4111-8111-111111111111'),('fa222222-2222-4222-8222-222222222222') ON CONFLICT DO NOTHING;
  END IF;
END $$;
INSERT INTO profiles(id,role,is_active) VALUES
 ('fa111111-1111-4111-8111-111111111111','admin',true),
 ('fa222222-2222-4222-8222-222222222222','inspector',true)
ON CONFLICT(id) DO UPDATE SET role=excluded.role,is_active=true;
INSERT INTO projects(id,name) VALUES ('fb111111-1111-4111-8111-111111111111','Storage and transfer fixture');
INSERT INTO inspections(id,project_id,lead_inspector_id,inspection_date,status,risk_score,risk_level,location)
VALUES ('fc111111-1111-4111-8111-111111111111','fb111111-1111-4111-8111-111111111111','fa222222-2222-4222-8222-222222222222',CURRENT_DATE,'in_progress',5,'moderate','Evidence site');
INSERT INTO inspection_images(id,inspection_id,storage_path,storage_bucket)
VALUES ('fd111111-1111-4111-8111-111111111111','fc111111-1111-4111-8111-111111111111','source/photo.jpg','inspection-images');
INSERT INTO storage.buckets(id,name,public) VALUES ('reports-archive','reports-archive',false) ON CONFLICT DO NOTHING;
INSERT INTO storage.objects(bucket_id,name) VALUES ('reports-archive','archive/fe111111-1111-4111-8111-111111111111/source/photo.jpg');
INSERT INTO storage_audit(id,bucket_id,object_path,size_bytes,inspection_id,storage_class)
VALUES ('fe111111-1111-4111-8111-111111111111','inspection-images','source/photo.jpg',100,'fc111111-1111-4111-8111-111111111111','standard');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa111111-1111-4111-8111-111111111111',true);
SELECT commit_storage_archive('fe111111-1111-4111-8111-111111111111','inspection-images','source/photo.jpg','reports-archive','archive/fe111111-1111-4111-8111-111111111111/source/photo.jpg','archive',100);
SELECT pg_temp.assert_true((SELECT storage_bucket='reports-archive' AND storage_path='archive/fe111111-1111-4111-8111-111111111111/source/photo.jpg' FROM inspection_images WHERE id='fd111111-1111-4111-8111-111111111111'),'archive atomically switches persisted image bucket/path');
DO $$ BEGIN
  BEGIN
    PERFORM commit_storage_archive('fe111111-1111-4111-8111-111111111111','inspection-images','source/photo.jpg','reports-archive','archive/fe111111-1111-4111-8111-111111111111/source/photo.jpg','archive',100);
    RAISE EXCEPTION 'FAIL: stale archive metadata accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','fa222222-2222-4222-8222-222222222222',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='reports-archive'),'assigned inspector can read archived evidence');
DO $$ BEGIN
  BEGIN
    PERFORM commit_storage_archive('fe111111-1111-4111-8111-111111111111','inspection-images','source/photo.jpg','reports-archive','archive/fe111111-1111-4111-8111-111111111111/source/photo.jpg','archive',100);
    RAISE EXCEPTION 'FAIL: inspector archive authority accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','fa111111-1111-4111-8111-111111111111',true);
CREATE TEMP TABLE import_result(new_id uuid);
GRANT ALL ON import_result TO authenticated;
DO $$
DECLARE payload jsonb; target uuid; name text; rows_json jsonb; bad jsonb; before_count bigint;
BEGIN
  payload := jsonb_build_object('schemaVersion',2,'project',jsonb_build_object('id','fb111111-1111-4111-8111-111111111111','name','Record fixture','status','active'), 'records','{}'::jsonb);
  FOREACH name IN ARRAY ARRAY['buildings','floors','structural_elements','inspections','reports','maintenance_priorities','environmental_risks','risk_hotspots','geospatial_zones','settlement_observations','rebound_tests','rebound_readings','soil_investigations','checklist_responses','forensic_assessments','report_limitations','cost_estimates','recommendations'] LOOP
    payload := jsonb_set(payload,ARRAY['records',name],'[]'::jsonb);
  END LOOP;
  SELECT jsonb_agg(to_jsonb(i)) INTO rows_json FROM inspections i WHERE id='fc111111-1111-4111-8111-111111111111';
  payload := jsonb_set(payload,'{records,inspections}',rows_json);
  payload := jsonb_set(payload,'{records,reports}',jsonb_build_array(jsonb_build_object(
    'id','ff111111-1111-4111-8111-111111111111','report_id','OLD-RPT','project_id','fb111111-1111-4111-8111-111111111111','inspection_id','fc111111-1111-4111-8111-111111111111','title','Preserved findings','date',CURRENT_DATE,'location','Evidence site','risk_score',5,'status','completed','key_findings',NULL)));
  payload := jsonb_set(payload,'{records,recommendations}',jsonb_build_array(jsonb_build_object(
    'id','ff222222-2222-4222-8222-222222222222','report_id','ff111111-1111-4111-8111-111111111111','status','signed','provenance','engineer','final_text','Preserved text requiring re-review','signed_by','fa111111-1111-4111-8111-111111111111','signed_at',now())));
  target := import_project_records(payload);
  INSERT INTO import_result VALUES(target);
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM inspections WHERE project_id=target),'inspection remapped into restored project');
  PERFORM pg_temp.assert_true((SELECT status='open' AND reviewed_by IS NULL AND key_findings IS NULL FROM reports WHERE project_id=target),'restored completed report is open and nullable findings preserved');
  PERFORM pg_temp.assert_true((SELECT status='draft' AND signed_by IS NULL AND signed_at IS NULL AND final_text IS NULL AND draft_text='Preserved text requiring re-review' FROM recommendations WHERE report_id IN(SELECT id FROM reports WHERE project_id=target)),'signed recommendation becomes unsigned draft without losing wording');
  PERFORM pg_temp.assert_true((SELECT inspection_id IN(SELECT id FROM inspections WHERE project_id=target) FROM reports WHERE project_id=target),'report inspection links are remapped');
  SELECT count(*) INTO before_count FROM projects;
  bad := jsonb_set(payload,'{records,reports,0,inspection_id}','"00000000-0000-4000-8000-000000000000"'::jsonb);
  BEGIN
    PERFORM import_project_records(bad);
    RAISE EXCEPTION 'FAIL: invalid reference import accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  PERFORM pg_temp.assert_true((SELECT count(*)=before_count FROM projects),'failed import rolls the entire new project back');
END $$;
SELECT set_config('request.jwt.claim.sub','fa222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN
  BEGIN PERFORM import_project_records('{}'); RAISE EXCEPTION 'FAIL: inspector import accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
