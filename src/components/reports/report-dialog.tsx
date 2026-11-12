'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Native modal supplies inert background, Escape, focus containment and return. */
export function ReportDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => { element?.close(); trigger?.focus() }
  }, [])
  return (
    <dialog ref={dialog} aria-label={title} onCancel={onClose} className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] rounded-lg border-0 bg-white p-5 sm:p-8 overscroll-contain backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm no-print">
      {children}
    </dialog>
  )
}
