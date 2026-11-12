'use server'

import { randomBytes } from 'node:crypto'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { recordAuditEvent } from '@/app/lib/audit'
import { checkDivergence, formatPhp, tableEstimate } from '@/app/lib/structural/cost-table'
import { z } from 'zod'
import type {
  AIDamageDetection,
  ARAnchor,
  AuditEvent,
  CostEstimate,
  Recommendation,
  ReportLimitation,
  ReportRevision,
  ShareToken,
} from '@/app/types'

/**
 * Report lifecycle actions introduced by the capstone v2 scope.
 *
 * Reports already had a partial update path; this file adds full editing with
 * revision snapshots, the assessment-limitation statement, AI/table cost
 * estimates, recommendation sign-off, sharing, and the admin audit reader.
 */

const uuid = z.string().uuid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)')

// -----------------------------------------------------------------
// A4. Full report editing with revision history
// -----------------------------------------------------------------

const reportUpdateSchema = z
  .object({
    reportId: uuid,
    title: z.string().min(1).max(300).optional(),
    date: isoDate.optional(),
    location: z.string().max(500).optional(),
    status: z.enum(['open', 'in_review', 'critical', 'completed']).optional(),
    riskScore: z.number().min(0).max(10).optional(),
    keyFindings: z.string().max(20_000).optional(),
    findingsProvenance: z.enum(['gemini','heuristic','engineer']).optional(),
    reopen: z.boolean().default(false),
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullish(),
  })
  .strict()

export async function updateReportWithRevision(
  input: z.input<typeof reportUpdateSchema>
): Promise<{ report: Record<string, unknown>; revisionNumber: number }> {
  await requireRole(['engineer', 'admin'])
  const parsed = reportUpdateSchema.parse(input)
  const changes: Record<string, unknown> = {}
  if (parsed.title !== undefined) changes.title = parsed.title
  if (parsed.date !== undefined) changes.date = parsed.date
  if (parsed.location !== undefined) changes.location = parsed.location
  if (parsed.status !== undefined) changes.status = parsed.status
  if (parsed.riskScore !== undefined) changes.risk_score = parsed.riskScore
  if (parsed.keyFindings !== undefined) {
    changes.key_findings = parsed.keyFindings
    changes.findings_provenance = parsed.findingsProvenance ?? 'engineer'
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_report_revision', {
    p_report_id: parsed.reportId,
    p_changes: changes,
    p_reopen: parsed.reopen,
    p_expected_updated_at: parsed.expectedUpdatedAt ?? null,
  })
  if (error || !data) throw error ?? new Error('Failed to save report revision')
  return data as { report: Record<string, unknown>; revisionNumber: number }
}

export async function getReportRevisions(reportId: string): Promise<ReportRevision[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('report_revisions')
    .select('*')
    .eq('report_id', uuid.parse(reportId))
    .order('revision_number', { ascending: false })

  if (error) throw error
  return (data || []) as ReportRevision[]
}

// -----------------------------------------------------------------
// A7. Assessment limitation statement
// -----------------------------------------------------------------

const limitationSchema = z
  .object({
    reportId: uuid,
    standardExclusions: z.array(z.string().max(500)).max(30),
    freeText: z.string().max(5000).nullable().optional(),
    elementNotes: z.record(z.string().max(80), z.string().max(2000)).optional(),
  })
  .strict()

export async function upsertReportLimitation(
  input: z.input<typeof limitationSchema>
): Promise<ReportLimitation> {
  const { userId } = await requireRole(['engineer', 'admin'])
  const parsed = limitationSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('report_limitations')
    .upsert(
      {
        report_id: parsed.reportId,
        standard_exclusions: parsed.standardExclusions,
        free_text: parsed.freeText ?? null,
        element_notes: parsed.elementNotes ?? {},
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'report_id' }
    )
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to save report limitation')

  await recordAuditEvent({
    action: 'report.limitation.update',
    entityType: 'report_limitation',
    entityId: data.id,
    after: { exclusions: parsed.standardExclusions.length },
  })

  return data as ReportLimitation
}

export async function getReportLimitation(reportId: string): Promise<ReportLimitation | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('report_limitations')
    .select('*')
    .eq('report_id', uuid.parse(reportId))
    .maybeSingle()

  if (error) throw error
  return (data as ReportLimitation) ?? null
}

// -----------------------------------------------------------------
// A6. Cost estimates — AI range cross-checked against the table
// -----------------------------------------------------------------

const costSchema = z
  .object({
    inspectionId: uuid.nullish(),
    detectionId: uuid.nullish(),
    reportId: uuid.nullish(),
    damageType: z.enum(['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    elementType: z
      .enum(['beam', 'column', 'slab', 'wall', 'foundation', 'facade', 'roof', 'general', 'other'])
      .default('general'),
    aiLowPhp: z.number().min(0).max(100_000_000).nullish(),
    aiLikelyPhp: z.number().min(0).max(100_000_000).nullish(),
    aiHighPhp: z.number().min(0).max(100_000_000).nullish(),
    aiBasis: z.string().max(2000).nullish(),
    aiConfidence: z.number().min(0).max(1).nullish(),
  })
  .strict()
  .refine((value) => Boolean(value.inspectionId || value.detectionId || value.reportId), {
    message: 'A cost estimate must be attached to an inspection, detection or report.',
  })
  .refine(
    (value) =>
      value.aiLowPhp == null || value.aiHighPhp == null || value.aiLowPhp <= value.aiHighPhp,
    { message: 'The AI low estimate cannot exceed the high estimate.' }
  )

export async function saveCostEstimate(
  input: z.input<typeof costSchema>
): Promise<CostEstimate> {
  const { userId, role } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = costSchema.parse(input)
  const supabase = await createClient()

  const tableValue = tableEstimate(parsed.damageType, parsed.severity, parsed.elementType)
  const divergence = checkDivergence(parsed.aiLikelyPhp, tableValue)

  const provenance = parsed.aiLikelyPhp != null ? 'gemini' : 'table'

  const { data, error } = await supabase
    .from('cost_estimates')
    .insert({
      inspection_id: parsed.inspectionId ?? null,
      detection_id: parsed.detectionId ?? null,
      report_id: parsed.reportId ?? null,
      ai_low_php: parsed.aiLowPhp ?? null,
      ai_likely_php: parsed.aiLikelyPhp ?? null,
      ai_high_php: parsed.aiHighPhp ?? null,
      ai_basis: parsed.aiBasis ?? null,
      ai_confidence: parsed.aiConfidence ?? null,
      table_estimate_php: tableValue,
      divergence_flag: divergence.divergent,
      provenance,
      // A divergence must be confirmed by an engineer before the figure can be
      // treated as agreed; the UI enforces this, and the audit trail records it.
      confirmed_by: divergence.divergent || role === 'inspector' ? null : userId,
      confirmed_at: divergence.divergent || role === 'inspector' ? null : new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to save cost estimate')

  await recordAuditEvent({
    action: 'cost_estimate.create',
    entityType: 'cost_estimate',
    entityId: data.id,
    after: {
      table: tableValue,
      aiLikely: parsed.aiLikelyPhp ?? null,
      divergent: divergence.divergent,
      reason: divergence.reason,
    },
  })

  return data as CostEstimate
}

export async function confirmCostEstimate(costEstimateId: string, reason: string): Promise<CostEstimate> {
  const { userId } = await requireRole(['engineer', 'admin'])
  const safeReason = z.string().min(10).max(2000).parse(reason)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cost_estimates')
    .update({
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      override_reason: safeReason,
    })
    .eq('id', uuid.parse(costEstimateId))
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to confirm cost estimate')

  await recordAuditEvent({
    action: 'cost_estimate.confirm',
    entityType: 'cost_estimate',
    entityId: data.id,
    after: { reason: safeReason, table: data.table_estimate_php, ai: data.ai_likely_php },
  })

  return data as CostEstimate
}

export async function getCostEstimates(params: {
  inspectionId?: string
  reportId?: string
}): Promise<CostEstimate[]> {
  const supabase = await createClient()
  let query = supabase.from('cost_estimates').select('*')

  if (params.reportId) query = query.eq('report_id', uuid.parse(params.reportId))
  else if (params.inspectionId) query = query.eq('inspection_id', uuid.parse(params.inspectionId))
  else throw new Error('Provide a reportId or an inspectionId.')

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data || []) as CostEstimate[]
}

/** Human-readable summary used by the report print view. */
export async function summarizeCostEstimate(costEstimateId: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cost_estimates')
    .select('*')
    .eq('id', uuid.parse(costEstimateId))
    .single()

  if (error || !data) throw error ?? new Error('Cost estimate not found')

  const row = data as CostEstimate
  const parts = [
    `Table estimate: ${formatPhp(row.table_estimate_php)}.`,
    row.ai_likely_php != null
      ? `AI-assisted range: ${formatPhp(row.ai_low_php)} – ${formatPhp(row.ai_high_php)} (likely ${formatPhp(row.ai_likely_php)}).`
      : 'No AI estimate recorded.',
    row.divergence_flag
      ? `Divergence flagged and ${row.confirmed_by ? 'confirmed by an engineer' : 'NOT yet confirmed'}.`
      : 'No divergence flagged.',
  ]

  return parts.join(' ')
}

// -----------------------------------------------------------------
// A5. Recommendations — AI drafts, engineer signs
// -----------------------------------------------------------------

const recommendationSchema = z
  .object({
    inspectionId: uuid.nullish(),
    reportId: uuid.nullish(),
    detectionId: uuid.nullish(),
    draftText: z.string().max(10_000).nullish(),
    provenance: z.enum(['gemini', 'heuristic', 'engineer']).default('engineer'),
  })
  .strict()
  .refine((value) => Boolean(value.inspectionId || value.reportId), {
    message: 'A recommendation must be attached to an inspection or a report.',
  })

export async function createRecommendation(
  input: z.input<typeof recommendationSchema>
): Promise<Recommendation> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = recommendationSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recommendations')
    .insert({
      inspection_id: parsed.inspectionId ?? null,
      report_id: parsed.reportId ?? null,
      detection_id: parsed.detectionId ?? null,
      draft_text: parsed.draftText ?? null,
      status: 'draft',
      provenance: parsed.provenance,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create recommendation')

  await recordAuditEvent({
    action: 'recommendation.create',
    entityType: 'recommendation',
    entityId: data.id,
    after: { provenance: parsed.provenance, signedBy: userId },
  })

  return data as Recommendation
}

const signSchema = z
  .object({
    recommendationId: uuid,
    finalText: z.string().min(1).max(10_000),
  })
  .strict()

export async function signRecommendation(
  input: z.input<typeof signSchema>
): Promise<Recommendation> {
  await requireRole(['engineer', 'admin'])
  const parsed = signSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('sign_report_recommendation', {
    p_recommendation_id: parsed.recommendationId,
    p_final_text: parsed.finalText,
  })
  if (error || !data) throw error ?? new Error('Failed to sign recommendation')
  return data as Recommendation
}

export async function getRecommendations(params: {
  reportId?: string
  inspectionId?: string
}): Promise<Recommendation[]> {
  const supabase = await createClient()
  let query = supabase.from('recommendations').select('*')

  if (params.reportId) query = query.eq('report_id', uuid.parse(params.reportId))
  else if (params.inspectionId) query = query.eq('inspection_id', uuid.parse(params.inspectionId))
  else throw new Error('Provide a reportId or an inspectionId.')

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data || []) as Recommendation[]
}

// -----------------------------------------------------------------
// Sharing
// -----------------------------------------------------------------

export async function createShareToken(reportId: string, expiresInDays = 14): Promise<ShareToken> {
  await requireRole(['engineer', 'admin'])
  const days = z.number().int().min(1).max(90).parse(expiresInDays)
  const supabase = await createClient()
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.rpc('create_report_share', {
    p_report_id: uuid.parse(reportId), p_token: token, p_expires_at: expiresAt,
  })
  if (error || !data) throw error ?? new Error('Failed to create share token')
  return data as ShareToken
}

export async function revokeShareToken(shareTokenId: string): Promise<void> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()

  const { error } = await supabase.rpc('revoke_report_share', { p_share_token_id: uuid.parse(shareTokenId) })

  if (error) throw error

  await recordAuditEvent({
    action: 'report.share_token.revoke',
    entityType: 'share_token',
    entityId: shareTokenId,
  })
}

/** Recent links are staff-only; their potentially large snapshots stay server-side. */
export async function getReportShareTokens(reportId: string): Promise<ShareToken[]> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()
  const { data, error } = await supabase.from('share_tokens')
    .select('id,report_id,token,created_by,created_at,expires_at,revoked_at')
    .eq('report_id', uuid.parse(reportId))
    .order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []) as ShareToken[]
}

// -----------------------------------------------------------------
// Admin audit reader
// -----------------------------------------------------------------

export async function getAuditEvents(params: {
  entityType?: string
  action?: string
  limit?: number
} = {}): Promise<AuditEvent[]> {
  await requireRole(['admin'])
  const supabase = await createClient()

  let query = supabase.from('audit_events').select('*')
  if (params.entityType) query = query.eq('entity_type', params.entityType)
  if (params.action) query = query.eq('action', params.action)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(Math.min(params.limit ?? 100, 500))

  if (error) throw error
  return (data || []) as AuditEvent[]
}


/** Reviewed data used by print/export; a failed query never becomes an empty successful publication. */
export async function getReportPublication(reportId: string): Promise<{
  recommendations: Recommendation[]
  limitation: ReportLimitation | null
  costs: CostEstimate[]
  detections: AIDamageDetection[]
  anchors: ARAnchor[]
  images: { id: string; caption: string; signed_url: string | null }[]
}> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()
  const { data: report, error: reportError } = await supabase.from('reports')
    .select('id, inspection_id, content_updated_at').eq('id', uuid.parse(reportId)).single()
  if (reportError || !report) throw reportError ?? new Error('Report not found')
  const [recommendations, limitation, costs] = await Promise.all([
    getRecommendations({ reportId }), getReportLimitation(reportId), getCostEstimates({ reportId }),
  ])
  const { getDetectionsForInspection } = await import('./ai')
  const { resolveEvidenceLocation } = await import('@/app/lib/storage-location')
  const [detections, anchorResult, imageResult] = report.inspection_id ? await Promise.all([
    getDetectionsForInspection(report.inspection_id),
    supabase.from('ar_anchors').select('*').eq('inspection_id', report.inspection_id),
    supabase.from('inspection_images').select('*').eq('inspection_id', report.inspection_id),
  ]) : [[], { data: [], error: null }, { data: [], error: null }]
  if (anchorResult.error) throw anchorResult.error
  if (imageResult.error) throw imageResult.error
  const anchors = await Promise.all((anchorResult.data ?? []).map(async (row) => {
    if (!row.snapshot_path) return row as ARAnchor
    const location = resolveEvidenceLocation(row)
    const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 3600)
    if (error) throw new Error('Could not load captured AR evidence for this report.')
    return { ...row, image_url: data?.signedUrl } as ARAnchor
  }))
  const images = await Promise.all((imageResult.data ?? []).map(async (row) => {
    const location = resolveEvidenceLocation(row)
    const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 3600)
    if (error) throw new Error('Could not load photographic evidence for this report.')
    return { id: String(row.id), caption: String(row.caption ?? 'Inspection evidence'), signed_url: data?.signedUrl ?? null }
  }))

  return {
    recommendations: recommendations.filter((item) => item.status === 'signed' && item.signed_at != null && item.signed_at >= report.content_updated_at),
    limitation, costs, detections, anchors, images,
  }
}

/** Load reviewed findings on the server so drafting never invents a default defect or severity. */
/**
 * A refusal is returned, never thrown: production strips messages from thrown
 * server-action errors, so an expected "verify a detection first" guard would
 * reach the browser as an opaque React error instead of a sentence.
 */
export type RecommendationDraftContext =
  | {
      available: true
      damageType: import('@/app/types').DamageType
      severity: import('@/app/types').SeverityLevel
      elementType: import('@/app/types').StructuralElement
      context: string
    }
  | { available: false; reason: string }

export async function getRecommendationDraftContext(
  reportId: string
): Promise<RecommendationDraftContext> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()
  const { data: report, error } = await supabase.from('reports')
    .select('id, inspection_id, key_findings').eq('id', uuid.parse(reportId)).single()
  if (error || !report?.inspection_id) {
    return { available: false, reason: 'Link this report to an inspection before drafting from its evidence.' }
  }
  const { getDetectionsForInspection } = await import('./ai')
  const [allDetections, costs, inspectionResult] = await Promise.all([
    getDetectionsForInspection(report.inspection_id), getCostEstimates({ reportId }),
    supabase.from('inspections').select('structural_element, notes, location').eq('id', report.inspection_id).single(),
  ])
  if (inspectionResult.error) {
    return { available: false, reason: 'The linked inspection could not be read.' }
  }
  const reviewed = allDetections.filter((item) => item.verified_by && item.provenance !== 'legacy_synthetic')
  if (reviewed.length === 0) {
    return {
      available: false,
      reason:
        'This inspection has no verified detections yet. Run the AI analysis on an image and verify a detection before drafting from evidence — or write the recommendation manually.',
    }
  }
  const dominant = [...reviewed].sort((a, b) => b.severity_score - a.severity_score)[0]
  const allowedElements = ['beam','column','slab','wall','foundation','facade','roof','general','other']
  const element = inspectionResult.data?.structural_element
  const context = [
    `Report findings: ${report.key_findings ?? ''}`,
    `Inspection: ${inspectionResult.data?.location ?? ''}. ${inspectionResult.data?.notes ?? ''}`,
    `Verified findings: ${JSON.stringify(reviewed.map((item) => ({ type: item.damage_type, severity: item.severity, score: item.severity_score, notes: item.notes, provenance: item.provenance })))}`,
    `Planning costs (PHP): ${JSON.stringify(costs.map((item) => ({ table: item.table_estimate_php, low: item.ai_low_php, likely: item.ai_likely_php, high: item.ai_high_php, confirmed: Boolean(item.confirmed_at), divergent: item.divergence_flag })))}`,
  ].join('\n').slice(0, 2000)
  return { available: true, damageType: dominant.damage_type, severity: dominant.severity, elementType: (allowedElements.includes(element) ? element : 'general') as import('@/app/types').StructuralElement, context }
}


export async function getReportNarrativeContext(reportId: string): Promise<{
  title: string; riskScore: number; riskLevel: import('@/app/types').RiskLevel; findings: string;
  detections: { damageType: string; severity: string; notes?: string }[];
}> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()
  const { data: report, error } = await supabase.from('reports')
    .select('title,risk_score,key_findings,inspection_id').eq('id', uuid.parse(reportId)).single()
  if (error || !report) throw error ?? new Error('Report not found')
  const { getDetectionsForInspection } = await import('./ai')
  const { scoreToRiskLevel } = await import('@/app/lib/damage-score')
  const detections = report.inspection_id ? await getDetectionsForInspection(report.inspection_id) : []
  const reviewed = detections.filter((item) => item.verified_by && item.provenance !== 'legacy_synthetic')
  return { title: report.title, riskScore: report.risk_score, riskLevel: scoreToRiskLevel(report.risk_score),
    findings: report.key_findings ?? '', detections: reviewed.map((item) => ({ damageType: item.damage_type, severity: item.severity, notes: item.notes ?? undefined })) }
}
