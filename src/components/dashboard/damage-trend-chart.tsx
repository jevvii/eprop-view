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
        data: trends?.filter((t) => t.severity === 'critical').map((t) => t.value) || [8.5, 8.2, 7.5, 6.8, 6.5],
        borderColor: '#ef4444',
        backgroundColor: '#ef4444',
        tension: 0.4,
      },
      {
        label: 'HIGH',
        data: trends?.filter((t) => t.severity === 'high').map((t) => t.value) || [5.2, 5.0, 4.8, 4.5, 4.2],
        borderColor: '#f97316',
        backgroundColor: '#f97316',
        tension: 0.4,
      },
      {
        label: 'MODERATE',
        data: trends?.filter((t) => t.severity === 'moderate').map((t) => t.value) || [3.8, 3.6, 3.4, 3.2, 3.0],
        borderColor: '#fbbf24',
        backgroundColor: '#fbbf24',
        tension: 0.4,
      },
      {
        label: 'LOW',
        data: trends?.filter((t) => t.severity === 'low').map((t) => t.value) || [2.1, 2.3, 2.0, 1.8, 1.6],
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
    <div className={`${bgStyle} p-10 rounded-[2.5rem] shadow-xl border border-white/20 h-full flex flex-col ${className}`}>
      <h3 className="text-[0.7rem] font-black text-black mb-6 tracking-wide uppercase">DAMAGE SEVERITY TREND</h3>
      <div className="flex-1 min-h-0">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}
