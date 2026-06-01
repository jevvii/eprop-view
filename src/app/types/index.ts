export type Role = 'admin' | 'inspector' | 'viewer'

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
  inspection_date: string
  status: InspectionStatus
  risk_score: number
  risk_level: RiskLevel
  location: string
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
    type: 'Polygon' | 'MultiPolygon' | 'Point'
    coordinates: any
  }
  description: string
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
}
