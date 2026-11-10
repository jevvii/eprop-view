'use server'

import { randomBytes } from 'node:crypto'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { recordAuditEvent } from '@/app/lib/audit'
import { checkDivergence, formatPhp, tableEstimate } from '@/app/lib/structural/cost-table'
import { z } from 'zod'
import type {
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
  })
  .strict()

export async function updateReportWithRevision(
  input: z.input<typeof reportUpdateSchema>
): Promise<{ report: Record<string, unknown>; revisionNumber: number }> {
  const { userId } = await requireRole(['engineer', 'admin'])
  const parsed = reportUpdateSchema.parse(input)
  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('reports')
    .select('*')
    .eq('id', parsed.reportId)
    .single()

  if (readError || !existing) throw new Error('Report not found')

  const updates: Record<string, unknown> = {
    last_edited_by: userId,
    last_edited_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (parsed.title !== undefined) updates.title = parsed.title
  if (parsed.date !== undefined) updates.date = parsed.date
  if (parsed.location !== undefined) updates.location = parsed.location
  if (parsed.status !== undefined) updates.status = parsed.status
  if (parsed.riskScore !== undefined) updates.risk_score = parsed.riskScore
  if (parsed.keyFindings !== undefined) updates.key_findings = parsed.keyFindings

  // Snapshot BEFORE mutating, so the previous state is recoverable even if the
  // update below fails.
  const { data: latestRevision } = await supabase
    .from('report_revisions')
    .select('revision_number')
    .eq('report_id', parsed.reportId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const revisionNumber = (latestRevision?.revision_number ?? 0) + 1

  const { error: revisionError } = await supabase.from('report_revisions').insert({
    report_id: parsed.reportId,
    revision_number: revisionNumber,
    snapshot: existing as Record<string, unknown>,
    changed_by: userId,
  })

  if (revisionError) throw revisionError

  const { data: updated, error } = await supabase
    .from('reports')
    .update(updates)
    .eq('id', parsed.reportId)
    .select()
    .single()

  if (error || !updated) throw error ?? new Error('Failed to update report')

  await recordAuditEvent({
    action: 'report.update',
    entityType: 'report',
    entityId: parsed.reportId,
    before: existing as Record<string, unknown>,
    after: updates,
    metadata: { revisionNumber },
  })

  return { report: updated as Record<string, unknown>, revisionNumber }
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
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
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
      confirmed_by: divergence.divergent ? null : userId,
      confirmed_at: divergence.divergent ? null : new Date().toISOString(),
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
    provenance: z.enum(['gemini', 'heuristic', 'engineer']).default('gemini'),
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
  const { userId } = await requireRole(['engineer', 'admin'])
  const parsed = signSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recommendations')
    .update({
      final_text: parsed.finalText,
      status: 'signed',
      signed_by: userId,
      signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.recommendationId)
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to sign recommendation')

  await recordAuditEvent({
    action: 'recommendation.sign',
    entityType: 'recommendation',
    entityId: data.id,
    after: { length: parsed.finalText.length },
  })

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
  const { userId } = await requireRole(['engineer', 'admin'])
  const days = z.number().int().min(1).max(90).parse(expiresInDays)
  const supabase = await createClient()

  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('share_tokens')
    .insert({
      report_id: uuid.parse(reportId),
      token,
      created_by: userId,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create share token')

  await recordAuditEvent({
    action: 'report.share_token.create',
    entityType: 'share_token',
    entityId: data.id,
    after: { reportId, expiresAt },
  })

  return data as ShareToken
}

export async function revokeShareToken(shareTokenId: string): Promise<void> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()

  const { error } = await supabase
    .from('share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', uuid.parse(shareTokenId))

  if (error) throw error

  await recordAuditEvent({
    action: 'report.share_token.revoke',
    entityType: 'share_token',
    entityId: shareTokenId,
  })
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
