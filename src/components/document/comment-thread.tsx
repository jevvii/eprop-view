'use client'

import { useState } from 'react'
import { useImageComments, useProfile } from '@/app/lib/queries'
import { useAddComment } from '@/app/lib/mutations'
import { StatusBadge } from '@/components/shared/status-badge'

interface CommentThreadProps {
  imageId: string
}

export function CommentThread({ imageId }: CommentThreadProps) {
  const { data: profile } = useProfile()
  const { data: comments, isLoading } = useImageComments(imageId)
  const addComment = useAddComment()
  const [content, setContent] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || addComment.isPending) return

    try {
      await addComment.mutateAsync({ imageId, content })
      setContent('')
    } catch (err) {
      console.error('Comment failure:', err)
    }
  }

  if (isLoading) return <div className="h-20 animate-pulse bg-slate-50 rounded-xl" />

  return (
    <div className="space-y-4 pt-4 border-t border-slate-50 mt-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Discussion Thread</div>
        <div className="h-[1px] flex-1 bg-slate-50" />
      </div>

      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
        {comments && comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-black uppercase tracking-tight">{comment.author_name}</span>
                  <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded">
                    {comment.author_role}
                  </span>
                </div>
                <span className="text-[7px] font-bold text-slate-300">
                  {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-[10px] text-slate-600 leading-relaxed font-medium bg-slate-50/50 p-2.5 rounded-xl border border-slate-100/50">
                {comment.content}
              </p>
            </div>
          ))
        ) : (
          <div className="text-[9px] font-bold text-slate-300 italic uppercase tracking-widest py-4 text-center">
            No technical observations recorded.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="relative mt-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Log observation..."
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all pr-12"
        />
        <button
          type="submit"
          disabled={!content.trim() || addComment.isPending}
          className="absolute right-2 top-1.5 p-1.5 text-primary hover:bg-primary/5 rounded-lg transition-colors disabled:opacity-30"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.768 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </form>
    </div>
  )
}
