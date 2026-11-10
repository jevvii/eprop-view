'use client'

import { useAIDetections } from '@/app/lib/queries'
import type { AIDamageDetection } from '@/app/types'
import { SeverityBadge } from './severity-badge'

const severityRing: Record<AIDamageDetection['severity'], string> = {
  low: 'ring-emerald-400/70',
  medium: 'ring-amber-400/70',
  high: 'ring-orange-400/70',
  critical: 'ring-red-500/80',
}

interface DamageOverlayProps {
  imageId: string
}

export function DamageOverlay({ imageId }: DamageOverlayProps) {
  const { data: detections = [] } = useAIDetections(imageId)

  if (detections.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none">
      {detections.map((detection) => {
        if (!detection.bbox) return null
        const { x, y, width, height } = detection.bbox

        return (
          <div
            key={detection.id}
            className={`absolute ring-2 ${severityRing[detection.severity]} bg-white/10 backdrop-blur-[1px] rounded-sm`}
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${width * 100}%`,
              height: `${height * 100}%`,
            }}
          >
            <div className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap shadow-sm">
              <SeverityBadge severity={detection.severity} />
              <span className="text-xs font-bold text-white bg-slate-900/90 px-2 py-0.5 rounded-md uppercase tracking-wide border border-white/15 tabular-nums">
                {detection.damage_type} {(detection.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
