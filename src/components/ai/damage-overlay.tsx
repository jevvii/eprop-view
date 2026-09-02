'use client'

import { useAIDetections } from '@/app/lib/queries'
import type { AIDamageDetection } from '@/app/types'
import { SeverityBadge } from './severity-badge'

const severityRing: Record<AIDamageDetection['severity'], string> = {
  low: 'ring-emerald-400/70',
  medium: 'ring-amber-400/70',
  high: 'ring-red-400/70',
  critical: 'ring-purple-400/70',
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
            <div className="absolute -top-5 left-0 flex items-center gap-1.5 whitespace-nowrap shadow-sm">
              <SeverityBadge severity={detection.severity} />
              <span className="text-[8px] font-black text-white bg-slate-900/90 px-1.5 py-0.5 rounded uppercase tracking-wider border border-white/10">
                {detection.damage_type} {(detection.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
