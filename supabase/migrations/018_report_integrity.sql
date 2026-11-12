-- Capstone audit remediation: database-enforced review, revisions and immutable sharing.
-- Additive schema, idempotent functions/policies. Requires migration 017.
BEGIN;

ALTER TABLE public.share_tokens ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS content_updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS findings_provenance text NOT NULL DEFAULT 'engineer';
DO $$ BEGIN
  ALTER TABLE public.reports ADD CONSTRAINT reports_findings_provenance_check CHECK (findings_provenance IN ('gemini','heuristic','engineer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.cost_estimates ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cost_estimates_report_idx ON public.cost_estimates(report_id);

CREATE OR REPLACE FUNCTION public.capstone_can_access_inspection(p_id uuid, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.get_my_role() IN ('engineer','admin') OR
    (public.get_my_role() = 'inspector' AND EXISTS (
      SELECT 1 FROM public.inspections i WHERE i.id=p_id AND i.lead_inspector_id=auth.uid()
        AND (NOT p_write OR i.status <> 'completed')
    ))
  );
$$;

CREATE OR REPLACE FUNCTION public.capstone_can_read_report_data(p_report_id uuid, p_inspection_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.get_my_role() IN ('engineer','admin') OR
    (public.get_my_role()='inspector' AND public.capstone_can_access_inspection(p_inspection_id)) OR
    (public.get_my_role()='viewer' AND EXISTS (
      SELECT 1 FROM public.reports r WHERE r.status='completed'
        AND (r.id=p_report_id OR (p_report_id IS NULL AND r.inspection_id=p_inspection_id))
    ))
  );
$$;

REVOKE ALL ON FUNCTION public.capstone_can_access_inspection(uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capstone_can_read_report_data(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capstone_can_access_inspection(uuid,boolean), public.capstone_can_read_report_data(uuid,uuid) TO authenticated;

-- Remove every old permissive policy on the affected tables; an extra permissive
-- policy would otherwise OR with the restrictive replacement and restore the bypass.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'settlement_observations','rebound_tests','rebound_readings','soil_investigations',
    'forensic_assessments','forensic_evidence','checklist_responses','report_revisions',
    'report_limitations','cost_estimates','recommendations','reports','share_tokens'
  ) LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;

CREATE POLICY reports_read ON public.reports FOR SELECT TO authenticated USING (
  public.get_my_role() IN ('engineer','admin') OR (public.get_my_role()='viewer' AND status='completed')
);
CREATE POLICY reports_create ON public.reports FOR INSERT TO authenticated WITH CHECK (
  public.get_my_role() IN ('engineer','admin') AND status <> 'completed' AND created_by=auth.uid() AND last_edited_by=auth.uid()
);
-- All edits, including the legacy action, go through save_report_revision.
REVOKE UPDATE,DELETE ON public.reports FROM authenticated,anon;
REVOKE INSERT,UPDATE,DELETE ON public.report_revisions FROM authenticated,anon;
CREATE POLICY report_revisions_read ON public.report_revisions FOR SELECT TO authenticated USING (
  public.get_my_role() IN ('engineer','admin')
);

CREATE POLICY settlement_read ON public.settlement_observations FOR SELECT TO authenticated USING (
  public.capstone_can_access_inspection(inspection_id) OR public.get_my_role() IN ('engineer','admin')
);
CREATE POLICY settlement_write ON public.settlement_observations FOR ALL TO authenticated USING (
  public.capstone_can_access_inspection(inspection_id,true)
) WITH CHECK (public.capstone_can_access_inspection(inspection_id,true) AND recorded_by=auth.uid());
CREATE POLICY rebound_read ON public.rebound_tests FOR SELECT TO authenticated USING (public.capstone_can_access_inspection(inspection_id));
CREATE POLICY rebound_write ON public.rebound_tests FOR ALL TO authenticated USING (public.capstone_can_access_inspection(inspection_id,true))
  WITH CHECK (public.capstone_can_access_inspection(inspection_id,true) AND performed_by=auth.uid());
CREATE POLICY rebound_readings_read ON public.rebound_readings FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rebound_tests t WHERE t.id=test_id AND public.capstone_can_access_inspection(t.inspection_id))
);
CREATE POLICY rebound_readings_write ON public.rebound_readings FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rebound_tests t WHERE t.id=test_id AND public.capstone_can_access_inspection(t.inspection_id,true))
) WITH CHECK (EXISTS (SELECT 1 FROM public.rebound_tests t WHERE t.id=test_id AND public.capstone_can_access_inspection(t.inspection_id,true)));
CREATE POLICY soil_read ON public.soil_investigations FOR SELECT TO authenticated USING (
  public.get_my_role() IN ('engineer','admin') OR (public.get_my_role()='inspector' AND recorded_by=auth.uid())
);
CREATE POLICY soil_write ON public.soil_investigations FOR ALL TO authenticated USING (
  public.get_my_role() IN ('engineer','admin') OR (public.get_my_role()='inspector' AND recorded_by=auth.uid())
) WITH CHECK (public.get_my_role() IN ('inspector','engineer','admin') AND recorded_by=auth.uid());
CREATE POLICY checklist_responses_read ON public.checklist_responses FOR SELECT TO authenticated USING (public.capstone_can_access_inspection(inspection_id));
CREATE POLICY checklist_responses_write ON public.checklist_responses FOR ALL TO authenticated USING (public.capstone_can_access_inspection(inspection_id,true))
  WITH CHECK (public.capstone_can_access_inspection(inspection_id,true) AND completed_by=auth.uid());
CREATE POLICY forensic_read ON public.forensic_assessments FOR SELECT TO authenticated USING (public.capstone_can_access_inspection(inspection_id));
CREATE POLICY forensic_write ON public.forensic_assessments FOR ALL TO authenticated USING (public.get_my_role() IN ('engineer','admin'))
  WITH CHECK (public.get_my_role() IN ('engineer','admin') AND author_id=auth.uid());
CREATE POLICY forensic_evidence_read ON public.forensic_evidence FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.forensic_assessments f WHERE f.id=assessment_id AND public.capstone_can_access_inspection(f.inspection_id))
);
CREATE POLICY forensic_evidence_write ON public.forensic_evidence FOR ALL TO authenticated USING (public.get_my_role() IN ('engineer','admin'))
  WITH CHECK (public.get_my_role() IN ('engineer','admin'));
CREATE POLICY limitations_read ON public.report_limitations FOR SELECT TO authenticated USING (public.capstone_can_read_report_data(report_id,NULL));
CREATE POLICY limitations_write ON public.report_limitations FOR ALL TO authenticated USING (
  public.get_my_role() IN ('engineer','admin') AND EXISTS (SELECT 1 FROM public.reports r WHERE r.id=report_limitations.report_id AND r.status<>'completed')
) WITH CHECK (
  public.get_my_role() IN ('engineer','admin') AND EXISTS (SELECT 1 FROM public.reports r WHERE r.id=report_limitations.report_id AND r.status<>'completed')
);
CREATE POLICY costs_read ON public.cost_estimates FOR SELECT TO authenticated USING (public.capstone_can_read_report_data(report_id,inspection_id));
CREATE POLICY costs_insert ON public.cost_estimates FOR INSERT TO authenticated WITH CHECK (
  public.get_my_role() IN ('engineer','admin') OR
  (public.get_my_role()='inspector' AND report_id IS NULL AND public.capstone_can_access_inspection(inspection_id,true)
    AND confirmed_by IS NULL AND confirmed_at IS NULL AND override_php IS NULL AND override_reason IS NULL)
);
CREATE POLICY costs_review ON public.cost_estimates FOR UPDATE TO authenticated USING (public.get_my_role() IN ('engineer','admin'))
  WITH CHECK (public.get_my_role() IN ('engineer','admin'));
CREATE POLICY costs_delete ON public.cost_estimates FOR DELETE TO authenticated USING (
  public.get_my_role()='admin' AND confirmed_at IS NULL
);
CREATE POLICY recommendations_read ON public.recommendations FOR SELECT TO authenticated USING (public.capstone_can_read_report_data(report_id,inspection_id));
CREATE POLICY recommendations_insert ON public.recommendations FOR INSERT TO authenticated WITH CHECK (
  status='draft' AND signed_by IS NULL AND signed_at IS NULL AND final_text IS NULL AND
  (public.get_my_role() IN ('engineer','admin') OR
    (public.get_my_role()='inspector' AND report_id IS NULL AND public.capstone_can_access_inspection(inspection_id,true)))
);
CREATE POLICY recommendations_draft_edit ON public.recommendations FOR UPDATE TO authenticated USING (
  status='draft' AND (public.get_my_role() IN ('engineer','admin') OR
    (public.get_my_role()='inspector' AND created_by=auth.uid() AND public.capstone_can_access_inspection(inspection_id,true)))
) WITH CHECK (status='draft' AND signed_by IS NULL AND signed_at IS NULL AND final_text IS NULL);
CREATE POLICY recommendations_draft_delete ON public.recommendations FOR DELETE TO authenticated USING (
  status='draft' AND (public.get_my_role() IN ('engineer','admin') OR
    (public.get_my_role()='inspector' AND created_by=auth.uid() AND public.capstone_can_access_inspection(inspection_id,true)))
);
CREATE POLICY share_read ON public.share_tokens FOR SELECT TO authenticated USING (public.get_my_role() IN ('engineer','admin'));
-- No direct insert/update: snapshot construction and revocation use dedicated RPCs.
REVOKE INSERT,UPDATE,DELETE ON public.share_tokens FROM authenticated,anon;

-- Trigger checks remain effective even for SECURITY DEFINER operations and
-- prevent changing a signed record, including through future write surfaces.
CREATE OR REPLACE FUNCTION public.guard_review_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE report_state text; report_content_at timestamptz; report_inspection uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('recommendations','cost_estimates') AND TG_OP='INSERT' THEN NEW.created_by=auth.uid(); END IF;
  IF TG_TABLE_NAME='cost_estimates' THEN
    NEW.divergence_flag=NEW.ai_likely_php IS NOT NULL AND (NEW.table_estimate_php IS NULL OR (NEW.table_estimate_php=0 AND NEW.ai_likely_php>0) OR (NEW.table_estimate_php>0 AND (NEW.ai_likely_php<NEW.table_estimate_php*0.5 OR NEW.ai_likely_php>NEW.table_estimate_php*2)));
    IF public.get_my_role() IN ('engineer','admin') AND NEW.confirmed_by IS NOT NULL THEN NEW.confirmed_by=auth.uid(); NEW.confirmed_at=now(); END IF;
  END IF;
  IF TG_TABLE_NAME='recommendations' THEN
    IF TG_OP='UPDATE' AND OLD.status IN ('signed','superseded') THEN
      RAISE EXCEPTION 'Signed recommendations are immutable. Create a new draft.' USING ERRCODE='42501';
    END IF;
    IF NEW.status='signed' AND public.get_my_role() NOT IN ('engineer','admin') THEN
      RAISE EXCEPTION 'Only engineers or admins may sign recommendations.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.report_id IS NOT NULL THEN
    SELECT r.status,r.content_updated_at,r.inspection_id INTO report_state,report_content_at,report_inspection FROM public.reports r WHERE r.id=NEW.report_id FOR UPDATE;
    IF TG_TABLE_NAME IN ('recommendations','cost_estimates') THEN
      IF NEW.inspection_id IS NOT NULL AND NEW.inspection_id IS DISTINCT FROM report_inspection THEN RAISE EXCEPTION 'Review record belongs to a different inspection.'; END IF;
    END IF;
    IF report_state='completed' THEN RAISE EXCEPTION 'Reopen the completed report before changing review data.' USING ERRCODE='42501'; END IF;
    IF TG_TABLE_NAME='cost_estimates' AND EXISTS (SELECT 1 FROM public.recommendations r WHERE r.report_id=NEW.report_id AND r.status='signed' AND r.signed_at>=report_content_at) THEN
      RAISE EXCEPTION 'Save a report revision before changing costs after sign-off.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS recommendations_guard ON public.recommendations;
CREATE TRIGGER recommendations_guard BEFORE INSERT OR UPDATE ON public.recommendations FOR EACH ROW EXECUTE FUNCTION public.guard_review_record();
DROP TRIGGER IF EXISTS costs_guard ON public.cost_estimates;
CREATE TRIGGER costs_guard BEFORE INSERT OR UPDATE ON public.cost_estimates FOR EACH ROW EXECUTE FUNCTION public.guard_review_record();
DROP TRIGGER IF EXISTS limitations_guard ON public.report_limitations;
CREATE TRIGGER limitations_guard BEFORE INSERT OR UPDATE ON public.report_limitations FOR EACH ROW EXECUTE FUNCTION public.guard_review_record();

CREATE OR REPLACE FUNCTION public.assert_report_costs_confirmed(p_report_id uuid,p_inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cost_estimates c WHERE
    (c.report_id=p_report_id OR (c.report_id IS NULL AND c.inspection_id=p_inspection_id))
    AND c.divergence_flag AND (c.confirmed_by IS NULL OR c.confirmed_at IS NULL OR length(trim(coalesce(c.override_reason,'')))<10)
  ) THEN RAISE EXCEPTION 'Confirm divergent cost estimates before signing.' USING ERRCODE='23514'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_report_costs_confirmed(uuid,uuid) FROM PUBLIC,authenticated,anon;

CREATE OR REPLACE FUNCTION public.save_report_revision(
  p_report_id uuid,p_changes jsonb,p_reopen boolean DEFAULT false,p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_row public.reports; new_row public.reports; next_revision integer; new_status text; content_changed boolean;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('engineer','admin') THEN RAISE EXCEPTION 'Engineering role required.' USING ERRCODE='42501'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE k NOT IN ('title','date','location','status','risk_score','key_findings','findings_provenance')
  ) THEN RAISE EXCEPTION 'Unsupported report changes.' USING ERRCODE='22023'; END IF;
  SELECT * INTO old_row FROM public.reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NOT NULL AND old_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Report changed since it was opened. Reload before saving.' USING ERRCODE='40001';
  END IF;
  IF old_row.status='completed' AND NOT p_reopen THEN RAISE EXCEPTION 'Completed reports are locked. Explicitly reopen to edit.' USING ERRCODE='42501'; END IF;
  content_changed=EXISTS (SELECT 1 FROM jsonb_each(p_changes-'status') c WHERE to_jsonb(old_row)->c.key IS DISTINCT FROM c.value);
  new_status=coalesce(p_changes->>'status',old_row.status);
  IF old_row.status='completed' AND p_reopen AND new_status='completed' THEN new_status='open'; END IF;
  IF new_status NOT IN ('open','in_review','critical','completed') THEN RAISE EXCEPTION 'Invalid report status.' USING ERRCODE='22023'; END IF;
  IF p_changes ? 'risk_score' AND ((p_changes->>'risk_score')::numeric NOT BETWEEN 0 AND 10 OR p_changes->>'risk_score' IS NULL) THEN RAISE EXCEPTION 'Risk score must be 0–10.'; END IF;
  IF p_changes ? 'title' AND (length(trim(p_changes->>'title')) NOT BETWEEN 1 AND 300 OR p_changes->>'title' IS NULL) THEN RAISE EXCEPTION 'Title is required (maximum 300 characters).'; END IF;
  IF new_status='completed' THEN
    IF content_changed THEN RAISE EXCEPTION 'Save content changes before signing and completing the report.'; END IF;
    PERFORM public.assert_report_costs_confirmed(p_report_id,old_row.inspection_id);
    IF NOT EXISTS (SELECT 1 FROM public.recommendations r WHERE r.report_id=p_report_id AND r.status='signed'
      AND r.signed_at>=old_row.content_updated_at) THEN
      RAISE EXCEPTION 'Sign a current recommendation before completing the report.' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.report_limitations l WHERE l.report_id=p_report_id) THEN
      RAISE EXCEPTION 'Save assessment limitations before completing the report.' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT coalesce(max(revision_number),0)+1 INTO next_revision FROM public.report_revisions WHERE report_id=p_report_id;
  INSERT INTO public.report_revisions(report_id,revision_number,snapshot,changed_by) VALUES (
    p_report_id,next_revision,to_jsonb(old_row) || jsonb_build_object(
      'limitations',(SELECT to_jsonb(l) FROM public.report_limitations l WHERE l.report_id=p_report_id),
      'recommendations',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.recommendations r WHERE r.report_id=p_report_id),
      'cost_estimates',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM public.cost_estimates c WHERE c.report_id=p_report_id)
    ),auth.uid()
  );
  UPDATE public.reports SET
    title=CASE WHEN p_changes ? 'title' THEN trim(p_changes->>'title') ELSE title END,
    date=CASE WHEN p_changes ? 'date' THEN (p_changes->>'date')::date ELSE date END,
    location=CASE WHEN p_changes ? 'location' THEN p_changes->>'location' ELSE location END,
    risk_score=CASE WHEN p_changes ? 'risk_score' THEN (p_changes->>'risk_score')::numeric ELSE risk_score END,
    key_findings=CASE WHEN p_changes ? 'key_findings' THEN p_changes->>'key_findings' ELSE key_findings END,
    findings_provenance=CASE WHEN p_changes ? 'findings_provenance' THEN p_changes->>'findings_provenance' ELSE findings_provenance END,
    status=new_status,content_updated_at=CASE WHEN content_changed OR (old_row.status='completed' AND p_reopen) THEN now() ELSE content_updated_at END,last_edited_by=auth.uid(),last_edited_at=now(),updated_at=now(),
    reviewed_by=CASE WHEN new_status='completed' THEN auth.uid() ELSE NULL END,
    reviewed_at=CASE WHEN new_status='completed' THEN now() ELSE NULL END
  WHERE id=p_report_id RETURNING * INTO new_row;
  PERFORM public.log_audit_event(CASE WHEN old_row.status='completed' THEN 'report.reopen' ELSE 'report.update' END,'report',p_report_id,to_jsonb(old_row),to_jsonb(new_row),jsonb_build_object('revisionNumber',next_revision));
  RETURN jsonb_build_object('report',to_jsonb(new_row),'revisionNumber',next_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_report_recommendation(p_recommendation_id uuid,p_final_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recommendation public.recommendations; target_report public.reports;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('engineer','admin') THEN RAISE EXCEPTION 'Engineering role required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO recommendation FROM public.recommendations WHERE id=p_recommendation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recommendation not found.'; END IF;
  IF recommendation.status<>'draft' THEN RAISE EXCEPTION 'Only a draft recommendation can be signed.'; END IF;
  IF length(trim(p_final_text)) NOT BETWEEN 1 AND 10000 OR p_final_text IS NULL THEN RAISE EXCEPTION 'Recommendation text is required.'; END IF;
  IF recommendation.report_id IS NOT NULL THEN
    SELECT * INTO target_report FROM public.reports WHERE id=recommendation.report_id FOR UPDATE;
    IF target_report.status='completed' THEN RAISE EXCEPTION 'Reopen the completed report before signing.'; END IF;
  END IF;
  PERFORM public.assert_report_costs_confirmed(recommendation.report_id,coalesce(recommendation.inspection_id,target_report.inspection_id));
  UPDATE public.recommendations SET final_text=trim(p_final_text),status='signed',signed_by=auth.uid(),signed_at=now(),updated_at=now()
    WHERE id=p_recommendation_id RETURNING * INTO recommendation;
  PERFORM public.log_audit_event('recommendation.sign','recommendation',p_recommendation_id,NULL,jsonb_build_object('signed_by',auth.uid()),'{}');
  RETURN to_jsonb(recommendation);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_report_share(p_report_id uuid,p_token text,p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE report_row public.reports; shared public.share_tokens; content jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('engineer','admin') THEN RAISE EXCEPTION 'Engineering role required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO report_row FROM public.reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND OR report_row.status<>'completed' THEN RAISE EXCEPTION 'Only completed reports can be shared.'; END IF;
  IF p_token !~ '^[A-Za-z0-9_-]{32}$' OR p_expires_at<=now() OR p_expires_at>now()+interval '90 days' THEN RAISE EXCEPTION 'Invalid share token or expiry.'; END IF;
  content=jsonb_build_object(
    'report',jsonb_build_object('report_id',report_row.report_id,'title',report_row.title,'date',report_row.date,'location',report_row.location,'status',report_row.status,'risk_score',report_row.risk_score,'key_findings',report_row.key_findings,'findings_provenance',report_row.findings_provenance,'reviewed_at',report_row.reviewed_at),
    'limitation',(SELECT jsonb_build_object('standard_exclusions',l.standard_exclusions,'free_text',l.free_text,'element_notes',l.element_notes) FROM public.report_limitations l WHERE l.report_id=p_report_id),
    'recommendations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'final_text',r.final_text,'signed_at',r.signed_at,'provenance',r.provenance)),'[]') FROM public.recommendations r WHERE r.report_id=p_report_id AND r.status='signed' AND r.signed_at>=report_row.content_updated_at),
    'cost_estimates',(SELECT coalesce(jsonb_agg(jsonb_build_object('table_estimate_php',c.table_estimate_php,'ai_low_php',c.ai_low_php,'ai_high_php',c.ai_high_php,'ai_likely_php',c.ai_likely_php,'provenance',c.provenance,'divergence_flag',c.divergence_flag,'confirmed_at',c.confirmed_at)),'[]') FROM public.cost_estimates c WHERE c.report_id=p_report_id)
  );
  INSERT INTO public.share_tokens(report_id,token,created_by,expires_at,snapshot) VALUES (p_report_id,p_token,auth.uid(),p_expires_at,content) RETURNING * INTO shared;
  PERFORM public.log_audit_event('report.share_token.create','share_token',shared.id,NULL,jsonb_build_object('reportId',p_report_id,'expiresAt',p_expires_at),'{}');
  RETURN to_jsonb(shared)-'snapshot';
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_report_share(p_share_token_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('engineer','admin') THEN RAISE EXCEPTION 'Engineering role required.' USING ERRCODE='42501'; END IF;
  UPDATE public.share_tokens SET revoked_at=now() WHERE id=p_share_token_id;
  PERFORM public.log_audit_event('report.share_token.revoke','share_token',p_share_token_id,NULL,NULL,'{}');
END;
$$;

REVOKE ALL ON FUNCTION public.save_report_revision(uuid,jsonb,boolean,timestamptz), public.sign_report_recommendation(uuid,text), public.create_report_share(uuid,text,timestamptz), public.revoke_report_share(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_report_revision(uuid,jsonb,boolean,timestamptz), public.sign_report_recommendation(uuid,text), public.create_report_share(uuid,text,timestamptz), public.revoke_report_share(uuid) TO authenticated;
COMMIT;
