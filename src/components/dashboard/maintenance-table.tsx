'use client'

import { useMaintenancePriorities } from '@/app/lib/queries'

export function MaintenanceTable() {
  const { data: items, isLoading } = useMaintenancePriorities()

  if (isLoading) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-48 animate-pulse" />
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg">
      <h3 className="text-sm font-bold text-slate-900 mb-4 tracking-wide">MAINTENANCE PRIORITIES</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 font-semibold text-slate-600">Title</th>
              <th className="text-left py-2 font-semibold text-slate-600">Location</th>
              <th className="text-left py-2 font-semibold text-slate-600">Risk Score</th>
              <th className="text-left py-2 font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-2">{item.title}</td>
                <td className="py-2 text-slate-500">{item.location}</td>
                <td className="py-2">{item.risk_score}</td>
                <td className="py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.status === 'completed' ? 'bg-green-100 text-green-700' :
                    item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                    item.status === 'deferred' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
