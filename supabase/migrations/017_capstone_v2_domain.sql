-- =================================================================
-- Migration 017: Capstone v2 domain model
--
-- Additive and idempotent. No DROP COLUMN, no renames. Safe to re-run.
--
-- Adds the schema behind the agreed panelist additions:
--   A1 tilt / sinking          -> settlement_observations
--   A2 crack categories        -> ai_damage_detections columns (ACI 224R-01 / ACI 201.1R)
--   A4 editable reports        -> report_revisions
--   A5 recommendation          -> recommendations
--   A6 severity/cost/action    -> cost_estimates
--   A7 structural limitations  -> report_limitations
--   A8 flood/geohazard checks  -> checklist_templates + checklist_responses
--   B1 rebound hammer          -> rebound_tests + rebound_readings
--   B2 soil investigation      -> soil_investigations
--   B3 erosion                 -> inspections columns
--   B4 forensic engineering    -> forensic_assessments + forensic_evidence
--   Admin gaps                 -> audit_events, share_tokens, projects.archived_at
-- =================================================================
BEGIN;

-- -----------------------------------------------------------------
-- A2. Crack taxonomy — ACI 224R-01 width bands, ACI 201.1R cause
-- -----------------------------------------------------------------
ALTER TABLE public.ai_damage_detections
  ADD COLUMN IF NOT EXISTS crack_width_mm     numeric(6,2),
  ADD COLUMN IF NOT EXISTS crack_width_band   text,
  ADD COLUMN IF NOT EXISTS crack_orientation  text,
  ADD COLUMN IF NOT EXISTS crack_pattern      text,
  ADD COLUMN IF NOT EXISTS crack_cause        text,
  ADD COLUMN IF NOT EXISTS aci_reference      text;

DO $$ BEGIN
  ALTER TABLE public.ai_damage_detections ADD CONSTRAINT ai_detections_crack_width_band_check
    CHECK (crack_width_band IS NULL OR crack_width_band IN ('hairline','fine','medium','wide','severe'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ai_damage_detections ADD CONSTRAINT ai_detections_crack_orientation_check
    CHECK (crack_orientation IS NULL OR crack_orientation IN ('vertical','horizontal','diagonal','stepped','map_cracking','none'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ai_damage_detections ADD CONSTRAINT ai_detections_crack_pattern_check
    CHECK (crack_pattern IS NULL OR crack_pattern IN ('single','multiple','parallel','random','none'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ai_damage_detections ADD CONSTRAINT ai_detections_crack_cause_check
    CHECK (crack_cause IS NULL OR crack_cause IN ('settlement','shrinkage','thermal','overload','corrosion_induced','unknown','none'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- -----------------------------------------------------------------
-- B3. Erosion observation, and reopen support on inspections
-- -----------------------------------------------------------------
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS erosion_condition text,
  ADD COLUMN IF NOT EXISTS erosion_type      text,
  ADD COLUMN IF NOT EXISTS erosion_notes     text,
  ADD COLUMN IF NOT EXISTS reopened_at       timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.inspections ADD CONSTRAINT inspections_erosion_condition_check
    CHECK (erosion_condition IS NULL OR erosion_condition IN ('none','minor','moderate','severe'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.inspections ADD CONSTRAINT inspections_erosion_type_check
    CHECK (erosion_type IS NULL OR erosion_type IN ('surface','gully','coastal','riverbank','internal','other'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- -----------------------------------------------------------------
-- A1. Tilt / differential settlement readings
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_observations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id               uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  inspection_id             uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  observed_at               timestamptz NOT NULL DEFAULT now(),
  tilt_mm_per_m             numeric(8,3),
  differential_settlement_mm numeric(8,2),
  classification            text NOT NULL DEFAULT 'none',
  measurement_method        text NOT NULL DEFAULT 'manual',
  notes                     text,
  recorded_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_classification_check
    CHECK (classification IN ('none','monitor','action_required')),
  CONSTRAINT settlement_measurement_method_check
    CHECK (measurement_method IN ('manual','level','plumb','instrument'))
);

CREATE INDEX IF NOT EXISTS settlement_observations_building_idx
  ON public.settlement_observations(building_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS settlement_observations_inspection_idx
  ON public.settlement_observations(inspection_id);

-- -----------------------------------------------------------------
-- B1. Rebound hammer — readings array plus computed summary
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rebound_tests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id         uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  structural_element_id uuid REFERENCES public.structural_elements(id) ON DELETE SET NULL,
  test_date             date NOT NULL DEFAULT CURRENT_DATE,
  impact_direction      text NOT NULL DEFAULT 'horizontal',
  instrument_serial     text,
  readings_count        integer NOT NULL DEFAULT 0,
  outlier_count         integer NOT NULL DEFAULT 0,
  mean_rebound          numeric(6,2),
  corrected_rebound     numeric(6,2),
  estimated_strength_mpa numeric(7,2),
  correlation_reference text,
  performed_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rebound_impact_direction_check
    CHECK (impact_direction IN ('horizontal','upward','downward','any'))
);

CREATE INDEX IF NOT EXISTS rebound_tests_inspection_idx ON public.rebound_tests(inspection_id);
CREATE INDEX IF NOT EXISTS rebound_tests_element_idx ON public.rebound_tests(structural_element_id);

CREATE TABLE IF NOT EXISTS public.rebound_readings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id       uuid NOT NULL REFERENCES public.rebound_tests(id) ON DELETE CASCADE,
  reading_index integer NOT NULL,
  rebound_value integer NOT NULL,
  is_outlier    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, reading_index)
);

-- -----------------------------------------------------------------
-- B2. Soil investigation — building / site level
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.soil_investigations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  building_id              uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  borehole_id              text NOT NULL,
  depth_m                  numeric(7,2),
  soil_classification      text,
  spt_n_value              integer,
  groundwater_depth_m      numeric(7,2),
  liquefaction_susceptibility text NOT NULL DEFAULT 'unknown',
  investigation_date       date NOT NULL DEFAULT CURRENT_DATE,
  source                   text NOT NULL DEFAULT 'field',
  notes                    text,
  recorded_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT soil_liquefaction_check
    CHECK (liquefaction_susceptibility IN ('none','low','moderate','high','unknown')),
  CONSTRAINT soil_source_check
    CHECK (source IN ('field','laboratory','third_party','desk_study')),
  CONSTRAINT soil_target_present CHECK (project_id IS NOT NULL OR building_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS soil_investigations_project_idx ON public.soil_investigations(project_id);
CREATE INDEX IF NOT EXISTS soil_investigations_building_idx ON public.soil_investigations(building_id);

-- -----------------------------------------------------------------
-- B4. Forensic engineering — hypothesis, narrative, evidence chain
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.forensic_assessments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id         uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  report_id             uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  failure_hypothesis    text NOT NULL DEFAULT 'unknown',
  mechanism_narrative   text,
  conclusion            text,
  recommended_next_step text,
  author_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forensic_hypothesis_check
    CHECK (failure_hypothesis IN ('material','design','construction','overload','settlement','deterioration','other','unknown'))
);

CREATE INDEX IF NOT EXISTS forensic_assessments_inspection_idx ON public.forensic_assessments(inspection_id);

CREATE TABLE IF NOT EXISTS public.forensic_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.forensic_assessments(id) ON DELETE CASCADE,
  image_id      uuid REFERENCES public.inspection_images(id) ON DELETE SET NULL,
  detection_id  uuid REFERENCES public.ai_damage_detections(id) ON DELETE SET NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forensic_evidence_target CHECK (image_id IS NOT NULL OR detection_id IS NOT NULL)
);

-- -----------------------------------------------------------------
-- A8. Versioned checklists (flood map, geohazard map)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  title      text NOT NULL,
  items      jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE TABLE IF NOT EXISTS public.checklist_responses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id    uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  template_code    text NOT NULL,
  template_version integer NOT NULL,
  responses        jsonb NOT NULL DEFAULT '[]'::jsonb,
  prefilled_from   text NOT NULL DEFAULT 'geospatial_zones',
  completed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, template_code)
);

INSERT INTO public.checklist_templates (code, version, title, items)
VALUES
  ('flood_map', 1, 'Flood Map Verification', '[
     {"key":"in_flood_zone","label":"Site falls inside a mapped flood zone","auto":"flood_zone_membership"},
     {"key":"flood_depth_known","label":"Design flood depth for the zone is recorded"},
     {"key":"drainage_adequate","label":"Site drainage and outfall observed as adequate"},
     {"key":"historical_flooding","label":"Historical flooding at the site confirmed or excluded"},
     {"key":"finished_floor_level","label":"Finished floor level is above the design flood depth"},
     {"key":"flood_mitigation","label":"Flood mitigation measures present and serviceable"}
   ]'::jsonb),
  ('geohazard_map', 1, 'Geohazard Map Verification', '[
     {"key":"near_fault_line","label":"Site proximity to the nearest active fault line verified","auto":"fault_line_proximity"},
     {"key":"liquefaction_zone","label":"Liquefaction susceptibility zone verified","auto":"liquefaction_zone_membership"},
     {"key":"erosion_zone","label":"Erosion-prone zone verified","auto":"erosion_zone_membership"},
     {"key":"landslide_zone","label":"Landslide or slope instability zone verified","auto":"landslide_zone_membership"},
     {"key":"ground_movement_evidence","label":"Ground movement or displacement observed"},
     {"key":"setback_respected","label":"Required hazard setback distances are respected"}
   ]'::jsonb)
ON CONFLICT (code, version) DO NOTHING;

-- -----------------------------------------------------------------
-- A4. Report revision history
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_revisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  revision_number  integer NOT NULL,
  snapshot         jsonb NOT NULL,
  changed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, revision_number)
);

CREATE INDEX IF NOT EXISTS report_revisions_report_idx ON public.report_revisions(report_id, revision_number DESC);

-- -----------------------------------------------------------------
-- A7. Assessment limitation statement
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_limitations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL UNIQUE REFERENCES public.reports(id) ON DELETE CASCADE,
  standard_exclusions text[] NOT NULL DEFAULT ARRAY[
    'Visual assessment only; no destructive or laboratory testing performed',
    'No foundation exposure or excavation undertaken',
    'Inaccessible or concealed areas were not inspected',
    'No load testing was performed',
    'Findings reflect conditions observed on the inspection date only'
  ]::text[],
  free_text          text,
  element_notes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------
-- A6. Cost estimates — AI range cross-checked against the table
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_estimates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id         uuid REFERENCES public.inspections(id) ON DELETE CASCADE,
  detection_id          uuid REFERENCES public.ai_damage_detections(id) ON DELETE CASCADE,
  report_id             uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  ai_low_php            numeric(12,2),
  ai_likely_php         numeric(12,2),
  ai_high_php           numeric(12,2),
  ai_basis              text,
  ai_confidence         numeric(4,3),
  table_estimate_php    numeric(12,2),
  divergence_flag       boolean NOT NULL DEFAULT false,
  provenance            text NOT NULL DEFAULT 'table',
  override_php          numeric(12,2),
  override_reason       text,
  confirmed_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cost_provenance_check
    CHECK (provenance IN ('table','gemini','engineer')),
  CONSTRAINT cost_target_present
    CHECK (inspection_id IS NOT NULL OR detection_id IS NOT NULL OR report_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS cost_estimates_inspection_idx ON public.cost_estimates(inspection_id);

-- -----------------------------------------------------------------
-- A5. Recommendations — AI draft, engineer signs
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recommendations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  uuid REFERENCES public.inspections(id) ON DELETE CASCADE,
  report_id      uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  detection_id   uuid REFERENCES public.ai_damage_detections(id) ON DELETE SET NULL,
  draft_text     text,
  final_text     text,
  status         text NOT NULL DEFAULT 'draft',
  provenance     text NOT NULL DEFAULT 'gemini',
  signed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  signed_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendations_status_check CHECK (status IN ('draft','signed','superseded')),
  CONSTRAINT recommendations_provenance_check CHECK (provenance IN ('gemini','engineer','heuristic')),
  CONSTRAINT recommendations_target_present CHECK (inspection_id IS NOT NULL OR report_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS recommendations_report_idx ON public.recommendations(report_id, status);

-- -----------------------------------------------------------------
-- Admin gaps: audit trail and report sharing
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_events (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role  text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON public.audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON public.audit_events(created_at DESC);

-- Stamp the actor server-side so a client cannot forge another user's identity.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_before      jsonb DEFAULT NULL,
  p_after       jsonb DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id bigint;
BEGIN
  INSERT INTO public.audit_events (actor_id, actor_role, action, entity_type, entity_id, before, after, metadata)
  VALUES (auth.uid(), public.get_my_role(), p_action, p_entity_type, p_entity_id, p_before, p_after, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb, jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.share_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS share_tokens_report_idx ON public.share_tokens(report_id);

-- -----------------------------------------------------------------
-- Projects: archive support (closes the seed-only gap alongside CRUD actions)
-- -----------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- =================================================================
-- Row level security
-- =================================================================
ALTER TABLE public.settlement_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebound_tests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebound_readings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soil_investigations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forensic_assessments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forensic_evidence       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_responses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_revisions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_limitations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_estimates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_tokens            ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (consistent with the existing tenant model).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'settlement_observations','rebound_tests','rebound_readings','soil_investigations',
    'forensic_assessments','forensic_evidence','checklist_templates','checklist_responses',
    'report_revisions','report_limitations','cost_estimates','recommendations'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL)',
      t || '_select_authenticated', t);
  END LOOP;
END $$;

-- Write: inspector, engineer and admin. Engineers approve, so they need full write.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'settlement_observations','rebound_tests','rebound_readings','soil_investigations',
    'forensic_assessments','forensic_evidence','checklist_responses',
    'report_revisions','report_limitations','cost_estimates','recommendations'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write_staff', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.get_my_role() IN (''inspector'',''engineer'',''admin'')) WITH CHECK (public.get_my_role() IN (''inspector'',''engineer'',''admin''))',
      t || '_write_staff', t);
  END LOOP;
END $$;

-- Templates are read-only to non-admins.
DROP POLICY IF EXISTS checklist_templates_admin_write ON public.checklist_templates;
CREATE POLICY checklist_templates_admin_write ON public.checklist_templates FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Audit events: admins read. Writes go only through log_audit_event (SECURITY DEFINER).
DROP POLICY IF EXISTS audit_events_admin_select ON public.audit_events;
CREATE POLICY audit_events_admin_select ON public.audit_events FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- Share tokens: engineers and admins manage. Public reads happen through a
-- server route using the service role, never through RLS.
DROP POLICY IF EXISTS share_tokens_staff_all ON public.share_tokens;
CREATE POLICY share_tokens_staff_all ON public.share_tokens FOR ALL TO authenticated
  USING (public.get_my_role() IN ('engineer','admin'))
  WITH CHECK (public.get_my_role() IN ('engineer','admin'));

COMMIT;

-- Verification:
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN (
--    'settlement_observations','rebound_tests','rebound_readings','soil_investigations',
--    'forensic_assessments','forensic_evidence','checklist_templates','checklist_responses',
--    'report_revisions','report_limitations','cost_estimates','recommendations',
--    'audit_events','share_tokens') ORDER BY 1;   -- expect 14
-- SELECT code, version, title FROM public.checklist_templates ORDER BY code;  -- expect 2
