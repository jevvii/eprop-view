\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES('aa111111-1111-4111-8111-111111111111'),('aa222222-2222-4222-8222-222222222222');
UPDATE profiles SET role='inspector' WHERE id='aa111111-1111-4111-8111-111111111111';
UPDATE profiles SET role='engineer' WHERE id='aa222222-2222-4222-8222-222222222222';
INSERT INTO projects(id,name) VALUES('bb111111-1111-4111-8111-111111111111','Analysis transaction test');
INSERT INTO inspections(id,project_id,lead_inspector_id,inspection_date,status,risk_score,risk_level) VALUES
 ('cc111111-1111-4111-8111-111111111111','bb111111-1111-4111-8111-111111111111','aa111111-1111-4111-8111-111111111111',CURRENT_DATE,'in_progress',0,'low');
INSERT INTO inspection_images(id,inspection_id,storage_path,uploader_id) VALUES('dd111111-1111-4111-8111-111111111111','cc111111-1111-4111-8111-111111111111','fixture.jpg','aa111111-1111-4111-8111-111111111111');
SET LOCAL ROLE service_role;
SELECT * FROM replace_image_detections('dd111111-1111-4111-8111-111111111111','aa222222-2222-4222-8222-222222222222','gemini',
 '[{"damage_type":"crack","severity":"high","severity_score":70,"confidence":0.8,"notes":"Visual suggestion only"}]');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM ai_damage_detections WHERE image_id='dd111111-1111-4111-8111-111111111111' AND provenance='gemini'),'Gemini result persists for engineer');
SELECT pg_temp.assert_true((SELECT risk_score=8.4 FROM inspections WHERE id='cc111111-1111-4111-8111-111111111111'),'risk derived from persisted detections');
DO $$ BEGIN
  BEGIN
    PERFORM replace_image_detections('dd111111-1111-4111-8111-111111111111','aa111111-1111-4111-8111-111111111111','gemini',
      '[{"damage_type":"invalid","severity":"high","severity_score":70,"confidence":0.8}]');
    RAISE EXCEPTION 'Invalid detection accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM ai_damage_detections WHERE image_id='dd111111-1111-4111-8111-111111111111' AND provenance='gemini'),'failed replacement retains previous result');
SELECT * FROM replace_image_detections('dd111111-1111-4111-8111-111111111111','aa111111-1111-4111-8111-111111111111','gemini','[]');
SELECT pg_temp.assert_true((SELECT risk_score=0 FROM inspections WHERE id='cc111111-1111-4111-8111-111111111111'),'no findings clears stale automated risk');
SELECT pg_temp.assert_true(consume_rate_limit('test-auth-budget',1,60),'first auth attempt allowed');
SELECT pg_temp.assert_true(NOT consume_rate_limit('test-auth-budget',1,60),'second auth attempt blocked');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM consume_rate_limit('test-auth-budget',100000,1); RAISE EXCEPTION 'Client changed budget';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM replace_image_detections('dd111111-1111-4111-8111-111111111111','aa222222-2222-4222-8222-222222222222','gemini','[]'); RAISE EXCEPTION 'Client impersonated analysis';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE image uuid := 'dd111111-1111-4111-8111-111111111111'; actor uuid := 'aa222222-2222-4222-8222-222222222222';
  rows jsonb := '[{"damage_type":"crack","severity":"high","severity_score":70,"confidence":0.8}]';
  result jsonb; finding uuid; model uuid; older uuid; newer uuid;
BEGIN
  result := commit_image_analysis(image,actor,'gemini',NULL,rows,NULL);
  finding := (result->'detections'->0->>'id')::uuid;
  UPDATE ai_damage_detections SET verified_by=actor WHERE id=finding;
  UPDATE ai_damage_detections SET verified_by=actor WHERE id=finding;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM maintenance_priorities WHERE source_detection_id=finding),'review retries create one maintenance ticket');
  UPDATE ai_damage_detections SET verified_by=NULL,is_rejected=true WHERE id=finding;
  result := commit_image_analysis(image,actor,'gemini',NULL,rows,NULL);
  PERFORM pg_temp.assert_true(jsonb_array_length(result->'detections')=0,'rerun preserves an identical rejected finding');
  PERFORM pg_temp.assert_true((SELECT risk_score=0 FROM inspections WHERE id='cc111111-1111-4111-8111-111111111111'),'rejected evidence is excluded from risk');
  result := commit_image_analysis(image,actor,'gemini',NULL,'[]',NULL);
  PERFORM pg_temp.assert_true(result->'job'->>'status'='completed' AND result->'job'->>'method'='gemini','zero findings still record method and completion');
  SELECT id INTO STRICT model FROM ai_models WHERE format='heuristic' LIMIT 1;
  INSERT INTO ai_analysis_jobs(image_id,model_id,status,created_at) VALUES(image,model,'running',now()-interval '1 hour') RETURNING id INTO older;
  INSERT INTO ai_analysis_jobs(image_id,model_id,status) VALUES(image,model,'running') RETURNING id INTO newer;
  result := commit_image_analysis(image,actor,'heuristic',model,rows,newer);
  PERFORM pg_temp.assert_true((SELECT status='failed' FROM ai_analysis_jobs WHERE id=older),'retry closes interrupted job');
  BEGIN
    PERFORM commit_image_analysis(image,actor,'heuristic',model,'[]',older);
    RAISE EXCEPTION 'superseded job modified evidence';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'A newer analysis has superseded this run' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM ai_damage_detections WHERE image_id=image AND provenance='heuristic'),'older job cannot clear newer findings');
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aa111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE image uuid := 'dd111111-1111-4111-8111-111111111111';
  rows jsonb := '[{"damage_type":"crack","severity":"high","severity_score":70,"source_confidence":0.8,"bbox":{"x":0,"y":0,"width":0.2,"height":0.2}}]';
BEGIN
  PERFORM pg_temp.assert_true(replace_annotation_candidates(image,rows)=1,'suggestions create draft boxes');
  BEGIN
    PERFORM replace_annotation_candidates(image,'[{"damage_type":"bad"}]');
    RAISE EXCEPTION 'invalid replacement succeeded';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM image_annotations WHERE image_id=image),'failed replacement retains previous draft');
  -- Simulate a draft created in a previous transaction before the user edits it.
  UPDATE image_annotations SET created_at=now()-interval '1 minute', notes='Reviewed texture' WHERE image_id=image;
  PERFORM pg_temp.assert_true(replace_annotation_candidates(image,rows)=0,'manual notes survive rerun without a duplicate box');
  PERFORM pg_temp.assert_true((SELECT notes='Reviewed texture' FROM image_annotations WHERE image_id=image),'suggestions retain reviewer edits');
END $$;
RESET ROLE;
ROLLBACK;
\echo PASS analysis transaction, Gemini provenance, risk reset and server-only rate budgets
