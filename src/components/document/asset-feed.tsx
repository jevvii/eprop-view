'use client'

import { useInspectionImages, useProfile } from '@/app/lib/queries'
import { CommentThread } from './comment-thread'
import { useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'

interface AssetFeedProps {
  inspectionId: string
  label?: string | null
}

export function AssetFeed({ inspectionId, label }: AssetFeedProps) {
  const { data: profile } = useProfile()
  const { data: images, isLoading } = useInspectionImages(inspectionId || undefined)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const handleDelete = async (imageId: string, storagePath: string) => {
    if (!window.confirm('Permanent Deletion Protocol: Are you sure you want to remove this asset?')) return
    
    setDeletingId(imageId)
    const supabase = createClient()

    try {
      await supabase.storage.from('inspection-images').remove([storagePath])
      await supabase.from('inspection_images').delete().eq('id', imageId)
      queryClient.invalidateQueries({ queryKey: ['inspection-images', inspectionId] })
    } catch (err) {
      console.error('Delete error:', err)
    } finally {
      setDeletingId(null)
    }
  }

  if (!inspectionId) {
    return (
      <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-[2.5rem] h-[600px] flex items-center justify-center text-center p-10">
        <div className="max-w-xs">
          <div className="text-4xl mb-4 grayscale opacity-30">📂</div>
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Registry Initialized</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed tracking-wider">
            Select a technical inspection entry from the sidebar to view the associated asset vault and discussion threads.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <div className="space-y-6 h-[600px] animate-pulse bg-white rounded-[2.5rem] border border-slate-100" />
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between px-4">
        <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase">
          Vault Registry {label ? `· ${label}` : ''}
        </h3>
        <div className="px-3 py-1 bg-slate-100 rounded-full text-[9px] font-black text-slate-500 uppercase tracking-widest">
          {images?.length ?? 0} Assets
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {images && images.length > 0 ? (
          images.map((image) => {
            const isOwner = profile?.id === image.uploader_id
            const isAdmin = profile?.role === 'admin'
            const canDelete = isOwner || isAdmin

            return (
              <div key={image.id} className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
                <div className="flex flex-col lg:flex-row">
                  {/* Image Section */}
                  <div className="lg:w-1/2 relative h-[350px] bg-slate-100 overflow-hidden">
                    {image.signed_url ? (
                      <img 
                        src={image.signed_url} 
                        alt={image.caption} 
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" 
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 italic">
                        Preview_Unavailable
                      </div>
                    )}
                    
                    <div className="absolute top-4 left-4">
                      <div className="bg-black/80 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/10">
                        {image.caption || 'TECHNICAL_ASSET'}
                      </div>
                    </div>

                    {canDelete && (
                      <button
                        onClick={() => handleDelete(image.id, image.storage_path)}
                        disabled={deletingId === image.id}
                        className="absolute top-4 right-4 p-2.5 bg-red-500 text-white rounded-xl shadow-lg transition-all opacity-0 group-hover:opacity-100 hover:bg-red-600 active:scale-95 disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Thread Section */}
                  <div className="lg:w-1/2 p-8 flex flex-col h-[350px] lg:h-auto">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">Lead Node</span>
                        <span className="text-xs font-bold text-black">{image.uploader_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Timestamp</span>
                        <span className="text-[10px] font-bold text-slate-500">{new Date(image.uploaded_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col">
                      <CommentThread imageId={image.id} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="bg-white p-20 rounded-[2.5rem] shadow-xl border border-slate-100 text-center">
            <div className="text-4xl mb-4 opacity-20 grayscale">🎞️</div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No assets found in vault.</p>
          </div>
        )}
      </div>
    </div>
  )
}
