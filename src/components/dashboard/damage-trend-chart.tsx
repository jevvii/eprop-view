'use client'

import { useDamageTrends } from '@/app/lib/queries'
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export function DamageTrendChart() {
  const { data: trends, isLoading } = useDamageTrends()

  if (isLoading) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-64 animate-pulse" />
  }

  const dates = [...new Set(trends?.map((t) => t.date) || [])].sort()
  const severities = ['critical', 'high', 'moderate', 'low'] as const
  const colors = { critical: '#dc2626', high: '#f97316', moderate: '#f59e0b', low: '#22c55e' }

  const datasets = severities.map((sev) => ({
    label: sev.toUpperCase(),
    data: dates.map((date) => {
      const point = trends?.find((t) => t.date === date && t.severity === sev)
      return point?.value ?? null
    }),
    borderColor: colors[sev],
    backgroundColor: colors[sev],
    tension: 0.3,
    pointRadius: 4,
    pointBorderWidth: 2,
    pointBackgroundColor: colors[sev],
    pointBorderColor: '#fff',
  }))

  const chartData = {
    labels: dates.map((d) => new Date(d).toLocaleDateString('en-US', { month: 'short' })),
    datasets,
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 10, grid: { color: '#e2e8f0' } },
      x: { grid: { display: false } },
    },
    plugins: {
      legend: { position: 'top' as const, align: 'end' as const },
    },
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg">
      <h3 className="text-sm font-bold text-slate-900 mb-4 tracking-wide">DAMAGE SEVERITY TREND</h3>
      <div className="h-52">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}
