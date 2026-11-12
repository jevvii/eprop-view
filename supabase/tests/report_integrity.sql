-- Run on an isolated database after migrations 017/018. All fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_value boolean,p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',p_message; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_failure(p_sql text,p_pattern text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text;
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
    IF message ~* p_pattern THEN RETURN; END IF;
    RAISE EXCEPTION 'Unexpected rejection: % (wanted %)',message,p_pattern;
  END;
  RAISE EXCEPTION 'Expected rejection: %',p_sql;
END $$;
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users(id) VALUES ('a1111111-1111-4111-8111-111111111111'),('a2222222-2222-4222-8222-222222222222'),('a3333333-3333-4333-8333-333333333333'),('a4444444-4444-4444-8444-444444444444') ON CONFLICT DO NOTHING;
  END IF;
END $$;
INSERT INTO profiles(id,role,is_active) VALUES
 ('a1111111-1111-4111-8111-111111111111','inspector',true),
 ('a2222222-2222-4222-8222-222222222222','inspector',true),
 ('a3333333-3333-4333-8333-333333333333','engineer',true),
 ('a4444444-4444-4444-8444-444444444444','viewer',true)
 ON CONFLICT(id) DO UPDATE SET role=excluded.role,is_active=true;
INSERT INTO projects(id,name) VALUES ('b1111111-1111-4111-8111-111111111111','Report integrity fixture');
INSERT INTO inspections(id,project_id,lead_inspector_id,inspection_date,status,risk_score,risk_level,location) VALUES
 ('c1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',CURRENT_DATE,'in_progress',5,'moderate','Own'),
 ('c2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222',CURRENT_DATE,'in_progress',5,'moderate','Other');
INSERT INTO reports(id,report_id,project_id,inspection_id,title,date,location,status,risk_score) VALUES
 ('d1111111-1111-4111-8111-111111111111','AUDIT-OPEN','b1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','Open fixture',CURRENT_DATE,'Own','open',5),
 ('d2222222-2222-4222-8222-222222222222','AUDIT-COMPLETE','b1111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222','Historical complete',CURRENT_DATE,'Other','completed',5);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
INSERT INTO recommendations(id,inspection_id,draft_text,provenance) VALUES ('e1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','Inspector draft','engineer');
SELECT pg_temp.expect_failure($q$INSERT INTO recommendations(inspection_id,draft_text) VALUES ('c2222222-2222-4222-8222-222222222222','Foreign draft')$q$,'row-level security');
SELECT pg_temp.expect_failure($q$UPDATE recommendations SET status='signed',signed_by=auth.uid(),signed_at=now(),final_text='Forged signature' WHERE id='e1111111-1111-4111-8111-111111111111'$q$,'Only engineers|row-level security');
SELECT pg_temp.expect_failure($q$INSERT INTO cost_estimates(inspection_id,confirmed_by,confirmed_at) VALUES ('c1111111-1111-4111-8111-111111111111',auth.uid(),now())$q$,'row-level security');
SELECT pg_temp.expect_failure($q$INSERT INTO report_revisions(report_id,revision_number,snapshot) VALUES ('d1111111-1111-4111-8111-111111111111',1,'{}')$q$,'permission denied');
SELECT pg_temp.expect_failure($q$SELECT save_report_revision('d1111111-1111-4111-8111-111111111111','{"title":"Forbidden"}')$q$,'Engineering role required');
SELECT pg_temp.expect_failure($q$SELECT sign_report_recommendation('e1111111-1111-4111-8111-111111111111','Forged')$q$,'Engineering role required');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM recommendations),'inspector can only read own drafts');

SELECT set_config('request.jwt.claim.sub','a4444444-4444-4444-8444-444444444444',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM reports),'viewer reads only completed reports');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM recommendations),'viewer cannot read unpublished drafts');

SELECT set_config('request.jwt.claim.sub','a3333333-3333-4333-8333-333333333333',true);
SELECT pg_temp.expect_failure($q$SELECT save_report_revision('d2222222-2222-4222-8222-222222222222','{"title":"Forbidden locked edit"}')$q$,'locked');
SELECT pg_temp.expect_failure($q$UPDATE reports SET title='No revision' WHERE id='d1111111-1111-4111-8111-111111111111'$q$,'permission denied');
INSERT INTO recommendations(id,inspection_id,report_id,draft_text,provenance) VALUES ('e2222222-2222-4222-8222-222222222222','c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111','Engineer draft','engineer');
INSERT INTO cost_estimates(id,report_id,inspection_id,table_estimate_php,ai_likely_php,divergence_flag) VALUES ('f1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111',10000,100000,true);
SELECT pg_temp.expect_failure($q$SELECT sign_report_recommendation('e2222222-2222-4222-8222-222222222222','Repair after investigation')$q$,'Confirm divergent');
SELECT pg_temp.assert_true((SELECT status='draft' FROM recommendations WHERE id='e2222222-2222-4222-8222-222222222222'),'failed sign preserves draft');
UPDATE cost_estimates SET confirmed_by=auth.uid(),confirmed_at=now(),override_reason='Site access complexity reviewed' WHERE id='f1111111-1111-4111-8111-111111111111';
SELECT sign_report_recommendation('e2222222-2222-4222-8222-222222222222','Repair after investigation');
UPDATE recommendations SET final_text='Silent overwrite' WHERE id='e2222222-2222-4222-8222-222222222222';
SELECT pg_temp.assert_true((SELECT final_text='Repair after investigation' FROM recommendations WHERE id='e2222222-2222-4222-8222-222222222222'),'signed wording cannot be overwritten through direct API');
INSERT INTO report_limitations(report_id,free_text,created_by) VALUES ('d1111111-1111-4111-8111-111111111111','No concealed elements inspected',auth.uid());
SELECT save_report_revision('d1111111-1111-4111-8111-111111111111','{"status":"completed"}');
SELECT pg_temp.assert_true((SELECT reviewed_by=auth.uid() AND reviewed_at IS NOT NULL FROM reports WHERE id='d1111111-1111-4111-8111-111111111111'),'completion stamps reviewer identity');
SELECT create_report_share('d1111111-1111-4111-8111-111111111111',repeat('A',32),now()+interval '14 days');
SELECT save_report_revision('d1111111-1111-4111-8111-111111111111','{"title":"New live title"}',true);
SELECT pg_temp.assert_true((SELECT status='open' FROM reports WHERE id='d1111111-1111-4111-8111-111111111111'),'explicit reopen produces a draft');
SELECT pg_temp.assert_true((SELECT snapshot->'report'->>'title'='Open fixture' FROM share_tokens WHERE token=repeat('A',32)),'share retains original signed content after live edit');
SELECT pg_temp.expect_failure($q$SELECT save_report_revision('d1111111-1111-4111-8111-111111111111','{"title":"Stale"}',false,'2000-01-01T00:00:00Z')$q$,'Reload before saving');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM report_revisions WHERE report_id='d1111111-1111-4111-8111-111111111111'),'failed edits create no spurious revision');
SELECT pg_temp.expect_failure($q$DELETE FROM report_revisions WHERE report_id='d1111111-1111-4111-8111-111111111111'$q$,'permission denied');
SELECT revoke_report_share(id) FROM share_tokens WHERE token=repeat('A',32);
SELECT pg_temp.assert_true((SELECT revoked_at IS NOT NULL FROM share_tokens WHERE token=repeat('A',32)),'share revocation is recorded');
RESET ROLE;
ROLLBACK;
\echo 'PASS report integrity: role boundaries, lock/reopen, signing, revisions, snapshot and revocation'
