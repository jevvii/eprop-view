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
    <div className="space-y-4 pt-4 border-t border-slate-200 mt-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-xs font-bold text-slate-700">Discussion Thread</div>
        <div className="h-[1px] flex-1 bg-slate-100" />
      </div>

      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
        {comments && comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">{comment.author_name}</span>
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/50">
                    {comment.author_role}
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-medium tabular-nums">
                  {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                {comment.content}
              </p>
            </div>
          ))
        ) : (
          <div className="text-xs text-slate-500 italic py-4 text-center font-medium">
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
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-base sm:text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 transition-all pr-12"
        />
        <button
          type="submit"
          disabled={!content.trim() || addComment.isPending}
          aria-label="Send observation"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-9 min-h-9 flex items-center justify-center text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.768 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </form>
    </div>
  )
}
