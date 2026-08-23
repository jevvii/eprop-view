'use client'

import type { AIDamageDetection } from '@/app/types'
import { SeverityBadge } from './severity-badge'
import { useVerifyDetection } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'

interface DetectionListProps {
  detections: AIDamageDetection[]
}

export function DetectionList({ detections }: DetectionListProps) {
  const verify = useVerifyDetection()

  if (detections.length === 0) {
    return (
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
        No AI detections yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {detections.map((detection) => (
        <div
          key={detection.id}
          className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                {detection.damage_type}
              </span>
              <SeverityBadge severity={detection.severity} />
            </div>
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
              Confidence {(detection.confidence * 100).toFixed(1)}% · Score {detection.severity_score}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={verify.isPending || !!detection.verified_by}
              onClick={() => verify.mutate({ detectionId: detection.id, approved: true })}
              className="text-[9px] font-black uppercase tracking-wider h-auto py-1.5 px-3"
            >
              {detection.verified_by ? 'Verified' : 'Verify'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
