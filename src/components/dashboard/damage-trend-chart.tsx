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
import { useDamageTrends, useAllAIDetections } from '@/app/lib/queries'
import { useMemo } from 'react'

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

export function DamageTrendChart({ isFloating = false, className = '' }: DamageTrendChartProps) {
  const { data: trends, isLoading, isError } = useDamageTrends()
  const { data: aiDetections = [] } = useAllAIDetections()

  const aiStats = useMemo(() => {
    const counts = {
      crack: 0,
      corrosion: 0,
      spalling: 0,
      leakage: 0,
      deformation: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    (aiDetections || []).forEach((d) => {
      if (d?.damage_type && d.damage_type in counts) {
        counts[d.damage_type as keyof typeof counts] += 1
      }
      if (d?.severity && d.severity in counts) {
        counts[d.severity as keyof typeof counts] += 1
      }
    })
    return counts
  }, [aiDetections])

  if (isLoading) {
    return (
      <div className={`bg-white p-6 rounded-[2rem] shadow-xl animate-pulse h-64 ${className}`} />
    )
  }

  if (isError) {
    return (
      <div className={`bg-white p-6 rounded-[2rem] shadow-xl text-red-600 font-black uppercase tracking-widest ${className}`}>
        Trend Telemetry Offline
      </div>
    )
  }

  const chartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May (Live AI)'],
    datasets: [
      {
        label: 'CRITICAL',
        data: trends?.filter((t) => t.severity === 'critical').map((t) => t.value) || [
          8.5,
          8.2,
          7.5,
          6.8,
          aiStats.critical > 0 ? Math.min(10, 6.5 + aiStats.critical * 0.4) : 6.5,
        ],
        borderColor: '#ef4444',
        backgroundColor: '#ef4444',
        tension: 0.4,
      },
      {
        label: 'HIGH',
        data: trends?.filter((t) => t.severity === 'high').map((t) => t.value) || [
          5.2,
          5.0,
          4.8,
          4.5,
          aiStats.high > 0 ? Math.min(10, 4.2 + aiStats.high * 0.3) : 4.2,
        ],
        borderColor: '#f97316',
        backgroundColor: '#f97316',
        tension: 0.4,
      },
      {
        label: 'MODERATE',
        data: trends?.filter((t) => t.severity === 'moderate').map((t) => t.value) || [
          3.8,
          3.6,
          3.4,
          3.2,
          aiStats.medium > 0 ? Math.min(10, 3.0 + aiStats.medium * 0.2) : 3.0,
        ],
        borderColor: '#fbbf24',
        backgroundColor: '#fbbf24',
        tension: 0.4,
      },
      {
        label: 'LOW',
        data: trends?.filter((t) => t.severity === 'low').map((t) => t.value) || [
          2.1,
          2.3,
          2.0,
          1.8,
          aiStats.low > 0 ? Math.min(10, 1.6 + aiStats.low * 0.1) : 1.6,
        ],
        borderColor: '#10b981',
        backgroundColor: '#10b981',
        tension: 0.4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 10, grid: { color: 'rgba(226, 232, 240, 0.5)' } },
      x: { grid: { display: false } },
    },
    plugins: {
      legend: { 
        position: 'top' as const, 
        align: 'end' as const,
        labels: {
          font: { size: 10, weight: 'bold' as any },
          boxWidth: 20,
          usePointStyle: false,
          padding: 15
        }
      },
    },
  }

  const bgStyle = isFloating ? 'bg-white/90 backdrop-blur-md' : 'bg-white'

  return (
    <div className={`${bgStyle} p-8 rounded-[2.5rem] shadow-xl border border-white/20 h-full flex flex-col ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="text-[0.7rem] font-black text-black tracking-wide uppercase">DAMAGE SEVERITY TREND & AI TELEMETRY</h3>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
            {aiDetections.length > 0
              ? `AI Telemetry: ${aiDetections.length} total defects detected across vault assets`
              : 'Synchronized with real-time inspection feeds'}
          </p>
        </div>
        {aiDetections.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {aiStats.crack > 0 && (
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                {aiStats.crack} Crack
              </span>
            )}
            {aiStats.corrosion > 0 && (
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                {aiStats.corrosion} Corrosion
              </span>
            )}
            {aiStats.spalling > 0 && (
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                {aiStats.spalling} Spalling
              </span>
            )}
            {aiStats.leakage > 0 && (
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                {aiStats.leakage} Leakage
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}

