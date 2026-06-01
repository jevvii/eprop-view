'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/app/lib/supabase/client'
import { useInspectionImages, useInspections, useProfile } from '@/app/lib/queries'
import { Button } from '@/components/ui/button'

export function ImageUpload() {
  const { data: profile } = useProfile()
  const { data: inspections } = useInspections()
  const [inspectionId, setInspectionId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: images, isLoading } = useInspectionImages(inspectionId || undefined)

  useEffect(() => {
    if (!inspectionId && inspections && inspections.length > 0) {
      setInspectionId(inspections[0].id)
    }
  }, [inspectionId, inspections])

  const selectedInspectionLabel = useMemo(() => {
    if (!inspectionId || !inspections) return null
    const inspection = inspections.find((item) => item.id === inspectionId)
    if (!inspection) return null
    return `${new Date(inspection.inspection_date).toLocaleDateString()} · ${inspection.location}`
  }, [inspectionId, inspections])

  const handleFileChange = (incomingFiles: FileList | null) => {
    if (!incomingFiles) return
    setFiles(Array.from(incomingFiles))
  }

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    handleFileChange(event.dataTransfer.files)
  }

  const handleUpload = async () => {
    if (!inspectionId) {
      setError('Select an inspection before uploading.')
      return
    }
    if (files.length === 0) {
      setError('Choose at least one file to upload.')
      return
    }

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
      setSuccess('Images uploaded successfully.')
      queryClient.invalidateQueries({ queryKey: ['inspection-images', inspectionId] })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (imageId: string, storagePath: string) => {
    if (!window.confirm('Permanent Deletion Protocol: Are you sure you want to remove this asset?')) return
    
    setDeletingId(imageId)
    setError(null)
    const supabase = createClient()

    try {
      // 1. Delete from Storage
      const { error: storageError } = await supabase.storage
        .from('inspection-images')
        .remove([storagePath])
      
      if (storageError) throw storageError

      // 2. Delete from Database
      const { error: dbError } = await supabase
        .from('inspection_images')
        .delete()
        .eq('id', imageId)
      
      if (dbError) throw dbError

      queryClient.invalidateQueries({ queryKey: ['inspection-images', inspectionId] })
      setSuccess('Asset successfully purged from vault.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deletion failed.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8 flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-100 pb-6 px-2">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Asset Vault</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Storage for site imagery and evidence.</p>
        </div>
        <div className="text-[9px] font-black text-primary uppercase tracking-[0.2em] bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
          Cloud Sync Active
        </div>
      </div>

      <div className="space-y-6 flex-1">
        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Target Inspection</label>
          <select
            value={inspectionId}
            onChange={(event) => setInspectionId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
          >
            <option value="">SELECT_ENTRY</option>
            {inspections?.map((inspection) => (
              <option key={inspection.id} value={inspection.id}>
                {new Date(inspection.inspection_date).toLocaleDateString()} · {inspection.location}
              </option>
            ))}
          </select>
        </div>

        <label
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[2rem] p-10 text-center cursor-pointer bg-slate-50/50 hover:bg-slate-50 hover:border-primary/30 transition-all group"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => handleFileChange(event.target.files)}
          />
          <div className="text-4xl mb-4 group-hover:scale-110 transition-transform grayscale group-hover:grayscale-0">📸</div>
          <span className="text-xs font-black text-slate-700 uppercase tracking-tight">Drop technical assets here</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2">PNG, JPG, or WEBP · Max 10MB</span>
        </label>

        {files.length > 0 && (
          <div className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/5 p-3 rounded-xl border border-primary/10">
            Selected: {files.length} units ({files.map(f => f.name.slice(0, 10) + '...').join(', ')})
          </div>
        )}

        {error && <p className="text-[10px] font-bold text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
        {success && <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">{success}</p>}
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-100">
        <Button type="button" onClick={handleUpload} disabled={uploading || files.length === 0} className="font-black uppercase tracking-[0.2em] text-[10px] px-10 py-5 h-auto shadow-lg shadow-primary/20">
          {uploading ? 'Syncing...' : 'Upload to Vault'}
        </Button>
      </div>

      {inspectionId && images && images.length > 0 && (
        <div className="pt-6 border-t border-slate-100">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
            Vault Registry {selectedInspectionLabel ? `· ${selectedInspectionLabel}` : ''}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {images.map((image) => {
              const isOwner = profile?.id === image.uploader_id
              const isAdmin = profile?.role === 'admin'
              const canDelete = isOwner || isAdmin

              return (
                <div key={image.id} className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm group hover:shadow-md transition-all bg-white">
                  <div className="relative h-28 w-full bg-slate-100">
                    {image.signed_url ? (
                      <img src={image.signed_url} alt={image.caption || 'Technical photo'} className="h-full w-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all" />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Preview_Offline
                      </div>
                    )}
                    
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(image.id, image.storage_path)}
                        disabled={deletingId === image.id}
                        className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-red-500 hover:text-white rounded-lg shadow-sm transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        title="Purge Asset"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="px-3 py-2 flex flex-col gap-0.5 bg-white">
                    <div className="text-[9px] font-black text-slate-700 truncate uppercase tracking-tighter">
                      {image.caption || 'UNNAMED_ASSET'}
                    </div>
                    <div className="text-[7px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                      <span>Node: {image.uploader_name}</span>
                      <span>{new Date(image.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
