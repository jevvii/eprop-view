ALTER TABLE reports
  ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN last_edited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN last_edited_at timestamptz;

CREATE INDEX IF NOT EXISTS reports_created_by_idx ON reports(created_by);
CREATE INDEX IF NOT EXISTS reports_reviewed_by_idx ON reports(reviewed_by);
CREATE INDEX IF NOT EXISTS reports_last_edited_by_idx ON reports(last_edited_by);

CREATE OR REPLACE FUNCTION create_report_with_id(report_data jsonb)
RETURNS SETOF reports AS $$
DECLARE
  reviewer_id uuid := NULL;
  reviewer_at timestamptz := NULL;
BEGIN
  IF report_data->>'status' = 'completed' THEN
    reviewer_id := auth.uid();
    reviewer_at := now();
  END IF;

  RETURN QUERY
  INSERT INTO reports (
    title,
    project_id,
    inspection_id,
    date,
    location,
    status,
    risk_score,
    key_findings,
    created_by,
    last_edited_by,
    last_edited_at,
    reviewed_by,
    reviewed_at
  )
  VALUES (
    report_data->>'title',
    (report_data->>'project_id')::uuid,
    NULLIF(report_data->>'inspection_id', '')::uuid,
    (report_data->>'date')::date,
    report_data->>'location',
    report_data->>'status',
    (report_data->>'risk_score')::float,
    report_data->>'key_findings',
    auth.uid(),
    auth.uid(),
    now(),
    reviewer_id,
    reviewer_at
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;
