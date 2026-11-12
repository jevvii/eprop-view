\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES('ab111111-1111-4111-8111-111111111111');
UPDATE profiles SET role='engineer' WHERE id='ab111111-1111-4111-8111-111111111111';
INSERT INTO projects(id,name) VALUES('bc111111-1111-4111-8111-111111111111','Filter fixture');
INSERT INTO inspections(id,project_id,inspection_date,status,risk_score,risk_level) VALUES('cd111111-1111-4111-8111-111111111111','bc111111-1111-4111-8111-111111111111','2026-11-12','in_progress',8.5,'critical');
INSERT INTO reports(id,project_id,inspection_id,title,date,status,risk_score) VALUES('de111111-1111-4111-8111-111111111111','bc111111-1111-4111-8111-111111111111','cd111111-1111-4111-8111-111111111111','Critical sample','2026-11-12','open',8.5);
INSERT INTO maintenance_priorities(id,project_id,title,status,risk_score) VALUES('ef111111-1111-4111-8111-111111111111','bc111111-1111-4111-8111-111111111111','Repair','pending',8.5);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab111111-1111-4111-8111-111111111111',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM filter_workspace_records('reports','{"risk":"critical"}')),'8.5 is critical in reports and filtering');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM filter_workspace_records('inspections','{"risk":"critical"}')),'inspection risk filter works');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM filter_workspace_records('maintenance','{"status":"pending"}')),'maintenance status filter works');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM filter_workspace_records('reports','{"damage":"crack"}')),'unmatched damage type excludes report');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM filter_workspace_records('reports','{"from":"2026-11-13"}')),'date filters execute on server');
SELECT pg_temp.assert_true((SELECT value=8.5 FROM filtered_damage_trends('{"risk":"critical"}')), 'chart uses the same filtered inspection risk');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM filtered_damage_trends('{"damage":"crack"}')), 'damage filter also applies to chart');
RESET ROLE;
ROLLBACK;
\echo PASS server workspace filters and consistent risk bands
