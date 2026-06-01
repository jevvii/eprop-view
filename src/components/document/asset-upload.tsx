'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/app/lib/supabase/client'
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
    const supabase = createClient()

    try {
      const { data: authData } = await supabase.auth.getUser()
      const uploaderId = authData.user?.id

      for (const file of files) {
        const safeName = file.name.replace(/\s+/g, '-')
        const path = `${inspectionId}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('inspection-images')
          .upload(path, file, { upsert: false })
        if (uploadError) throw uploadError

        const { error: insertError } = await supabase.from('inspection_images').insert({
          inspection_id: inspectionId,
          storage_path: path,
          caption: file.name,
          uploader_id: uploaderId,
        })
        if (insertError) throw insertError
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
    <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-50 pb-4">
        <div>
          <h3 className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase">Asset Injection</h3>
        </div>
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-all group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />
          <span className="text-lg mb-1 grayscale group-hover:grayscale-0">📂</span>
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Browse</span>
        </button>

        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="md:hidden lg:hidden flex flex-col items-center justify-center border-2 border-slate-100 rounded-2xl p-4 bg-primary/[0.02] hover:bg-primary/[0.05] transition-all group"
        >
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />
          <span className="text-lg mb-1 grayscale group-hover:grayscale-0">📸</span>
          <span className="text-[8px] font-black text-primary uppercase tracking-widest">Capture</span>
        </button>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-primary/5 p-2.5 rounded-xl border border-primary/10">
            <span className="text-[8px] font-black text-primary uppercase tracking-widest truncate flex-1">
              {files.length} Assets Staged
            </span>
            <button onClick={() => setFiles([])} className="text-[8px] font-black text-slate-400 hover:text-red-500 transition-colors uppercase">Clear</button>
          </div>
          <Button 
            onClick={handleUpload} 
            disabled={uploading} 
            className="w-full py-3 h-auto text-[9px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/10"
          >
            {uploading ? 'Injecting...' : 'Confirm Upload'}
          </Button>
        </div>
      )}

      {error && <p className="text-[8px] font-black text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 uppercase tracking-widest">{error}</p>}
      {success && <p className="text-[8px] font-black text-emerald-600 bg-emerald-50 p-2 rounded-lg border border-emerald-100 uppercase tracking-widest">{success}</p>}
    </div>
  )
}
