-- =================================================================
-- AI MODULE (Core Feature)
-- Tables, indexes, and RLS for automated damage detection,
-- severity classification, and AI model registry.
-- =================================================================

-- Registered AI models / checkpoints
CREATE TABLE ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  task text NOT NULL CHECK (task IN ('classification', 'detection', 'segmentation')),
  format text NOT NULL CHECK (format IN ('tfjs', 'onnx', 'mock')),
  storage_path text,                -- optional path in Supabase storage to model artifact
  labels text[] NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- AI damage detection results attached to inspection images
CREATE TABLE ai_damage_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES inspection_images(id) ON DELETE CASCADE,
  model_id uuid REFERENCES ai_models(id) ON DELETE SET NULL,
  damage_type text NOT NULL CHECK (damage_type IN ('crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  severity_score float NOT NULL CHECK (severity_score >= 0 AND severity_score <= 100),
  confidence float NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  bbox jsonb,                       -- { x, y, width, height } normalized 0-1
  mask_url text,                    -- optional segmentation mask signed URL
  verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Per-image AI analysis job queue / status
CREATE TABLE ai_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES inspection_images(id) ON DELETE CASCADE,
  model_id uuid REFERENCES ai_models(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  error_message text DEFAULT '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- =================================================================
-- INDEXES
-- =================================================================
CREATE INDEX ai_detections_image_id_idx ON ai_damage_detections(image_id);
CREATE INDEX ai_detections_damage_type_idx ON ai_damage_detections(damage_type);
CREATE INDEX ai_detections_severity_idx ON ai_damage_detections(severity);
CREATE INDEX ai_models_active_idx ON ai_models(is_active);
CREATE INDEX ai_jobs_image_id_idx ON ai_analysis_jobs(image_id);
CREATE INDEX ai_jobs_status_idx ON ai_analysis_jobs(status);

-- =================================================================
-- ROW LEVEL SECURITY
-- =================================================================
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_damage_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_jobs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read AI results; only admins can manage models
CREATE POLICY "ai_models_select_all" ON ai_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_models_admin_all" ON ai_models FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "ai_detections_select_all" ON ai_damage_detections FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_detections_admin_all" ON ai_damage_detections FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "ai_jobs_select_all" ON ai_analysis_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_jobs_admin_all" ON ai_analysis_jobs FOR ALL TO authenticated USING (get_my_role() = 'admin');

-- Seed a mock/demo model so the UI and data flow can be demonstrated
-- without a trained checkpoint.
INSERT INTO ai_models (name, version, task, format, labels)
VALUES (
  'EPROPVIEW Mock Damage Classifier',
  '0.1.0-prototype',
  'classification',
  'mock',
  ARRAY['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']
)
ON CONFLICT DO NOTHING;
