'use client'

import { useInspectionImages, useProfile } from '@/app/lib/queries'
import { CommentThread } from './comment-thread'
import { AIAnalysisPanel } from '@/components/ai/ai-analysis-panel'
import { DamageOverlay } from '@/components/ai/damage-overlay'
import { useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'

import { deleteInspectionImage } from '@/app/actions/uploads'

interface AssetFeedProps {
  inspectionId: string
  label?: string | null
}

export function AssetFeed({ inspectionId, label }: AssetFeedProps) {
  const { data: profile } = useProfile()
  const { data: images, isPending, isError } = useInspectionImages(inspectionId || undefined)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const handleDelete = async (imageId: string, storagePath: string) => {
    if (!window.confirm('Permanent Deletion Protocol: Are you sure you want to remove this asset?')) return
    
    setDeletingId(imageId)

    try {
      await deleteInspectionImage(imageId, storagePath)
      queryClient.invalidateQueries({ queryKey: ['inspection-images', inspectionId] })
    } catch (err) {
      console.error('Delete error:', err)
      alert(err instanceof Error ? err.message : 'Deletion failed')
    } finally {
      setDeletingId(null)
    }
  }

  if (!inspectionId) {
    return (
      <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-2xl sm:rounded-3xl h-[450px] sm:h-[600px] flex items-center justify-center text-center p-6 sm:p-10">
        <div className="max-w-xs">
          <div className="text-4xl mb-4 grayscale opacity-30" aria-hidden="true">📂</div>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Registry Initialized</h3>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Select a technical inspection entry from the dropdown above to view the associated asset vault and discussion threads.
          </p>
        </div>
      </div>
    )
  }

  if (isPending && !images) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between px-2 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 rounded-full" />
          <div className="h-6 w-20 bg-slate-100 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:gap-8">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col lg:flex-row h-auto lg:h-[350px] animate-pulse">
              <div className="lg:w-1/2 bg-slate-100 h-64 lg:h-full flex items-center justify-center relative">
                <div className="text-4xl grayscale opacity-10">🎞️</div>
              </div>
              <div className="lg:w-1/2 p-5 sm:p-6 space-y-4 flex flex-col">
                <div className="h-4 w-28 bg-slate-200 rounded" />
                <div className="h-3 w-40 bg-slate-100 rounded" />
                <div className="h-20 w-full bg-slate-50 rounded-xl mt-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center">
        <div className="text-4xl mb-4 grayscale opacity-20" aria-hidden="true">📡</div>
        <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-2">Telemetry Failure</h3>
        <p className="text-xs text-red-600 font-medium">
          System was unable to synchronize with the asset vault. Ensure technical database migrations have been deployed.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">
          Vault Registry {label ? `· ${label}` : ''}
        </h3>
        <div className="px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-600 uppercase tracking-wider tabular-nums">
          {images?.length ?? 0} Assets
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:gap-8">
        {images && images.length > 0 ? (
          images.map((image) => {
            const isOwner = profile?.id === image.uploader_id
            const isAdmin = profile?.role === 'admin'
            const canDelete = isOwner || isAdmin

            return (
              <div key={image.id} className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
                <div className="flex flex-col lg:flex-row">
                  {/* Image Section */}
                  <div className="lg:w-1/2 relative h-[260px] sm:h-[350px] bg-slate-100 overflow-hidden">
                    {image.signed_url ? (
                      <div className="relative h-full w-full">
                        <img
                          src={image.signed_url}
                          alt={image.caption}
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        <DamageOverlay imageId={image.id} />
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 italic">
                        Preview_Unavailable
                      </div>
                    )}

                    <div className="absolute top-3 left-3">
                      <div className="bg-black/80 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 shadow-sm">
                        {image.caption || 'TECHNICAL_ASSET'}
                      </div>
                    </div>

                    {canDelete && (
                      <button
                        onClick={() => handleDelete(image.id, image.storage_path)}
                        disabled={deletingId === image.id}
                        aria-label="Delete asset"
                        className="absolute top-3 right-3 min-w-11 min-h-11 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-lg transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 active:scale-95 disabled:opacity-50 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Thread + AI Section */}
                  <div className="lg:w-1/2 p-5 sm:p-6 lg:p-8 flex flex-col gap-5 sm:gap-6 h-auto">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">Lead Node</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900">{image.uploader_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Timestamp</span>
                        <span className="text-xs text-slate-500 font-medium">{new Date(image.uploaded_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col min-h-[180px]">
                      <CommentThread imageId={image.id} />
                    </div>

                    <AIAnalysisPanel imageId={image.id} />
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="bg-white p-10 sm:p-16 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 text-center">
            <div className="text-4xl mb-4 opacity-20 grayscale" aria-hidden="true">🎞️</div>
            <p className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wider">No assets found in vault.</p>
          </div>
        )}
      </div>
    </div>
  )
}
