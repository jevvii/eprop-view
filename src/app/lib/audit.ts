import 'server-only'
import { createClient } from './supabase/server'

/**
 * Audit trail helper.
 *
 * The actor identity is stamped by the database inside `log_audit_event`
 * (SECURITY DEFINER), not passed from the client, so a caller cannot attribute
 * an action to somebody else.
 *
 * A failed audit write must never roll back the user's real work. It is logged
 * and swallowed: losing a trail entry is bad, losing an inspection is worse.
 */
export interface AuditEventInput {
  action: string
  entityType: string
  entityId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: input.action,
      p_entity_type: input.entityType,
      p_entity_id: input.entityId ?? null,
      p_before: input.before ?? null,
      p_after: input.after ?? null,
      p_metadata: input.metadata ?? {},
    })

    if (error) {
      console.error('Audit write failed:', error.message)
    }
  } catch (error) {
    console.error('Audit write threw:', error)
  }
}
