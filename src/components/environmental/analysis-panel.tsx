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
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-wide">SITE SUITABILITY ANALYSIS</h3>
          <p className="text-xs text-slate-500">
            Last assessed: {risk?.assessed_date ? new Date(risk.assessed_date).toLocaleDateString() : 'Not yet assessed'}
          </p>
        </div>
        <RiskScore score={Number(overallScore)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Fault Line Proximity</label>
          <select
            value={faultLine}
            onChange={(event) => setFaultLine(event.target.value as (typeof faultLineOptions)[number])}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {faultLineOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Soil Liquefaction Risk</label>
          <select
            value={liquefaction}
            onChange={(event) => setLiquefaction(event.target.value as (typeof liquefactionOptions)[number])}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {liquefactionOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Erosion Potential</label>
          <select
            value={erosion}
            onChange={(event) => setErosion(event.target.value as (typeof erosionOptions)[number])}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {erosionOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Overall Risk Score</label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={overallScore}
            onChange={(event) => setOverallScore(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Additional Analysis</label>
        <textarea
          value={analysis}
          onChange={(event) => setAnalysis(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[120px]"
          placeholder="Provide detailed notes on geohazard risk mitigation..."
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={upsertRisk.isPending}>
          Save Assessment
        </Button>
      </div>
    </form>
  )
}
