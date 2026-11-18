'use client'

import { useState } from 'react'

export function ARUnsupportedNotice() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="bg-sky-50/90 border border-sky-200/80 p-4 rounded-lg flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        
        <div>
          <h4 className="text-xs font-black text-sky-950">
            Live image scanning active
          </h4>
          <p className="text-xs text-sky-800 font-medium mt-0.5 leading-relaxed">
            Running in live scanning mode with the device camera. Marker positions are screen-space estimates; frame capture and heuristic analysis are available.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-xs font-bold text-sky-600 hover:text-sky-800 p-1 rounded-lg"
        aria-label="Dismiss notice"
      >
        ×
      </button>
    </div>
  )
}
