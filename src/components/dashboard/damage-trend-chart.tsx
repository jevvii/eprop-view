'use client'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { ChartOptions } from 'chart.js'
import { useDamageTrends } from '@/app/lib/queries'
import { useMediaQuery } from '@/components/shared/use-media-query'
import type { DamageTrend } from '@/app/types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

interface DamageTrendChartProps {
  isFloating?: boolean
  className?: string
}

const SEVERITIES: { key: DamageTrend['severity']; label: string; color: string }[] = [
  { key: 'critical', label: 'Critical', color: '#B91C1C' },
  { key: 'high', label: 'High', color: '#C2410C' },
  { key: 'moderate', label: 'Moderate', color: '#B45309' },
  { key: 'low', label: 'Low', color: '#047857' },
]

function monthLabel(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(date)
}

export function DamageTrendChart({ isFloating = false, className = '' }: DamageTrendChartProps) {
  const { data: trends, isLoading, isError, refetch } = useDamageTrends()
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const bgStyle = isFloating ? 'bg-white/95 backdrop-blur-md' : 'bg-white'
  const shell = `${bgStyle} p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200/70 h-full flex flex-col ${className}`

  if (isLoading) {
    return <div className={`${shell} animate-pulse`} aria-busy="true" aria-label="Loading damage trend" />
  }

  if (isError) {
    return (
      <div className={shell} role="alert">
        <h3 className="text-sm font-bold text-slate-900">Damage severity trend</h3>
        <p className="mt-1 text-sm text-red-700">Unable to load trend data.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 self-start rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 min-h-[36px]"
        >
          Retry
        </button>
      </div>
    )
  }

  const rows = trends ?? []
  const dates = Array.from(new Set(rows.map((t) => t.date))).sort()
  const labels = dates.map(monthLabel)

  if (rows.length === 0 || dates.length === 0) {
    return (
      <div className={shell}>
        <h3 className="text-sm font-bold text-slate-900">Damage severity trend</h3>
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-sm font-medium text-slate-700">No trend data yet</p>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Trends appear after inspections are recorded for a project.
          </p>
        </div>
      </div>
    )
  }

  const chartData = {
    labels,
    datasets: SEVERITIES.map((severity) => ({
      label: severity.label,
      data: dates.map((date) => {
        const entries = rows.filter((t) => t.date === date && t.severity === severity.key)
        if (entries.length === 0) return null
        return entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length
      }),
      borderColor: severity.color,
      backgroundColor: severity.color,
      tension: 0.35,
      spanGaps: true,
    })),
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion ? false : { duration: 350 },
    scales: {
      y: { min: 0, max: 10, grid: { color: 'rgba(226, 232, 240, 0.6)' } },
      x: { grid: { display: false } },
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          font: { size: 11, weight: 600 },
          boxWidth: 12,
          usePointStyle: true,
          padding: 14,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label ?? ''}: ${context.parsed.y ?? '—'}`,
        },
      },
    },
  }

  return (
    <div className={shell}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900">Damage severity trend</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Average recorded severity per month ({rows.length} entr{rows.length === 1 ? 'y' : 'ies'}).
        </p>
      </div>
      <div className="min-h-[180px] flex-1">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}
