export type Role = 'admin' | 'engineer' | 'inspector' | 'viewer'

export type StructuralElement =
  | 'beam'
  | 'column'
  | 'slab'
  | 'wall'
  | 'foundation'
  | 'facade'
  | 'roof'
  | 'general'
  | 'other'

export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'cancelled'
export type InspectionStatus = 'pending' | 'in_progress' | 'completed' | 'requires_followup'
export type ReportStatus = 'open' | 'in_review' | 'critical' | 'completed'
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical'
export type Severity = 'critical' | 'moderate' | 'low'
export type MaintenanceStatus = 'pending' | 'in_progress' | 'completed' | 'deferred'
export type ZoneType = 'fault_line' | 'liquefaction' | 'erosion' | 'flood' | 'general'
export type ZoneRiskLevel = 'zone_a' | 'zone_b' | 'zone_c'

export interface Profile {
  id: string
  role: Role
  full_name: string
  phone: string
  department: string
  created_at: string
  email?: string
  is_active: boolean
}

export interface Project {
  id: string
  name: string
  location: string
  description: string
  status: ProjectStatus
  latitude: number | null
  longitude: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  inspection_count?: number
  report_count?: number
}

export interface Inspection {
  id: string
  project_id: string
  lead_inspector_id: string | null
  lead_inspector_name?: string
  inspection_date: string
  status: InspectionStatus
  risk_score: number
  risk_level: RiskLevel
  location: string
  floor?: string
  structural_element?: StructuralElement | string
  building_id?: string | null
  floor_id?: string | null
  structural_element_id?: string | null
  building_name?: string
  floor_name?: string
  element_identifier?: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Report {
  id: string
  report_id: string
  title: string
  project_id: string
  inspection_id: string | null
  date: string
  location: string
  status: ReportStatus
  lead_inspector_id: string | null
  lead_inspector_name?: string
  project_name?: string
  risk_score: number
  key_findings: string
  created_by?: string | null
  created_by_name?: string
  reviewed_by?: string | null
  reviewed_by_name?: string
  reviewed_at?: string | null
  last_edited_by?: string | null
  last_edited_by_name?: string
  last_edited_at?: string | null
  created_at: string
  updated_at: string
}

export interface EnvironmentalRisk {
  id: string
  project_id: string
  fault_line_proximity: 'none' | 'low' | 'moderate' | 'high' | 'very_high'
  soil_liquefaction_risk: ZoneRiskLevel | 'none'
  erosion_potential: 'severe' | 'moderate' | 'low' | 'negligible'
  overall_risk_score: number
  additional_analysis: string
  assessed_date: string
  updated_at: string
}

export interface RiskHotspot {
  id: string
  project_id: string
  title: string
  severity: Severity
  description: string
  position_x: number
  position_y: number
  latitude: number | null
  longitude: number | null
  created_at: string
}

export interface MaintenancePriority {
  id: string
  project_id: string
  title: string
  location: string
  risk_score: number
  status: MaintenanceStatus
  assigned_to: string | null
  assigned_to_name?: string
  due_date: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface DamageTrend {
  id: string
  project_id: string
  date: string
  severity: Severity | 'high'
  value: number
  notes: string
}

export interface GeospatialZone {
  id: string
  project_id: string
  name: string
  zone_type: ZoneType
  risk_level: ZoneRiskLevel
  coordinates: number[][]
  geom?: {
    type: 'Polygon' | 'MultiPolygon' | 'Point' | 'LineString' | 'MultiLineString'
    coordinates: any
  }
  description: string
  source_file?: string | null
  source_format?: 'geojson' | 'shapefile' | 'kml' | 'manual' | null
  effective_date?: string | null
  expiry_date?: string | null
  is_active?: boolean
  created_at: string
}

export interface DashboardStats {
  active_projects: number
  critical_risk_reports: number
  reports_in_review: number
  completed_repairs: number
  total_open_reports: number
  total_completed_reports: number
}

export interface InspectionImage {
  id: string
  inspection_id: string
  storage_path: string
  caption: string
  uploader_id: string | null
  uploader_name?: string
  uploaded_at: string
  signed_url?: string | null
  comment_count?: number
}

export interface ImageComment {
  id: string
  image_id: string
  author_id: string
  author_name?: string
  author_role?: Role
  content: string
  is_read: boolean
  created_at: string
}

// AI Module types
export type DamageType = 'crack' | 'corrosion' | 'spalling' | 'deformation' | 'leakage' | 'none'
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'
export type AIModelTask = 'classification' | 'detection' | 'segmentation'
export type AIModelFormat = 'tfjs' | 'onnx' | 'mock'
export type AIJobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface AIModel {
  id: string
  name: string
  version: string
  task: AIModelTask
  format: AIModelFormat
  storage_path: string | null
  labels: string[]
  is_active: boolean
  architecture?: string
  input_width?: number
  input_height?: number
  confidence_threshold?: number
  iou_threshold?: number
  preprocessing?: Record<string, unknown>
  metadata?: Record<string, unknown>
  created_at: string
}

export interface AIDamageDetection {
  id: string
  image_id: string
  model_id: string | null
  damage_type: DamageType
  severity: SeverityLevel
  severity_score: number
  confidence: number
  bbox: BoundingBox | null
  mask_url: string | null
  verified_by: string | null
  verified_at: string | null
  notes: string
  created_at: string
}

export interface AIAnalysisJob {
  id: string
  image_id: string
  model_id: string | null
  status: AIJobStatus
  error_message: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

// AR Module types
export type ARSessionStatus = 'active' | 'paused' | 'completed'

export interface Vector3 {
  x: number
  y: number
  z: number
}

export interface Quaternion {
  x: number
  y: number
  z: number
  w: number
}

export interface ARPose {
  position: Vector3
  quaternion: Quaternion
}

export interface ARSession {
  id: string
  inspection_id: string
  started_by: string | null
  status: ARSessionStatus
  started_at: string
  ended_at: string | null
  device_info: Record<string, unknown>
}

export interface ARAnchor {
  id: string
  session_id: string
  inspection_id: string
  detection_id: string | null
  label: string
  damage_type: DamageType | null
  severity: SeverityLevel | null
  pose: ARPose
  world_position: Vector3 | null
  notes: string
  snapshot_path: string | null
  created_at: string
}

// Building Master Data types (Phase C)
export interface Building {
  id: string
  project_id: string
  name: string
  code: string | null
  description: string
  latitude: number | null
  longitude: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  project_name?: string
  floors_count?: number
}

export interface Floor {
  id: string
  building_id: string
  name: string
  level: number | null
  sort_order: number
  created_at: string
  building_name?: string
  elements_count?: number
}

export interface StructuralElementRecord {
  id: string
  floor_id: string
  element_type: StructuralElement
  identifier: string
  description: string
  created_at: string
  floor_name?: string
}

// Storage Management types (Phase E)
export type StorageClass = 'standard' | 'cold' | 'glacier' | 'archive'

export interface StorageAuditEntry {
  id: string
  bucket_id: string
  object_path: string
  size_bytes: number
  owner_id: string | null
  project_id: string | null
  inspection_id: string | null
  uploaded_at: string
  last_accessed_at: string
  storage_class: StorageClass
  created_at: string
  is_orphan?: boolean
}

export interface StorageSummary {
  totalBytes: number
  totalObjects: number
  bucketStats: {
    bucketId: string
    sizeBytes: number
    objectCount: number
  }[]
  classStats: Record<StorageClass, { sizeBytes: number; objectCount: number }>
  orphanedCount: number
}

