'use client'

import { useEffect, useMemo, useState } from 'react'
import { useProjects, useReports, useProfile } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'
import { AccessDenied } from '@/components/shared/require-role'
import { PrintReport } from '@/components/reports/print-report'
import { ReportForm } from '@/components/reports/report-form'
import { ReportDialog } from '@/components/reports/report-dialog'
import { ReportsTable } from '@/components/reports/reports-table'
import { ReportFilters, downloadCsv, filterReports, useReportFilters } from '@/components/shared/report-filters'
import { exportReportsCsv } from '@/app/actions/export'
import { Button } from '@/components/ui/button'
import type { Report } from '@/app/types'

export default function ReportsPage() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: projects, isLoading, isError } = useProjects()
  const [projectId, setProjectId] = useState('')
  const { filters, update, reset } = useReportFilters()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [printReady, setPrintReady] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const [pendingPrint, setPendingPrint] = useState(false)
  const [printMode, setPrintMode] = useState<'single' | 'full'>('single')
  const { data: reports, isLoading: reportsLoading, isError: reportsError } = useReports(projectId || undefined)

  const canViewReports = hasCapability(profile?.role, 'report:view')
  const canCreateReport = hasCapability(profile?.role, 'report:create')
  const canExportReport = hasCapability(profile?.role, 'report:export')

  const filteredReports = useMemo(() => filterReports(reports, filters), [reports, filters])

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projectId, projects])

  const reportStats = useMemo(() => {
    const stats = { open: 0, in_review: 0, critical: 0, completed: 0 }
    reports?.forEach((report) => {
      if (report.status in stats) {
        stats[report.status as keyof typeof stats] += 1
      }
    })
    return stats
  }, [reports])

  const selectedProjectName = projects?.find((project) => project.id === projectId)?.name
  const hasReports = filteredReports.length > 0

  const handlePrintAll = () => {
    setPrintMode('full')
    setPendingPrint(true)
  }

  const handlePrintSelected = () => {
    setPrintMode('single')
    setPendingPrint(true)
  }

  useEffect(() => {
    if (!pendingPrint || !printReady) return
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (document.querySelector('[data-print-ready="true"]')) window.print()
        setPendingPrint(false)
      })
    })
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame) }
  }, [pendingPrint, printReady, printMode, selectedReport])

  useEffect(() => { if (printError) setPendingPrint(false) }, [printError])

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const handleExportCsv = async () => {
    setExporting(true)
    setExportError('')
    try {
      const payload = await exportReportsCsv(projectId || null, filters)
      downloadCsv(payload.filename, payload.csv)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Report export failed. Retry after checking the connection.')
    } finally {
      setExporting(false)
    }
  }

  if (isLoading || profileLoading) {
    return <div className="bg-white p-6 rounded-lg h-40 animate-pulse" />
  }

  if (profile && !canViewReports) {
    return (
      <AccessDenied
        title="Inspection Reports Restricted"
        message="Engineering reports and audit logs are restricted to Structural Engineers and System Administrators. Field Inspectors can submit observations and assets via the Document Vault."
        returnHref="/document"
        returnLabel="Go to Document Vault"
      />
    )
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-lg text-red-600">
        Failed to load reports
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg text-slate-500">
        Add a project to start creating reports.
      </div>
    )
  }

  return (
    <>
      {/* ── Screen UI ── */}
      <div className="space-y-6 sm:space-y-8 no-print">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <h2 className="font-koulen text-xl text-primary uppercase tracking-wide sm:text-2xl">Inspection Reports</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-600">
              {selectedProjectName ? `Reports Archive · ${selectedProjectName}` : 'Generate and review technical inspection logs.'}
            </p>
          </div>
          
          {/* Actions Container */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="report-project" className="flex items-center gap-2 text-sm text-slate-600">
              Site
              <select
                id="report-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="h-10 max-w-[190px] truncate rounded-md border border-slate-300 bg-white px-3 text-sm font-medium"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>

            {canExportReport && (
              <Button
                variant="outline"
                disabled={!hasReports}
                onClick={handlePrintAll}
                className="h-10 px-4 text-sm font-medium"
              >
                Print All
              </Button>
            )}

            {canExportReport && (
              <Button
                variant="outline"
                disabled={!hasReports || exporting}
                onClick={handleExportCsv}
                className="h-10 px-4 text-sm font-medium"
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </Button>
            )}

            {canCreateReport && (
              <Button 
                onClick={() => setIsCreateModalOpen(true)} 
                className="h-10 px-5 text-sm font-semibold"
              >
                New report
              </Button>
            )}
          </div>
        </div>

        {exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
        {printError && <p role="alert" className="text-sm text-red-700">{printError}</p>}
        <ReportFilters
          filters={filters}
          onChange={update}
          onReset={reset}
          resultCount={filteredReports.length}
        />

        <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: 'Active logs', value: reportStats.open, tone: 'text-slate-900' },
            { label: 'Pending review', value: reportStats.in_review, tone: 'text-primary' },
            { label: 'Critical priority', value: reportStats.critical, tone: 'text-[#9F2F2D]' },
            { label: 'Verified complete', value: reportStats.completed, tone: 'text-[#346538]' },
          ].map((tile) => (
            <div
              key={tile.label}
              className="min-w-0 rounded-lg border border-slate-200 bg-white px-4 py-3.5"
            >
              <dt className="truncate text-xs font-medium text-slate-600">{tile.label}</dt>
              <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tile.tone}`}>
                {tile.value}
              </dd>
            </div>
          ))}
        </dl>

        <ReportsTable 
          reports={filteredReports} 
          isLoading={reportsLoading} 
          isError={reportsError} 
          selectedReport={selectedReport}
          setSelectedReport={setSelectedReport}
          onPrintSelected={handlePrintSelected}
        />
      </div>

      {/* ── Print-only content (outside space-y-10 flow) ── */}
      <div className="print-only">
        <PrintReport
          reports={filteredReports}
          projectName={selectedProjectName ?? 'All Projects'}
          generatedBy={profile?.full_name ?? profile?.email ?? 'System'}
          stats={reportStats}
          onReadyChange={setPrintReady}
          onError={setPrintError}
          selectedReport={printMode === 'single' ? selectedReport : null}
        />
      </div>

      {isCreateModalOpen && (
        <ReportDialog title="Create new report" onClose={() => setIsCreateModalOpen(false)}>
            <ReportForm
              projectId={projectId}
              onClose={() => setIsCreateModalOpen(false)}
            />
        </ReportDialog>
      )}
    </>
  )
}
