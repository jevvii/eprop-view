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
    return <div className="bg-white p-6 rounded-lg shadow-lg h-40 animate-pulse" />
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
      <div className="bg-white p-6 rounded-lg shadow-lg text-red-600">
        Failed to load reports
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg text-slate-500">
        Add a project to start creating reports.
      </div>
    )
  }

  return (
    <>
      {/* ── Screen UI ── */}
      <div className="space-y-6 sm:space-y-8 no-print">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between px-1 sm:px-2">
          <div>
            <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Inspection Reports</h2>
            <p className="text-xs text-slate-500 font-medium tracking-wide mt-0.5">
              {selectedProjectName ? `Reports Archive · ${selectedProjectName}` : 'Generate and review technical inspection logs.'}
            </p>
          </div>
          
          {/* Actions Container */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-100 shadow-xs">
              <label htmlFor="report-project" className="text-xs font-bold text-slate-700 uppercase tracking-wide pl-2">Site</label>              <select
                id="report-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all max-w-[170px] truncate"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>

            {canExportReport && (
              <Button
                variant="outline"
                disabled={!hasReports}
                onClick={handlePrintAll}
                className="font-bold uppercase tracking-wider text-xs px-4 h-11 border-slate-200"
              >
                Print All
              </Button>
            )}

            {canExportReport && (
              <Button
                variant="outline"
                disabled={!hasReports || exporting}
                onClick={handleExportCsv}
                className="font-bold uppercase tracking-wider text-xs px-4 h-11 border-slate-200"
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </Button>
            )}

            {canCreateReport && (
              <Button 
                onClick={() => setIsCreateModalOpen(true)} 
                className="font-bold uppercase tracking-wider text-xs px-5 h-11 shadow-md shadow-primary/20 bg-primary hover:bg-primary/90 text-white"
              >
                + Add New Log
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

        <div className="grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-4">
          <div className="rounded-lg sm:rounded-lg bg-white p-4 sm:p-6 shadow-md border border-slate-100 group hover:shadow-lg transition-all min-w-0">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 truncate">Total Active Logs</div>
            <div className="text-3xl sm:text-4xl font-koulen text-black tabular-nums">{reportStats.open}</div>
          </div>
          <div className="rounded-lg sm:rounded-lg bg-indigo-50/60 p-4 sm:p-6 shadow-md border border-indigo-100 group hover:shadow-lg transition-all min-w-0">
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1 truncate">Pending Review</div>
            <div className="text-3xl sm:text-4xl font-koulen text-indigo-700 tabular-nums">{reportStats.in_review}</div>
          </div>
          <div className="rounded-lg sm:rounded-lg bg-rose-50/60 p-4 sm:p-6 shadow-md border border-rose-100 group hover:shadow-lg transition-all min-w-0">
            <div className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1 truncate">Critical Priority</div>
            <div className="text-3xl sm:text-4xl font-koulen text-rose-600 tabular-nums">{reportStats.critical}</div>
          </div>
          <div className="rounded-lg sm:rounded-lg bg-emerald-50/60 p-4 sm:p-6 shadow-md border border-emerald-100 group hover:shadow-lg transition-all min-w-0">
            <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 truncate">Verified Complete</div>
            <div className="text-3xl sm:text-4xl font-koulen text-emerald-600 tabular-nums">{reportStats.completed}</div>
          </div>
        </div>

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
