'use client'

import { useRef, useState } from 'react'
import { useProjects } from '@/app/lib/queries'
import { exportProjectRecords, importProjectRecords, type ImportResult } from '@/app/actions/backup'
import { InlineMessage, Panel, inputClass, useAsyncAction } from '@/components/structural/ui'

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * Record export and import.
 *
 * Deliberately called a record export on screen, not a backup: it carries the
 * project's operational rows as JSON, not storage objects, and the import always
 * previews before it writes.
 */
export function BackupRestore() {
  const { data: projects } = useProjects()
  const [projectId, setProjectId] = useState('')
  const [exportOmissions, setExportOmissions] = useState<string[]>([])
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [pendingPayload, setPendingPayload] = useState<unknown>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const exportAction = useAsyncAction()
  const importAction = useAsyncAction()

  const handleExport = async () => {
    if (!projectId) return
    const payload = await exportAction.run('Export ready.', () => exportProjectRecords(projectId))
    if (payload) {
      setExportOmissions(payload.omissions)
      const safeName = payload.project.name
        ? String(payload.project.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()
        : 'project'
      downloadJson(`${safeName}-${new Date().toISOString().slice(0, 10)}.json`, payload)
    }
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      setPendingPayload(parsed)
      const result = await importAction.run('File validated.', () =>
        importProjectRecords(parsed, { dryRun: true })
      )
      setPreview(result)
    } catch (caught) {
      setPreview(null)
      setPendingPayload(null)
      // The action reports schema failures; a parse failure is caught here.
      if (caught instanceof SyntaxError) {
        importAction.run('File validated.', async () => { throw new Error('This file is not valid JSON. Choose a previous record export.') })
      }
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleApply = async () => {
    if (!pendingPayload) return
    const result = await importAction.run('Records imported.', () =>
      importProjectRecords(pendingPayload, { dryRun: false })
    )
    if (result) {
      setPreview(result)
      setPendingPayload(null)
    }
  }

  return (
    <Panel
      title="Record Export & Import"
      description="Transfers project, building, inspection, hazard and field-review records as JSON. Files and immutable audit history are excluded. Imported reports require a fresh engineering review."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="export-project" className="block text-[11px] font-bold text-slate-500">
            Export a project
          </label>
          <select
            id="export-project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className={inputClass}
          >
            <option value="">Select a project…</option>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExport}
            disabled={!projectId || exportAction.pending}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {exportAction.pending ? 'Exporting…' : 'Download JSON'}
          </button>
          {exportAction.error && <InlineMessage tone="error">{exportAction.error}</InlineMessage>}
          {exportAction.success && <InlineMessage tone="success">{exportAction.success}</InlineMessage>}
          {exportOmissions.length > 0 && <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">{exportOmissions.map(item => <li key={item}>{item}</li>)}</ul>}
        </div>

        <div className="space-y-2">
          <label htmlFor="import-file" className="block text-[11px] font-bold text-slate-500">
            Import a previous export
          </label>
          <input
            id="import-file"
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="block w-full text-xs font-medium text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file: file: file:text-slate-700"
          />
          <p className="text-[11px] text-slate-500 font-medium">
            The file is validated and previewed first. Nothing is written until you confirm.
          </p>
        </div>
      </div>

      {importAction.error && <InlineMessage tone="error">{importAction.error}</InlineMessage>}

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="text-xs font-bold text-slate-800">
            {preview.imported ? 'Import complete' : 'Preview — nothing written yet'}
          </p>
          <p className="text-xs text-slate-700 font-medium">
            {preview.projectName} · {preview.inspections} inspections · {preview.reports} reports · {preview.maintenance} maintenance items
          </p>
          {preview.warnings.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {preview.warnings.map((warning) => (
                <li key={warning} className="text-[11px] text-amber-900 font-medium">{warning}</li>
              ))}
            </ul>
          )}
          {!preview.imported && pendingPayload != null && (
            <button
              type="button"
              onClick={handleApply}
              disabled={importAction.pending}
              className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
            >
              {importAction.pending ? 'Importing…' : 'Confirm import'}
            </button>
          )}
        </div>
      )}
    </Panel>
  )
}
