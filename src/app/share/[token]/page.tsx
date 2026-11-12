import type { Metadata } from 'next'
import { createServiceClient } from '@/app/lib/supabase/service'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Shared Inspection Report',
  robots: { index: false, follow: false },
}

interface SharedReport {
  report_id: string
  title: string
  date: string
  location: string
  status: string
  risk_score: number
  key_findings: string | null
}

interface SharedRecommendation {
  id: string
  final_text: string | null
  signed_at: string | null
}

/**
 * Read-only report page reached through an unguessable token.
 *
 * The token is the authorisation, so this route uses the service-role client
 * rather than a session. It reads only what the shared view needs, and it
 * refuses expired or revoked tokens with a sentence a reader can act on.
 */
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: shareRow } = await supabase
    .from('share_tokens')
    .select('expires_at, revoked_at, snapshot')
    .eq('token', token)
    .maybeSingle()

  if (!shareRow) {
    return <Shell title="Link not recognised">This link does not exist. Ask the sender for a new one.</Shell>
  }

  if (shareRow.revoked_at) {
    return <Shell title="Link revoked">This share link was revoked. Ask the sender to share the report again.</Shell>
  }

  if (shareRow.expires_at && new Date(shareRow.expires_at).getTime() < Date.now()) {
    return (
      <Shell title="Link expired">
        This share link expired on {new Date(shareRow.expires_at).toLocaleDateString()}. Ask the sender for a new one.
      </Shell>
    )
  }

  const snapshot = shareRow.snapshot as {
    report?: SharedReport
    limitation?: { standard_exclusions: string[]; free_text?: string | null }
    recommendations?: SharedRecommendation[]
  } | null
  if (!snapshot?.report || !Array.isArray(snapshot.recommendations)) {
    return <Shell title="Link needs renewal">Ask the sender for a new link with an immutable report snapshot.</Shell>
  }
  const typedReport = snapshot.report
  const limitation = snapshot.limitation
  const signed = snapshot.recommendations

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4">
      <article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 sm:p-10 shadow-sm border border-slate-200 space-y-8">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Shared inspection report</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">{typedReport.title}</h1>
          <p className="text-sm text-slate-600 font-medium mt-2">
            {typedReport.report_id} · {new Date(typedReport.date).toLocaleDateString()} · {typedReport.location}
          </p>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Status {typedReport.status.replace('_', ' ')} · Risk score {typedReport.risk_score}/10
          </p>
        </header>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">Key findings</h2>
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
            {typedReport.key_findings?.trim() || 'No findings recorded.'}
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">Recommendations</h2>
          {signed.length === 0 ? (
            <p className="text-sm text-slate-600">No signed recommendation appears on this report.</p>
          ) : (
            <ul className="space-y-3">
              {signed.map((item) => (
                <li key={item.id} className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                  {item.final_text}
                  <span className="block text-[11px] uppercase tracking-wide text-slate-500 font-medium mt-1">
                    Signed {item.signed_at ? new Date(item.signed_at).toLocaleDateString() : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">Assessment limitations</h2>
          {limitation ? (
            <>
              <ul className="list-disc pl-5 space-y-1">
                {(limitation.standard_exclusions as string[]).map((exclusion) => (
                  <li key={exclusion} className="text-sm text-slate-700">{exclusion}</li>
                ))}
              </ul>
              {limitation.free_text ? (
                <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">{limitation.free_text}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-600">No limitation statement was recorded for this report.</p>
          )}
        </section>

        <footer className="border-t border-slate-200 pt-4 text-[11px] text-slate-500 font-medium">
          This page is read-only. It shows the report as shared; later edits are not reflected.
        </footer>
      </article>
    </main>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md rounded-2xl bg-white p-8 shadow-sm border border-slate-200 text-center">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600 font-medium mt-2">{children}</p>
      </div>
    </main>
  )
}
