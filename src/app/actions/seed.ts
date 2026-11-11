'use server'

import { requireRole } from '@/app/lib/dal'
import { createServiceClient } from '@/app/lib/supabase/service'
import { DEMO_PROJECT_NAME, seedDemoData, type SeedResult } from '@/app/lib/seed/demo'
import { recordAuditEvent } from '@/app/lib/audit'

/**
 * Demo seeding is a preview-only affordance.
 *
 * It writes with the service-role client, which bypasses RLS, so it is gated on
 * the deployment environment rather than on the caller alone: an admin on a
 * production deployment cannot reach it even by invoking the action directly.
 */
function seedingAllowed(): { allowed: boolean; reason: string } {
  const vercelEnv = process.env.VERCEL_ENV

  if (vercelEnv === 'preview') {
    return { allowed: true, reason: 'Running on a Preview deployment.' }
  }

  if (process.env.SEED_DEMO_DATA === '1') {
    return { allowed: true, reason: 'SEED_DEMO_DATA=1 is set locally.' }
  }

  return {
    allowed: false,
    reason:
      vercelEnv === 'production'
        ? 'Blocked: this is a Production deployment. Demo data is only written to Preview.'
        : 'Blocked: set SEED_DEMO_DATA=1 to seed a local database.',
  }
}

export interface SeedAvailability {
  allowed: boolean
  reason: string
  projectName: string
}

export async function getSeedAvailability(): Promise<SeedAvailability> {
  await requireRole(['admin'])
  return { ...seedingAllowed(), projectName: DEMO_PROJECT_NAME }
}

export async function seedPreviewData(): Promise<SeedResult> {
  await requireRole(['admin'])

  const { allowed, reason } = seedingAllowed()
  if (!allowed) throw new Error(reason)

  const supabase = createServiceClient()
  const result = await seedDemoData(supabase)

  if (result.seeded) {
    await recordAuditEvent({
      action: 'demo.seed',
      entityType: 'project',
      metadata: result.counts,
    })
  }

  return result
}
