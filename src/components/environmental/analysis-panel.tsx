'use client'

import { useEffect, useState } from 'react'
import { useEnvironmentalRisk, useProfile } from '@/app/lib/queries'
import { useUpsertEnvironmentalRisk } from '@/app/lib/mutations'
import { hasCapability } from '@/app/lib/role-utils'
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
  const { data: profile } = useProfile()
  const { data: risk, isLoading, isError } = useEnvironmentalRisk(projectId)
  const upsertRisk = useUpsertEnvironmentalRisk()

  const canAssess = hasCapability(profile?.role, 'envrisk:assess')

  const [faultLine, setFaultLine] = useState<(typeof faultLineOptions)[number]>('none')
  const [liquefaction, setLiquefaction] = useState<(typeof liquefactionOptions)[number]>('zone_c')
  const [erosion, setErosion] = useState<(typeof erosionOptions)[number]>('low')
  const [overallScore, setOverallScore] = useState('0')
  const [analysis, setAnalysis] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isAutoCalculating, setIsAutoCalculating] = useState(false)

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
    if (!canAssess) {
      setError('Engineering or Admin authorization required to modify geohazard risk assessment.')
      return
    }
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
      setError(parsed.error.issues[0]?.message ?? 'INVALID_INPUT')
      return
    }

    try {
      await upsertRisk.mutateAsync({
        project_id: projectId,
        fault_line_proximity: parsed.data.fault_line_proximity,
        soil_liquefaction_risk: parsed.data.soil_liquefaction_risk,
        erosion_potential: parsed.data.erosion_potential,
        overall_risk_score: parsed.data.overall_risk_score,
        additional_analysis: parsed.data.additional_analysis,
        assessed_date: new Date().toISOString(),
      })
      setSuccess('SYNC_COMPLETE')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SYNC_FAILED')
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

  const handleAutoCalculate = async () => {
    if (!canAssess) return
    setIsAutoCalculating(true)
    setError(null)
    setSuccess(null)
    try {
      const { calculateAndApplyProjectRisk } = await import('@/app/actions/environmental')
      const updated = await calculateAndApplyProjectRisk(projectId)
      setFaultLine(updated.fault_line_proximity)
      setLiquefaction(updated.soil_liquefaction_risk)
      setErosion(updated.erosion_potential)
      setOverallScore(String(updated.overall_risk_score ?? 0))
      setAnalysis(updated.additional_analysis ?? '')
      setSuccess('AUTO_SYNTHESIS_COMPLETE: GIS layers synthesized and score calibrated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GIS calculation failed')
    } finally {
      setIsAutoCalculating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 space-y-6 flex flex-col h-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">Suitability Analysis</h3>
            {canAssess && (
              <button
                type="button"
                onClick={handleAutoCalculate}
                disabled={isAutoCalculating}
                className="text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary hover:text-white px-3 py-1.5 rounded-lg transition-colors border border-primary/20 min-h-[36px]"
              >
                {isAutoCalculating ? 'Analyzing GIS…' : 'Auto-calculate from GIS'}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium tracking-wide mt-1">
            Last Telemetry: {risk?.assessed_date ? new Date(risk.assessed_date).toLocaleDateString() : 'INITIAL_SCAN'}
          </p>
        </div>
        <RiskScore score={Number(overallScore)} />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 flex-1">
        <div className="space-y-4">
          <div>
            <label htmlFor="env-fault" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 ml-1">Fault Proximity</label>
            <select id="env-fault"
              value={faultLine}
              disabled={!canAssess}
              onChange={(event) => setFaultLine(event.target.value as (typeof faultLineOptions)[number])}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {faultLineOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase().replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="env-liquefaction" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 ml-1">Liquefaction Risk</label>
            <select id="env-liquefaction"
              value={liquefaction}
              disabled={!canAssess}
              onChange={(event) => setLiquefaction(event.target.value as (typeof liquefactionOptions)[number])}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {liquefactionOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="env-erosion" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 ml-1">Erosion Potential</label>
            <select id="env-erosion"
              value={erosion}
              disabled={!canAssess}
              onChange={(event) => setErosion(event.target.value as (typeof erosionOptions)[number])}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {erosionOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="env-score" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 ml-1">Suitability Score</label>
            <input id="env-score"
              type="number"
              min="0"
              max="10"
              step="0.1"
              disabled={!canAssess}
              value={overallScore}
              onChange={(event) => setOverallScore(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed tabular-nums"
            />
          </div>
        </div>

        <div className="h-full flex flex-col">
          <label htmlFor="env-analysis" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 ml-1">Detailed Analysis</label>
          <textarea id="env-analysis"
            value={analysis}
            disabled={!canAssess}
            onChange={(event) => setAnalysis(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-base sm:text-sm font-medium bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all flex-1 min-h-[140px] resize-none disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder="Provide geohazard risk mitigation notes..."
          />
        </div>
      </div>

      {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
      {success && <p className="text-xs font-bold text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100">{success}</p>}

      <div className="flex justify-end pt-4 border-t border-slate-100">
        {canAssess ? (
          <Button type="submit" disabled={upsertRisk.isPending} className="font-bold uppercase tracking-wider text-xs px-8 min-h-[44px]">
            {upsertRisk.isPending ? 'Syncing...' : 'Sync Assessment'}
          </Button>
        ) : (
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide py-2">
            Read-Only Geohazard Telemetry (Engineering Required to Edit)
          </span>
        )}
      </div>
    </form>
  )
}
