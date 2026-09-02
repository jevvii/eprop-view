-- =================================================================
-- AR MODULE (Core Feature)
-- Tables, indexes, and RLS for AR inspection sessions and
-- persistent spatial anchors attached to physical structures.
-- =================================================================

-- AR sessions created during an inspection
CREATE TABLE IF NOT EXISTS ar_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  started_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'completed')) DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  device_info jsonb DEFAULT '{}'
);

-- Persistent AR anchors attached to physical structures
CREATE TABLE IF NOT EXISTS ar_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ar_sessions(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  detection_id uuid REFERENCES ai_damage_detections(id) ON DELETE SET NULL,
  label text NOT NULL,
  damage_type text CHECK (damage_type IN ('crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none')),
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  pose jsonb NOT NULL,              -- { position: {x,y,z}, quaternion: {x,y,z,w} }
  world_position jsonb,             -- optional GPS/UTM position
  notes text DEFAULT '',
  snapshot_path text,               -- optional camera snapshot in storage
  created_at timestamptz DEFAULT now()
);

-- =================================================================
-- INDEXES
-- =================================================================
CREATE INDEX IF NOT EXISTS ar_sessions_inspection_id_idx ON ar_sessions(inspection_id);
CREATE INDEX IF NOT EXISTS ar_sessions_status_idx ON ar_sessions(status);
CREATE INDEX IF NOT EXISTS ar_anchors_session_id_idx ON ar_anchors(session_id);
CREATE INDEX IF NOT EXISTS ar_anchors_inspection_id_idx ON ar_anchors(inspection_id);

-- =================================================================
-- ROW LEVEL SECURITY
-- =================================================================
ALTER TABLE ar_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_anchors ENABLE ROW LEVEL SECURITY;

-- Inspectors and admins can manage AR sessions; everyone authenticated can read
DROP POLICY IF EXISTS "ar_sessions_select_all" ON ar_sessions;
CREATE POLICY "ar_sessions_select_all" ON ar_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ar_sessions_inspector_all" ON ar_sessions;
CREATE POLICY "ar_sessions_inspector_all" ON ar_sessions FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

DROP POLICY IF EXISTS "ar_sessions_admin_all" ON ar_sessions;
CREATE POLICY "ar_sessions_admin_all" ON ar_sessions FOR ALL TO authenticated USING (get_my_role() = 'admin');

-- Inspectors and admins can manage AR anchors; everyone authenticated can read
DROP POLICY IF EXISTS "ar_anchors_select_all" ON ar_anchors;
CREATE POLICY "ar_anchors_select_all" ON ar_anchors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ar_anchors_inspector_all" ON ar_anchors;
CREATE POLICY "ar_anchors_inspector_all" ON ar_anchors FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'inspector'))
  WITH CHECK (get_my_role() IN ('admin', 'inspector'));

DROP POLICY IF EXISTS "ar_anchors_admin_all" ON ar_anchors;
CREATE POLICY "ar_anchors_admin_all" ON ar_anchors FOR ALL TO authenticated USING (get_my_role() = 'admin');
