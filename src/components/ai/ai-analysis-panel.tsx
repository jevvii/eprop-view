'use client'

import { useState } from 'react'
import { useAIModels, useAIDetections, useAIAnalysisJobs, useProfile } from '@/app/lib/queries'
import { useRunAIAnalysis } from '@/app/lib/mutations'
import { hasCapability } from '@/app/lib/role-utils'
import { Button } from '@/components/ui/button'
import { DetectionList } from './detection-list'
import { SeverityBadge } from './severity-badge'
import { computeFinalDamageScore, scoreToRiskLevel } from '@/app/lib/damage-score'

interface AIAnalysisPanelProps {
  imageId: string
}

export function AIAnalysisPanel({ imageId }: AIAnalysisPanelProps) {
  const { data: profile } = useProfile()
  const { data: models, isLoading: modelsLoading } = useAIModels()
  const { data: detections, isLoading: detectionsLoading } = useAIDetections(imageId)
  const { data: jobs, isLoading: jobsLoading } = useAIAnalysisJobs(imageId)
  const runAnalysis = useRunAIAnalysis()

  const [selectedModelId, setSelectedModelId] = useState<string>('')

  const canTriggerAI = hasCapability(profile?.role, 'ai:trigger')

  const activeModel = selectedModelId
    ? models?.find((m) => m.id === selectedModelId)
    : models?.find((model) => model.is_active) ?? models?.[0]

  const latestJob = jobs?.[0]
  const isRunning = latestJob?.status === 'running' || latestJob?.status === 'pending' || runAnalysis.isPending

  const handleRun = () => {
    if (!activeModel) return
    runAnalysis.mutate({ imageId, modelId: activeModel.id })
  }

  // Calculate aggregate damage score if detections exist
  const damageScore = detections && detections.length > 0
    ? computeFinalDamageScore(Math.max(...detections.map((d) => d.severity_score)), 1.2, 1.0, 1.0)
    : null

  const riskLevel = damageScore !== null ? scoreToRiskLevel(damageScore) : null

  if (modelsLoading || detectionsLoading || jobsLoading) {
    return (
      <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 animate-pulse h-48">
        <div className="h-4 bg-slate-100 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-slate-100 rounded w-1/2"></div>
      </div>
    )
  }

  return (
    <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">AI Structural Diagnostics</h3>
            {activeModel && (
              <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                {activeModel.format === 'heuristic' || activeModel.format === 'mock'
                  ? 'Heuristic (non-ML)'
                  : activeModel.format}
              </span>
            )}
            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 tabular-nums">
              {activeModel?.input_width || 640}×{activeModel?.input_height || 640}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium tracking-wide mt-0.5">
            {activeModel ? `Active Checkpoint: ${activeModel.name} (v${activeModel.version})` : 'No active AI models registered'}
          </p>
        </div>
        {isRunning ? (
          <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Inference Active</span>
          </div>
        ) : latestJob?.completed_at ? (
          <div className="text-right">
            <span className="text-xs font-mono text-slate-500 font-medium">
              Completed {new Date(latestJob.completed_at).toLocaleTimeString()}
            </span>
          </div>
        ) : null}
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-primary animate-spin" aria-hidden="true" />
          <span>Running heuristic analysis…</span>
        </div>
      )}

      {/* Model Selection and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        {canTriggerAI ? (
          <>
            {models && models.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Model</label>
                <select
                  value={activeModel?.id ?? ''}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="text-base sm:text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.format.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={handleRun}
                disabled={!activeModel?.is_active || isRunning}
                className="text-xs font-bold uppercase tracking-wider px-5 py-2.5 min-h-[44px] shadow-md shadow-primary/10"
              >
                {isRunning ? 'Analyzing Image…' : detections && detections.length > 0 ? 'Re-Run Analysis' : 'Run AI Analysis'}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100">
            <span className="text-base" aria-hidden="true">🧑‍🔬</span>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Review & Validation Mode
            </span>
          </div>
        )}

        {damageScore !== null && (
          <div className="flex flex-col gap-1">
            <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Impact Score:</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">{damageScore.toFixed(1)}/10</span>
              {riskLevel && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                  riskLevel === 'critical' ? 'bg-red-100 text-red-700 border border-red-200' :
                  riskLevel === 'high' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                  riskLevel === 'moderate' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                }`}>
                  {riskLevel}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-medium italic">
              Score uses default structural (1.2×), exposure (1.0×), and location factors.
            </p>
          </div>
        )}
      </div>

      {latestJob?.status === 'failed' && (
        <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 uppercase tracking-wide">
          {latestJob.error_message || 'AI analysis inference failed'}
        </p>
      )}

      {runAnalysis.isError && (
        <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 uppercase tracking-wide">
          {runAnalysis.error instanceof Error ? runAnalysis.error.message : 'Analysis request failed'}
        </p>
      )}

      {detections && detections.length > 0 ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Identified Defects ({detections.length})
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {detections.map((d) => (
                <SeverityBadge key={d.id} severity={d.severity} />
              ))}
            </div>
          </div>
          <DetectionList detections={detections} />
        </div>
      ) : (
        <div className="text-xs text-slate-500 font-medium border-t border-slate-100 pt-4">
          {latestJob?.status === 'completed'
            ? 'No defect patterns detected in this image by the heuristic.'
            : 'Not analyzed yet. Run analysis to inspect this image.'}
        </div>
      )}
    </div>
  )
}
