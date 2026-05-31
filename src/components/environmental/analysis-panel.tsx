'use client'

import { useEffect, useState } from 'react'
import { useEnvironmentalRisk } from '@/app/lib/queries'
import { useUpsertEnvironmentalRisk } from '@/app/lib/mutations'
import { environmentalRiskSchema } from '@/app/lib/validators'
import { RiskScore } from '@/components/shared/risk-score'
import { Button } from '@/components/ui/button'

type AnalysisPanelProps = {
  projectId: string
}

const faultLineOptions = ['none', 'low', 'moderate', 'high', 'very_high'] as const
const liquefactionOptions = ['none', 'zone_a', 'zone_b', 'zone_c'] as const
const erosionOptions = ['negligible', 'low', 'moderate', 'severe'] as const

export function AnalysisPanel({ projectId }: AnalysisPanelProps) {
  const { data: risk, isLoading, isError } = useEnvironmentalRisk(projectId)
  const upsertRisk = useUpsertEnvironmentalRisk()

  const [faultLine, setFaultLine] = useState<(typeof faultLineOptions)[number]>('none')
  const [liquefaction, setLiquefaction] = useState<(typeof liquefactionOptions)[number]>('zone_c')
  const [erosion, setErosion] = useState<(typeof erosionOptions)[number]>('low')
  const [overallScore, setOverallScore] = useState('0')
  const [analysis, setAnalysis] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!risk) return
    setFaultLine(risk.fault_line_proximity)
    setLiquefaction(risk.soil_liquefaction_risk)
    setErosion(risk.erosion_potential)
    setOverallScore(String(risk.overall_risk_score ?? 0))
    setAnalysis(risk.additional_analysis ?? '')
  }, [risk])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const parsed = environmentalRiskSchema.safeParse({
      fault_line_proximity: faultLine,
      soil_liquefaction_risk: liquefaction,
      erosion_potential: erosion,
      overall_risk_score: overallScore,
      additional_analysis: analysis,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form inputs.')
      return
    }

    try {
      await upsertRisk.mutateAsync({
        project_id: projectId,
        ...parsed.data,
        assessed_date: new Date().toISOString().slice(0, 10),
      })
      setSuccess('Environmental risk profile updated.')
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to update risk profile.')
    }
  }

  if (isLoading) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-72 animate-pulse" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load environmental analysis
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8 flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-8">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Suitability Analysis</h3>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            Last Telemetry: {risk?.assessed_date ? new Date(risk.assessed_date).toLocaleDateString() : 'INITIAL_SCAN'}
          </p>
        </div>
        <RiskScore score={Number(overallScore)} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 flex-1">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Fault Proximity</label>
            <select
              value={faultLine}
              onChange={(event) => setFaultLine(event.target.value as (typeof faultLineOptions)[number])}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {faultLineOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase().replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Liquefaction Risk</label>
            <select
              value={liquefaction}
              onChange={(event) => setLiquefaction(event.target.value as (typeof liquefactionOptions)[number])}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {liquefactionOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Erosion Potential</label>
            <select
              value={erosion}
              onChange={(event) => setErosion(event.target.value as (typeof erosionOptions)[number])}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {erosionOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Suitability Score</label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={overallScore}
              onChange={(event) => setOverallScore(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="h-full flex flex-col">
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Detailed Analysis</label>
          <textarea
            value={analysis}
            onChange={(event) => setAnalysis(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[10px] font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all flex-1 min-h-[120px] resize-none"
            placeholder="SYSTEM_ALERT: Provide geohazard risk mitigation notes..."
          />
        </div>
      </div>

      {error && <p className="text-[10px] font-bold text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
      {success && <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">{success}</p>}

      <div className="flex justify-end pt-4 border-t border-slate-100">
        <Button type="submit" disabled={upsertRisk.isPending} className="font-black uppercase tracking-[0.2em] text-[10px] px-10 py-5 h-auto">
          {upsertRisk.isPending ? 'Syncing...' : 'Sync Assessment'}
        </Button>
      </div>
    </form>
  )
}
