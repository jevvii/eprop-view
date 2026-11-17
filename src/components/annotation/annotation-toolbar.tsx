'use client'

import { Square, Hexagon, Ruler, MousePointer2, Undo2, Trash2, Sparkles } from 'lucide-react'
import type { AnnotationTool } from './annotation-canvas'

const TOOLS: { id: AnnotationTool; label: string; icon: typeof Square; key: string }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, key: '1' },
  { id: 'box', label: 'Box', icon: Square, key: '2' },
  { id: 'polygon', label: 'Polygon', icon: Hexagon, key: '3' },
  { id: 'ruler', label: 'Ruler', icon: Ruler, key: '4' },
]

export function AnnotationToolbar({
  tool,
  onTool,
  onUndo,
  canUndo,
  onDelete,
  canDelete,
  onSuggest,
  suggesting,
}: {
  tool: AnnotationTool
  onTool: (tool: AnnotationTool) => void
  onUndo: () => void
  canUndo: boolean
  onDelete: () => void
  canDelete: boolean
  onSuggest: () => void
  suggesting: boolean
}) {
  const buttonClass = (active: boolean) =>
    `inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors ${
      active
        ? 'border-primary/40 bg-primary/10 text-primary'
        : 'border-[#EAEAEA] bg-white text-slate-600 hover:bg-slate-50'
    }`

  return (
    <div className="flex flex-wrap items-center gap-2">
      {TOOLS.map(({ id, label, icon: Icon, key }) => (
        <button
          key={id}
          type="button"
          aria-pressed={tool === id}
          title={`${label} (${key})`}
          className={buttonClass(tool === id)}
          onClick={() => onTool(id)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}

      <span className="mx-1 h-6 w-px bg-[#EAEAEA]" aria-hidden="true" />

      <button type="button" className={buttonClass(false)} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Undo</span>
      </button>

      <button type="button" className={buttonClass(false)} onClick={onDelete} disabled={!canDelete} title="Delete (Del)">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Delete</span>
      </button>

      <button type="button" className={buttonClass(false)} onClick={onSuggest} disabled={suggesting}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{suggesting ? 'Suggesting…' : 'Suggest'}</span>
      </button>
    </div>
  )
}
