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
INSERT INTO inspection_images(id,inspection_id,storage_path) VALUES('dd111111-1111-4111-8111-111111111111','cc111111-1111-4111-8111-111111111111','fixture.jpg');
SET LOCAL ROLE service_role;
SELECT * FROM replace_image_detections('dd111111-1111-4111-8111-111111111111','aa222222-2222-4222-8222-222222222222','gemini',
 '[{"damage_type":"crack","severity":"high","severity_score":70,"confidence":0.8,"notes":"Visual suggestion only"}]');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM ai_damage_detections WHERE provenance='gemini'),'Gemini result persists for engineer');
SELECT pg_temp.assert_true((SELECT risk_score=8.4 FROM inspections WHERE id='cc111111-1111-4111-8111-111111111111'),'risk derived from persisted detections');
DO $$ BEGIN
  BEGIN
    PERFORM replace_image_detections('dd111111-1111-4111-8111-111111111111','aa111111-1111-4111-8111-111111111111','gemini',
      '[{"damage_type":"invalid","severity":"high","severity_score":70,"confidence":0.8}]');
    RAISE EXCEPTION 'Invalid detection accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM ai_damage_detections WHERE provenance='gemini'),'failed replacement retains previous result');
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
ROLLBACK;
\echo PASS analysis transaction, Gemini provenance, risk reset and server-only rate budgets
