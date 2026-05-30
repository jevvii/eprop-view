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
import { useDamageTrends } from '@/app/lib/queries'

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
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    datasets: [
      {
        label: 'CRITICAL',
        data: trends?.filter((t) => t.severity === 'critical').map((t) => t.value) || [8.5, 8.2, 7.8, 6.9, 6.5],
        borderColor: '#ef4444',
        backgroundColor: '#ef4444',
        tension: 0.4,
      },
      {
        label: 'HIGH',
        data: trends?.filter((t) => t.severity === 'high').map((t) => t.value) || [5.2, 5.0, 4.7, 4.3, 4.1],
        borderColor: '#f97316',
        backgroundColor: '#f97316',
        tension: 0.4,
      },
      {
        label: 'MODERATE',
        data: trends?.filter((t) => t.severity === 'moderate').map((t) => t.value) || [2.1, 2.3, 2.0, 1.8, 1.6],
        borderColor: '#fbbf24',
        backgroundColor: '#fbbf24',
        tension: 0.4,
      },
    ],
  }

  const maxValue = 10
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: maxValue, grid: { color: 'rgba(226, 232, 240, 0.5)' } },
      x: { grid: { display: false } },
    },
    plugins: {
      legend: { 
        position: 'top' as const, 
        align: 'end' as const,
        labels: {
          font: { size: 10, weight: 'bold' as any },
          boxWidth: 8,
          usePointStyle: true
        }
      },
    },
  }

  const bgStyle = isFloating ? 'bg-white/90 backdrop-blur-md' : 'bg-white'

  return (
    <div className={`${bgStyle} p-8 rounded-[2.5rem] shadow-xl border border-white/20 h-full flex flex-col ${className}`}>
      <h3 className="text-[0.65rem] font-black text-slate-400 mb-6 tracking-[0.15em] uppercase">Damage Severity Trend</h3>
      <div className="flex-1 min-h-0">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}
