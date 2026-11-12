-- Run only on an isolated database after migration020. Every fixture rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public, extensions;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users(id) VALUES ('61111111-1111-4111-8111-111111111111') ON CONFLICT DO NOTHING;
  END IF;
END $$;
INSERT INTO profiles(id,role,is_active) VALUES ('61111111-1111-4111-8111-111111111111','admin',true)
  ON CONFLICT(id) DO UPDATE SET role='admin',is_active=true;
INSERT INTO projects(id,name,geom) VALUES
 ('62111111-1111-4111-8111-111111111111','Fault centre',ST_GeomFromText('POINT(0 0)',4326)),
 ('62222222-2222-4222-8222-222222222222','Polygon hole',ST_GeomFromText('POINT(2 2)',4326)),
 ('62333333-3333-4333-8333-333333333333','Second polygon',ST_GeomFromText('POINT(10.5 10.5)',4326)),
 ('62444444-4444-4444-8444-444444444444','No coordinate',NULL);
INSERT INTO geospatial_zones(id,name,zone_type,risk_level,geom,is_active) VALUES
 ('63111111-1111-4111-8111-111111111111','Full fault trace','fault_line','zone_a',ST_GeomFromText('LINESTRING(-1 0,1 0)',4326),true),
 ('63222222-2222-4222-8222-222222222222','Multipart flood with hole','flood','zone_a',ST_GeomFromText('MULTIPOLYGON(((0 0,4 0,4 4,0 4,0 0),(1 1,1 3,3 3,3 1,1 1)),((10 10,11 10,11 11,10 11,10 10)))',4326),true),
 ('63333333-3333-4333-8333-333333333333','Unrelated liquefaction','liquefaction','zone_a',ST_GeomFromText('POLYGON((20 20,21 20,21 21,20 21,20 20))',4326),true),
 ('63444444-4444-4444-8444-444444444444','Inactive flood','flood','zone_a',ST_GeomFromText('POLYGON((1 1,3 1,3 3,1 3,1 1))',4326),false);
INSERT INTO buildings(id,project_id,name) VALUES ('64111111-1111-4111-8111-111111111111','62111111-1111-4111-8111-111111111111','Movement fixture');
INSERT INTO inspections(id,project_id,lead_inspector_id,building_id,inspection_date,status,risk_score,risk_level,location) VALUES
 ('65111111-1111-4111-8111-111111111111','62111111-1111-4111-8111-111111111111','61111111-1111-4111-8111-111111111111','64111111-1111-4111-8111-111111111111',CURRENT_DATE,'in_progress',5,'moderate','Fixture');
INSERT INTO environmental_risks(project_id,erosion_potential,overall_risk_score) VALUES ('62111111-1111-4111-8111-111111111111','low',5);
INSERT INTO inspection_images(id,inspection_id,storage_path) VALUES ('66111111-1111-4111-8111-111111111111','65111111-1111-4111-8111-111111111111','fixture/evidence.jpg');
SELECT set_config('request.jwt.claim.sub','61111111-1111-4111-8111-111111111111',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT (z->>'distance_m')::double precision < 0.001 FROM jsonb_array_elements(project_hazard_context('62111111-1111-4111-8111-111111111111')->'zones') z WHERE z->>'zone_type'='fault_line'),'fault-line interior distance is zero');
SELECT pg_temp.assert_true((SELECT NOT (z->>'covers_site')::boolean FROM jsonb_array_elements(project_hazard_context('62222222-2222-4222-8222-222222222222')->'zones') z WHERE z->>'zone_type'='flood'),'polygon hole excludes the site');
SELECT pg_temp.assert_true((SELECT (z->>'covers_site')::boolean FROM jsonb_array_elements(project_hazard_context('62333333-3333-4333-8333-333333333333')->'zones') z WHERE z->>'zone_type'='flood'),'second multipolygon shell includes the site');
SELECT pg_temp.assert_true((SELECT NOT (z->>'covers_site')::boolean FROM jsonb_array_elements(project_hazard_context('62111111-1111-4111-8111-111111111111')->'zones') z WHERE z->>'zone_type'='liquefaction'),'nearby fault does not imply unrelated liquefaction membership');
SELECT pg_temp.assert_true(jsonb_array_length(project_hazard_context('62222222-2222-4222-8222-222222222222')->'zones')=3,'inactive layer is excluded');
DO $$ BEGIN
  BEGIN PERFORM project_hazard_context('62444444-4444-4444-8444-444444444444');
    RAISE EXCEPTION 'FAIL: missing coordinates were accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
INSERT INTO ai_damage_detections(id,image_id,damage_type,severity,severity_score,confidence,provenance,crack_width_band)
 VALUES ('67111111-1111-4111-8111-111111111111','66111111-1111-4111-8111-111111111111','crack','medium',40,0.7,'heuristic','wide');
SELECT pg_temp.assert_true((SELECT raw_severity_score=40 AND severity_score=50 FROM ai_damage_detections WHERE id='67111111-1111-4111-8111-111111111111'),'category weights preserve raw baseline');
SELECT pg_temp.assert_true((SELECT risk_score=6 FROM inspections WHERE id='65111111-1111-4111-8111-111111111111'),'detection contributes to inspection risk');
UPDATE ai_damage_detections SET crack_width_band='severe' WHERE id='67111111-1111-4111-8111-111111111111';
UPDATE ai_damage_detections SET crack_width_band='severe' WHERE id='67111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_true((SELECT raw_severity_score=40 AND severity_score=56 FROM ai_damage_detections WHERE id='67111111-1111-4111-8111-111111111111'),'repeat taxonomy editing never compounds weights');
DELETE FROM ai_damage_detections WHERE id='67111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_true((SELECT risk_score=0 FROM inspections WHERE id='65111111-1111-4111-8111-111111111111'),'removing last detection clears derived risk');
UPDATE inspections SET erosion_condition='severe' WHERE id='65111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_true((SELECT erosion_potential='severe' AND abs(overall_risk_score-5.9)<0.01 FROM environmental_risks WHERE project_id='62111111-1111-4111-8111-111111111111'),'field erosion updates existing project contribution');
INSERT INTO settlement_observations(building_id,inspection_id,observed_at,classification,tilt_mm_per_m,recorded_by)
 VALUES ('64111111-1111-4111-8111-111111111111','65111111-1111-4111-8111-111111111111',now()-interval '1 hour','none',0.5,auth.uid()),
 ('64111111-1111-4111-8111-111111111111','65111111-1111-4111-8111-111111111111',now(),'action_required',5,auth.uid());
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(classification='action_required') FROM settlement_overview('62111111-1111-4111-8111-111111111111')),'movement overview takes latest building reading');
RESET ROLE;
ROLLBACK;
\echo 'PASS geospatial/domain: full trace distance, polygon holes/multipolygon, missing coordinates, active layers, risk weighting, erosion and latest movement'
