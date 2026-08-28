'use client'

import { useState } from 'react'
import { useAIModels, useAIDetections, useAIAnalysisJobs } from '@/app/lib/queries'
import { useRunAIAnalysis } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'
import { DetectionList } from './detection-list'
import { SeverityBadge } from './severity-badge'
import { computeFinalDamageScore, scoreToRiskLevel } from '@/app/lib/damage-score'

interface AIAnalysisPanelProps {
  imageId: string
}

export function AIAnalysisPanel({ imageId }: AIAnalysisPanelProps) {
  const { data: models, isLoading: modelsLoading } = useAIModels()
  const { data: detections, isLoading: detectionsLoading } = useAIDetections(imageId)
  const { data: jobs, isLoading: jobsLoading } = useAIAnalysisJobs(imageId)
  const runAnalysis = useRunAIAnalysis()

  const [selectedModelId, setSelectedModelId] = useState<string>('')

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
    <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-50 pb-4">
        <div>
          <h3 className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase">AI Structural Diagnostics</h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
            {activeModel ? `Active Checkpoint: ${activeModel.name} (v${activeModel.version})` : 'No AI models registered'}
          </p>
        </div>
        {isRunning && (
          <div className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">Inference Active</span>
          </div>
        )}
      </div>

      {/* Model Selection and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {models && models.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Model</label>
            <select
              value={activeModel?.id ?? ''}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="text-[10px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none"
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
            disabled={!activeModel || isRunning}
            className="text-[9px] font-black uppercase tracking-[0.2em] px-5 py-3 h-auto shadow-md shadow-primary/10"
          >
            {isRunning ? 'Analyzing Image…' : detections && detections.length > 0 ? 'Re-Run Analysis' : 'Run AI Analysis'}
          </Button>

          {damageScore !== null && (
            <div className="flex flex-col gap-1">
              <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 flex items-center gap-2">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Impact Score:</span>
                <span className="text-xs font-black text-black">{damageScore.toFixed(1)}/10</span>
                {riskLevel && (
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                    riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                    riskLevel === 'high' ? 'bg-orange-100 text-orange-700' :
                    riskLevel === 'moderate' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {riskLevel}
                  </span>
                )}
              </div>
              <p className="text-[8px] text-slate-400 font-medium italic">
                Score uses default structural (1.2×), exposure (1.0×), and location factors. Configurable weighting is a production follow-up.
              </p>
            </div>
          )}
        </div>
      </div>

      {latestJob?.status === 'failed' && (
        <p className="text-[9px] font-black text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 uppercase tracking-wider">
          {latestJob.error_message || 'AI analysis inference failed'}
        </p>
      )}

      {detections && detections.length > 0 ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between border-t border-slate-50 pt-4">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Identified Defects ({detections.length})
            </span>
            <div className="flex items-center gap-1.5">
              {detections.map((d) => (
                <SeverityBadge key={d.id} severity={d.severity} />
              ))}
            </div>
          </div>
          <DetectionList detections={detections} />
        </div>
      ) : (
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider border-t border-slate-50 pt-4">
          No automated detections recorded yet for this asset image.
        </div>
      )}
    </div>
  )
}
