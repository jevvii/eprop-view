'use client'

import { useCallback, useEffect, useState } from 'react'
import { getAuditEvents } from '@/app/actions/reports-v2'
import type { AuditEvent } from '@/app/types'
import { Chip, EmptyState, Panel, formatDate, inputClass } from '@/components/structural/ui'

/**
 * Audit trail reader.
 *
 * Every mutation in the capstone v2 layer writes here through a SECURITY DEFINER
 * function that stamps the actor server-side, so the trail cannot be attributed
 * to somebody else by a client.
 */
export function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(
        await getAuditEvents({
          entityType: entityType || undefined,
          action: action || undefined,
          limit: 100,
        })
      )
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [entityType, action])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <Panel
      title="Audit Log"
      description="Who changed what, when. Written by the database, not by the browser."
      action={
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Filter by entity type"
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            className={`${inputClass} max-w-[180px]`}
            placeholder="entity type"
          />
          <input
            aria-label="Filter by action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className={`${inputClass} max-w-[180px]`}
            placeholder="action"
          />
        </div>
      }
    >
      {loading && <p className="text-xs text-slate-500 font-medium">Loading…</p>}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No audit events match"
          message="Events appear here as soon as an inspection, report, cost estimate or recommendation is written."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr>
                {['When', 'Action', 'Entity', 'Actor'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-2 pr-3 border-b border-slate-200"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 text-xs text-slate-600 font-medium whitespace-nowrap">
                    {formatDate(event.created_at)}
                  </td>
                  <td className="py-2 pr-3">
                    <Chip tone="info">{event.action}</Chip>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-700 font-medium">
                    {event.entity_type}
                    {event.entity_id ? ` · ${event.entity_id.slice(0, 8)}` : ''}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-600 font-medium">
                    {event.actor_role ?? 'unknown'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
