'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/app/lib/supabase/client'
import { useInspectionImages, useInspections } from '@/app/lib/queries'
import { Button } from '@/components/ui/button'

export function ImageUpload() {
  const { data: inspections } = useInspections()
  const [inspectionId, setInspectionId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
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

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900 tracking-wide">INSPECTION IMAGE UPLOAD</h3>
        <p className="text-xs text-slate-500">
          Upload site photos to the secure inspection-images bucket.
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Inspection</label>
        <select
          value={inspectionId}
          onChange={(event) => setInspectionId(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Select an inspection</option>
          {inspections?.map((inspection) => (
            <option key={inspection.id} value={inspection.id}>
              {new Date(inspection.inspection_date).toLocaleDateString()} · {inspection.location}
            </option>
          ))}
        </select>
      </div>

      <label
        className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500 cursor-pointer hover:border-blue-300 transition-colors"
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
        <span className="font-medium text-slate-700">Drop images here or click to browse</span>
        <span className="text-xs text-slate-400 mt-1">PNG, JPG, or WEBP · Max 10MB each</span>
      </label>

      {files.length > 0 && (
        <div className="text-xs text-slate-500">
          Selected files: {files.map((file) => file.name).join(', ')}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}

      <div className="flex justify-end">
        <Button type="button" onClick={handleUpload} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload Images'}
        </Button>
      </div>

      {inspectionId && (
        <div className="pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-600 mb-2">
            Uploaded images {selectedInspectionLabel ? `· ${selectedInspectionLabel}` : ''}
          </div>
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : images && images.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {images.map((image) => (
                <div key={image.id} className="rounded-xl border border-slate-200 overflow-hidden">
                  {image.signed_url ? (
                    <img src={image.signed_url} alt={image.caption || 'Inspection photo'} className="h-28 w-full object-cover" />
                  ) : (
                    <div className="h-28 flex items-center justify-center text-xs text-slate-400">
                      Preview unavailable
                    </div>
                  )}
                  <div className="px-2 py-1 text-[11px] text-slate-500 truncate">
                    {image.caption || image.storage_path}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No images uploaded yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
