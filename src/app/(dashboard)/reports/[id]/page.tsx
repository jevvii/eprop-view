'use client'

import { useParams } from 'next/navigation'
import { useReport } from '@/app/lib/queries'
import { ReportWorkbench } from '@/components/reports/report-workbench'
import {
  CostPanel,
  DetectionTaxonomyPanel,
  RecommendationPanel,
} from '@/components/reports/report-review-panels'
import { EmptyState, Panel } from '@/components/structural/ui'

/**
 * Report review workbench.
 *
 * A dedicated route rather than another modal: the work spans editing, revision
 * history, limitations, cost, recommendations and crack classification, which is
 * too much to hold in a dialog.
 */
export default function ReportDetailPage() {
  const params = useParams<{ id: string }>()
  const reportId = typeof params?.id === 'string' ? params.id : undefined
  const { data: report, isLoading, isError } = useReport(reportId)

  if (isLoading) {
    return <div className="h-96 rounded-lg bg-white border border-slate-200 animate-pulse" />
  }

  if (isError || !report) {
    return (
      <Panel title="Report">
        <EmptyState
          title="Report not found"
          message="This report does not exist, or your role cannot read it."
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-6">
      <ReportWorkbench report={report} />

      {report.inspection_id ? (
        <>
          <CostPanel report={report} />
          <RecommendationPanel report={report} />
          <DetectionTaxonomyPanel inspectionId={report.inspection_id} />
        </>
      ) : (
        <Panel title="Findings Review">
          <EmptyState
            title="No inspection linked"
            message="Link this report to an inspection to review its detections, repair costs and recommendations."
          />
        </Panel>
      )}
    </div>
  )
}
