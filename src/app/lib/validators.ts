import { z } from 'zod'

export const inspectionFormSchema = z.object({
  project_id: z.string().uuid('Select a valid project'),
  inspection_date: z.string().min(1, 'Date is required'),
  location: z.string().min(1, 'Location is required'),
  risk_score: z.coerce.number().min(0).max(10, 'Risk score must be between 0 and 10'),
  status: z.enum(['pending', 'in_progress', 'completed', 'requires_followup']),
  notes: z.string().default(''),
})

export const reportFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  project_id: z.string().uuid(),
  inspection_id: z.string().uuid().optional(),
  date: z.string().min(1, 'Date is required'),
  location: z.string().min(1, 'Location is required'),
  status: z.enum(['open', 'in_review', 'critical', 'completed']),
  risk_score: z.coerce.number().min(0).max(10),
  key_findings: z.string().default(''),
})

export const environmentalRiskSchema = z.object({
  fault_line_proximity: z.enum(['none', 'low', 'moderate', 'high', 'very_high']),
  soil_liquefaction_risk: z.enum(['zone_a', 'zone_b', 'zone_c', 'none']),
  erosion_potential: z.enum(['severe', 'moderate', 'low', 'negligible']),
  overall_risk_score: z.coerce.number().min(0).max(10),
  additional_analysis: z.string().default(''),
})
