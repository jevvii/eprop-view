'use client'

import { useMaintenancePriorities } from '@/app/lib/queries'

export function MaintenanceTable() {
  const { data: items, isLoading, isError } = useMaintenancePriorities()

  if (isLoading) {
    return <div className="bg-white p-8 rounded-[2rem] shadow-sm animate-pulse h-80" />
  }

  if (isError) {
    return (
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-red-100 text-red-600 font-bold uppercase tracking-widest text-center">
        Maintenance Log Link Offline
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[0.65rem] font-black text-slate-400 tracking-[0.15em] uppercase px-2">Priority Repairs</h3>
        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
          {items?.length || 0} Units
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <div className="space-y-3">
          {items?.map((item) => (
            <div 
              key={item.id} 
              className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all group"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="font-black text-black uppercase tracking-tight text-xs leading-snug group-hover:text-primary transition-colors">{item.title}</div>
                <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                  item.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                  item.status === 'in_progress' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                  item.status === 'deferred' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                  'bg-rose-50 text-red-600 border-rose-100'
                }`}>
                  {item.status}
                </span>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.location}</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Score</span>
                  <span className="text-xs font-black text-black">{item.risk_score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
