-- =================================================================
-- Migration 010: AI Model Registry V2
-- Enhances ai_models table with architecture, tensor dimensions,
-- confidence and IoU thresholds, and preprocessing configuration
-- =================================================================

ALTER TABLE public.ai_models
ADD COLUMN IF NOT EXISTS architecture text DEFAULT 'yolov8',
ADD COLUMN IF NOT EXISTS input_width int DEFAULT 640,
ADD COLUMN IF NOT EXISTS input_height int DEFAULT 640,
ADD COLUMN IF NOT EXISTS confidence_threshold float DEFAULT 0.25,
ADD COLUMN IF NOT EXISTS iou_threshold float DEFAULT 0.45,
ADD COLUMN IF NOT EXISTS preprocessing jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

COMMENT ON COLUMN public.ai_models.architecture IS 'Neural network architecture (e.g. yolov8, efficientdet, rtdetr, custom)';
COMMENT ON COLUMN public.ai_models.confidence_threshold IS 'Minimum detection probability threshold (0.0 to 1.0)';
COMMENT ON COLUMN public.ai_models.iou_threshold IS 'Intersection over Union threshold for Non-Maximum Suppression';
