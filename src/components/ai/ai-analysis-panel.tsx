'use client'

import { useAIModels, useAIDetections, useAIAnalysisJobs } from '@/app/lib/queries'
import { useRunAIAnalysis } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'
import { DetectionList } from './detection-list'
import { SeverityBadge } from './severity-badge'

interface AIAnalysisPanelProps {
  imageId: string
}

export function AIAnalysisPanel({ imageId }: AIAnalysisPanelProps) {
  const { data: models, isLoading: modelsLoading } = useAIModels()
  const { data: detections, isLoading: detectionsLoading } = useAIDetections(imageId)
  const { data: jobs, isLoading: jobsLoading } = useAIAnalysisJobs(imageId)
  const runAnalysis = useRunAIAnalysis()

  const activeModel = models?.find((model) => model.is_active) ?? models?.[0]
  const latestJob = jobs?.[0]
  const isRunning = latestJob?.status === 'running' || latestJob?.status === 'pending'

  const handleRun = () => {
    if (!activeModel) return
    runAnalysis.mutate({ imageId, modelId: activeModel.id })
  }

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
          <h3 className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase">AI Analysis</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {activeModel ? `Model: ${activeModel.name}` : 'No AI models registered'}
          </p>
        </div>
        {isRunning && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleRun}
          disabled={!activeModel || isRunning || runAnalysis.isPending}
          className="text-[9px] font-black uppercase tracking-[0.2em] px-5 py-3 h-auto"
        >
          {isRunning ? 'Analyzing…' : runAnalysis.isPending ? 'Starting…' : 'Run AI Analysis'}
        </Button>
        {detections && detections.length > 0 && (
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
            {detections.length} detection{detections.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {latestJob?.status === 'failed' && (
        <p className="text-[9px] font-black text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 uppercase tracking-wider">
          {latestJob.error_message || 'AI analysis failed'}
        </p>
      )}

      {detections && detections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Severity Summary</span>
            {detections.map((d) => (
              <SeverityBadge key={d.id} severity={d.severity} />
            ))}
          </div>
          <DetectionList detections={detections} />
        </div>
      )}
    </div>
  )
}
