'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { uploadInspectionImage } from '@/app/actions/uploads'
import { Button } from '@/components/ui/button'

interface AssetUploadProps {
  inspectionId: string
  onSuccess?: () => void
}

export function AssetUpload({ inspectionId, onSuccess }: AssetUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (incomingFiles: FileList | null) => {
    if (!incomingFiles) return
    const newFiles = Array.from(incomingFiles)
    setFiles((prev) => [...prev, ...newFiles])
    setError(null)
    setSuccess(null)
  }

  const handleUpload = async () => {
    if (!inspectionId) {
      setError('SELECT_INSPECTION_ENTRY_FIRST')
      return
    }
    if (files.length === 0) return

    setError(null)
    setSuccess(null)
    setUploading(true)

    try {
      for (const file of files) {
        const formData = new FormData()
        formData.append('inspectionId', inspectionId)
        formData.append('file', file)
        formData.append('caption', file.name)
        await uploadInspectionImage(formData)
      }

      setFiles([])
      setSuccess('SYNC_COMPLETE')
      queryClient.invalidateQueries({ queryKey: ['inspection-images', inspectionId] })
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'UPLOAD_FAILED')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">Asset Injection</h3>
        </div>
        <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/70 hover:bg-slate-100/70 transition-all group min-h-[72px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />
          <span className="text-2xl mb-1 grayscale group-hover:grayscale-0 transition-transform group-hover:scale-110" aria-hidden="true">📂</span>
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Browse</span>
        </button>

        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex flex-col items-center justify-center border-2 border-slate-200 rounded-2xl p-4 bg-primary/[0.03] hover:bg-primary/[0.08] transition-all group min-h-[72px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />
          <span className="text-2xl mb-1 grayscale group-hover:grayscale-0 transition-transform group-hover:scale-110" aria-hidden="true">📸</span>
          <span className="text-xs font-bold text-primary uppercase tracking-wide">Capture</span>
        </button>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-primary/5 p-3 rounded-xl border border-primary/10">
            <span className="text-xs font-bold text-primary uppercase tracking-wider truncate flex-1 tabular-nums">
              {files.length} Assets Staged
            </span>
            <button onClick={() => setFiles([])} className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors uppercase px-2 py-1">Clear</button>
          </div>
          <Button 
            onClick={handleUpload} 
            disabled={uploading} 
            className="w-full min-h-[44px] py-3 text-xs font-bold uppercase tracking-wider shadow-md shadow-primary/10"
          >
            {uploading ? 'Injecting...' : 'Confirm Upload'}
          </Button>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 uppercase tracking-wide">{error}</p>}
      {success && <p className="text-xs font-semibold text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100 uppercase tracking-wide">{success}</p>}
    </div>
  )
}
