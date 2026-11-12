BEGIN;
-- Invoker rights preserve the existing row policies even for direct API calls.
CREATE OR REPLACE FUNCTION public.filter_workspace_records(p_scope text,p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(id uuid) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public
AS $$
BEGIN
 IF public.get_my_role() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_scope NOT IN ('inspections','reports','maintenance','hotspots') THEN RAISE EXCEPTION 'Invalid filter scope'; END IF;
 RETURN QUERY
 WITH base AS (
   SELECT i.id,i.project_id,i.id AS inspection_id,i.status,i.risk_score,i.inspection_date AS day,i.location||' '||coalesce(i.notes,'') AS search
     FROM inspections i WHERE p_scope='inspections'
   UNION ALL SELECT r.id,r.project_id,r.inspection_id,r.status,r.risk_score,r.date,r.title||' '||r.location||' '||coalesce(r.key_findings,'') FROM reports r WHERE p_scope='reports'
   UNION ALL SELECT m.id,m.project_id,NULL::uuid,m.status,m.risk_score,m.created_at::date,m.title||' '||m.location||' '||coalesce(m.notes,'') FROM maintenance_priorities m WHERE p_scope='maintenance'
   UNION ALL SELECT h.id,h.project_id,NULL::uuid,'all',CASE h.severity WHEN 'critical' THEN 9 WHEN 'high' THEN 7 WHEN 'moderate' THEN 5 ELSE 2 END,h.created_at::date,h.title||' '||coalesce(h.description,'') FROM risk_hotspots h WHERE p_scope='hotspots'
 )
 SELECT b.id FROM base b WHERE
  (coalesce(p_filters->>'q','')='' OR b.search ILIKE '%'||(p_filters->>'q')||'%')
  AND (coalesce(p_filters->>'status','all')='all' OR b.status=p_filters->>'status')
  AND (coalesce(p_filters->>'risk','all')='all' OR (CASE WHEN b.risk_score>=8 THEN 'critical' WHEN b.risk_score>=6 THEN 'high' WHEN b.risk_score>=4 THEN 'moderate' ELSE 'low' END)=p_filters->>'risk')
  AND (coalesce(p_filters->>'from','')='' OR b.day >= (p_filters->>'from')::date)
  AND (coalesce(p_filters->>'to','')='' OR b.day <= (p_filters->>'to')::date)
  AND (NOT EXISTS(SELECT FROM jsonb_each_text(p_filters) f WHERE f.key IN ('building','floor','element','severity','damage','crack','verification') AND f.value NOT IN ('','all'))
    OR EXISTS (
      SELECT FROM inspections i WHERE i.project_id=b.project_id AND (b.inspection_id IS NULL OR i.id=b.inspection_id)
      AND (coalesce(p_filters->>'building','')='' OR i.building_id=(p_filters->>'building')::uuid)
      AND (coalesce(p_filters->>'floor','')='' OR i.floor_id=(p_filters->>'floor')::uuid)
      AND (coalesce(p_filters->>'element','')='' OR i.structural_element_id=(p_filters->>'element')::uuid)
      AND (NOT EXISTS(SELECT FROM jsonb_each_text(p_filters) f WHERE f.key IN ('severity','damage','crack','verification') AND f.value NOT IN ('','all'))
        OR EXISTS(SELECT FROM inspection_images im JOIN ai_damage_detections d ON d.image_id=im.id WHERE im.inspection_id=i.id
          AND d.provenance NOT IN ('synthetic','legacy_synthetic')
          AND (coalesce(p_filters->>'severity','all')='all' OR d.severity=p_filters->>'severity')
          AND (coalesce(p_filters->>'damage','all')='all' OR d.damage_type=p_filters->>'damage')
          AND (coalesce(p_filters->>'crack','all')='all' OR d.crack_width_band=p_filters->>'crack')
          AND (coalesce(p_filters->>'verification','all')='all' OR (p_filters->>'verification'='verified' AND d.verified_by IS NOT NULL) OR (p_filters->>'verification'='unverified' AND d.verified_by IS NULL))
        ))
    )) ORDER BY b.id;
END $$;
REVOKE ALL ON FUNCTION public.filter_workspace_records(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.filter_workspace_records(text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.filtered_dashboard_stats(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH selected_reports AS MATERIALIZED (SELECT r.* FROM reports r JOIN filter_workspace_records('reports',p_filters) f ON f.id=r.id),
 selected_tasks AS MATERIALIZED (SELECT m.* FROM maintenance_priorities m JOIN filter_workspace_records('maintenance',p_filters) f ON f.id=m.id),
 selected_inspections AS MATERIALIZED (SELECT i.* FROM inspections i JOIN filter_workspace_records('inspections',p_filters) f ON f.id=i.id)
 SELECT jsonb_build_object(
 'active_projects',(SELECT count(*) FROM projects p WHERE p.status='active' AND
   (NOT EXISTS(SELECT FROM jsonb_each_text(p_filters) f WHERE f.value NOT IN ('','all')) OR p.id IN
    (SELECT project_id FROM selected_inspections UNION SELECT project_id FROM selected_reports UNION SELECT project_id FROM selected_tasks))),
 'critical_risk_reports',(SELECT count(*) FROM selected_reports WHERE risk_score>=8),
 'reports_in_review',(SELECT count(*) FROM selected_reports WHERE status='in_review'),
 'completed_repairs',(SELECT count(*) FROM selected_tasks WHERE status='completed'),
 'total_open_reports',(SELECT count(*) FROM selected_reports WHERE status='open'),
 'total_completed_reports',(SELECT count(*) FROM selected_reports WHERE status='completed'))
$$;
REVOKE ALL ON FUNCTION public.filtered_dashboard_stats(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.filtered_dashboard_stats(jsonb) TO authenticated;
-- Compute chart points from the same selected inspections, so structural,
-- damage and verification filters cannot leave an unrelated historical chart.
CREATE OR REPLACE FUNCTION public.filtered_damage_trends(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(id uuid,project_id uuid,date date,severity text,value double precision,notes text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH selected AS (
   SELECT i.project_id,date_trunc('month',i.inspection_date)::date AS month,
     CASE WHEN i.risk_score>=8 THEN 'critical' WHEN i.risk_score>=6 THEN 'high' WHEN i.risk_score>=4 THEN 'moderate' ELSE 'low' END AS band,
     i.risk_score
   FROM inspections i JOIN filter_workspace_records('inspections',p_filters) f ON f.id=i.id
 )
 SELECT md5(s.project_id::text||s.month::text||s.band)::uuid,s.project_id,s.month,s.band,avg(s.risk_score)::double precision,
   'Average recorded inspection risk; screening score, not structural capacity.'::text
 FROM selected s GROUP BY s.project_id,s.month,s.band ORDER BY s.month,s.project_id,s.band
$$;
REVOKE ALL ON FUNCTION public.filtered_damage_trends(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.filtered_damage_trends(jsonb) TO authenticated;
COMMIT;
