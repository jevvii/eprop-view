-- Runs against the designated Preview database and rolls back.
-- Creates its own project/inspection/image fixtures in public tables, so it
-- needs no auth.users rows and never depends on pre-existing demo data.
-- Usage: psql "$PREVIEW_DATABASE_URL" -f supabase/tests/trained_detector_preview.sql
\set ON_ERROR_STOP on
BEGIN;
-- The hosted check uses an existing reviewer. CI has an empty auth schema.
\if :{?disposable_ci}
INSERT INTO auth.users(id) VALUES ('bb982e65-349a-4718-85db-23fda0bd5eb7');
UPDATE public.profiles SET role='engineer', is_active=true
  WHERE id='bb982e65-349a-4718-85db-23fda0bd5eb7';
\endif
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;

DO $$
DECLARE
  actor uuid;
  project uuid := gen_random_uuid();
  insp uuid := gen_random_uuid();
  image uuid := gen_random_uuid();
  trained uuid;
  heuristic uuid;
  result jsonb;
  finding uuid;
  older uuid;
  newer uuid;
  mixed jsonb := '[
    {"damage_type":"crack","severity":"high","severity_score":75,"confidence":0.82,
     "provenance":"model","bbox":{"x":0.10,"y":0.10,"width":0.20,"height":0.20}},
    {"damage_type":"corrosion","severity":"medium","severity_score":40,"confidence":0.70,
     "provenance":"heuristic","bbox":{"x":0.50,"y":0.50,"width":0.20,"height":0.20}}]';
BEGIN
  SELECT id INTO actor FROM public.profiles WHERE role='engineer' AND is_active LIMIT 1;
  IF actor IS NULL THEN SELECT id INTO actor FROM public.profiles WHERE role='admin' AND is_active LIMIT 1; END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'No active engineer/admin profile in this database'; END IF;

  INSERT INTO public.projects(id,name) VALUES(project,'Trained detector transaction test');
  INSERT INTO public.inspections(id,project_id,lead_inspector_id,inspection_date,status,risk_score,risk_level)
    VALUES(insp,project,actor,CURRENT_DATE,'in_progress',0,'low');
  INSERT INTO public.inspection_images(id,inspection_id,storage_path,uploader_id)
    VALUES(image,insp,'fixture.jpg',actor);

  SELECT id INTO STRICT trained FROM public.ai_models WHERE metadata->>'artifact'='crack-ssdlite320-damsegment-v1';
  SELECT id INTO STRICT heuristic FROM public.ai_models WHERE format='heuristic' AND is_active LIMIT 1;

  -- 1. One run, two provenances, actual method + digest recorded.
  result := commit_image_analysis_v2(image, actor, 'model', trained, mixed, NULL,
    '{"primary":"model","crack_count":1,"other_count":1,"artifact_sha256":"abc123"}');
  PERFORM pg_temp.assert_true(jsonb_array_length(result->'detections')=2,'mixed run persists both findings');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM ai_damage_detections WHERE image_id=image AND provenance='model'),'trained crack keeps model provenance');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM ai_damage_detections WHERE image_id=image AND provenance='heuristic'),'heuristic corrosion keeps heuristic provenance');
  PERFORM pg_temp.assert_true(result->'job'->>'status'='completed' AND result->'job'->>'method'='model','job records the trained method');
  PERFORM pg_temp.assert_true((result->'job'->'method_detail'->>'crack_count')::int=1,'job records the crack count');
  PERFORM pg_temp.assert_true((result->'job'->'method_detail'->>'artifact_sha256')='abc123','job records the artifact digest');

  -- 2. Rerunning replaces, never duplicates, unreviewed evidence.
  result := commit_image_analysis_v2(image, actor, 'model', trained, mixed, NULL, '{"primary":"model"}');
  PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM ai_damage_detections WHERE image_id=image),'rerun does not duplicate boxes');

  -- 3. Reviewed crack survives a method switch; an overlapping re-proposal from
  --    the other method is suppressed; unreviewed prior-method rows are cleared.
  SELECT id INTO STRICT finding FROM ai_damage_detections
    WHERE image_id=image AND provenance='model' AND damage_type='crack';
  UPDATE ai_damage_detections SET verified_by=actor, severity='high' WHERE id=finding;
  result := commit_image_analysis_v2(image, actor, 'heuristic', heuristic, '[
      {"damage_type":"crack","severity":"high","severity_score":70,"confidence":0.66,
       "provenance":"heuristic","bbox":{"x":0.11,"y":0.11,"width":0.20,"height":0.20}}]',
    NULL, '{"primary":"heuristic","fallback_reason":"artifact checksum mismatch"}');
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM ai_damage_detections WHERE id=finding),'reviewed finding survives a method switch');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM ai_damage_detections
      WHERE image_id=image AND provenance='heuristic' AND damage_type='crack'),'overlapping crack re-proposal is suppressed');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM ai_damage_detections
      WHERE image_id=image AND damage_type='corrosion'),'unreviewed findings from the previous method are cleared');
  PERFORM pg_temp.assert_true((result->'job'->'method_detail'->>'fallback_reason')='artifact checksum mismatch','fallback reason is durable');
  PERFORM pg_temp.assert_true((SELECT risk_score FROM inspections WHERE id=insp)=9.0,'risk uses the reviewed finding only, without inflation');

  -- 4. A successful empty run is distinguishable and keeps reviewed evidence.
  result := commit_image_analysis_v2(image, actor, 'model', trained, '[]', NULL,
    '{"primary":"model","crack_count":0,"other_count":0}');
  PERFORM pg_temp.assert_true(jsonb_array_length(result->'detections')=0,'empty success returns no findings');
  PERFORM pg_temp.assert_true(result->'job'->>'status'='completed' AND result->'job'->>'method'='model','empty success still records completion and method');
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM ai_damage_detections WHERE id=finding),'empty run preserves reviewed evidence');

  -- 5. Retry/concurrency: a newer job supersedes an interrupted older one.
  INSERT INTO ai_analysis_jobs(image_id,model_id,method,status,created_at)
    VALUES(image,trained,'model','running',clock_timestamp()-interval '1 hour') RETURNING id INTO older;
  INSERT INTO ai_analysis_jobs(image_id,model_id,method,status,created_at)
    VALUES(image,trained,'model','running',clock_timestamp()) RETURNING id INTO newer;
  result := commit_image_analysis_v2(image, actor, 'model', trained, mixed, newer, '{"primary":"model"}');
  PERFORM pg_temp.assert_true((SELECT status='failed' FROM ai_analysis_jobs WHERE id=older),'interrupted older job is closed');
  BEGIN
    PERFORM commit_image_analysis_v2(image, actor, 'model', trained, '[]', older, '{}');
    RAISE EXCEPTION 'superseded job modified evidence';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'A newer analysis has superseded this run' THEN RAISE; END IF;
  END;

  -- 6. Only local provenances may be committed through this path.
  BEGIN
    PERFORM commit_image_analysis_v2(image, actor, 'model', trained,
      '[{"damage_type":"crack","severity":"low","severity_score":10,"confidence":0.5,
         "provenance":"gemini","bbox":{"x":0.2,"y":0.2,"width":0.1,"height":0.1}}]', NULL, '{}');
    RAISE EXCEPTION 'invalid provenance accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Invalid detection provenance' THEN RAISE; END IF;
  END;

  -- 7. A normal authenticated client must not be able to commit analysis.
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM commit_image_analysis_v2(image, actor, 'model', trained, '[]', NULL, '{}');
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'client executed the analysis transaction';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
  END;
END $$;
ROLLBACK;
\echo PASS trained detector transaction, mixed provenance, dedupe, empty success and supersede (rolled back)
