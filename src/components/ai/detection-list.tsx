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
        No AI detections recorded.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {detections.map((detection) => {
        const isVerified = Boolean(detection.verified_by)
        const isRejected = !isVerified && (
          detection.notes?.toLowerCase().includes('reject') ||
          detection.notes?.toLowerCase().includes('false positive')
        )

        return (
          <div
            key={detection.id}
            className={`border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
              isVerified
                ? 'bg-emerald-50/40 border-emerald-100'
                : isRejected
                ? 'bg-slate-100/60 border-slate-200 opacity-75'
                : 'bg-slate-50 border-slate-100'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                  {detection.damage_type}
                </span>
                <SeverityBadge severity={detection.severity} />
                {isVerified && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase tracking-wider border border-emerald-200">
                    ✓ Verified
                  </span>
                )}
                {isRejected && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[8px] font-black uppercase tracking-wider border border-slate-300">
                    ✗ False Positive
                  </span>
                )}
              </div>
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2">
                <span>Confidence {(detection.confidence * 100).toFixed(1)}%</span>
                <span>·</span>
                <span>Score {detection.severity_score}/100</span>
                {detection.notes && (
                  <>
                    <span>·</span>
                    <span className="text-slate-400 normal-case italic">{detection.notes}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {!isVerified && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={verify.isPending}
                  onClick={() =>
                    verify.mutate({
                      detectionId: detection.id,
                      approved: true,
                      notes: 'Verified by inspector.',
                    })
                  }
                  className="text-[9px] font-black uppercase tracking-wider h-auto py-1.5 px-3 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
                >
                  {isRejected ? 'Re-Verify' : 'Verify'}
                </Button>
              )}

              {isVerified && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={verify.isPending}
                  onClick={() =>
                    verify.mutate({
                      detectionId: detection.id,
                      approved: false,
                      notes: 'Rejected: Marked as false positive by inspector.',
                    })
                  }
                  className="text-[9px] font-black uppercase tracking-wider h-auto py-1.5 px-3 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
                >
                  Reject
                </Button>
              )}

              {!isVerified && !isRejected && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={verify.isPending}
                  onClick={() =>
                    verify.mutate({
                      detectionId: detection.id,
                      approved: false,
                      notes: 'Rejected: Marked as false positive.',
                    })
                  }
                  className="text-[9px] font-black uppercase tracking-wider h-auto py-1.5 px-3 bg-white hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  Reject
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
