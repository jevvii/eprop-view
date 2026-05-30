'use client'

import { useAllProfiles } from '@/app/lib/queries'
import { toggleUserStatus } from '@/app/actions/admin'
import { useState } from 'react'

export function UserList() {
  const { data: users, isLoading, isError, refetch } = useAllProfiles()
  const [isToggling, setIsToggling] = useState<string | null>(null)

  const handleToggle = async (userId: string, currentStatus: boolean) => {
    setIsToggling(userId)
    const result = await toggleUserStatus(userId, currentStatus)
    if (result.success) {
      await refetch()
    } else {
      alert(result.error || 'Failed to update user status')
    }
    setIsToggling(null)
  }

  if (isLoading) {
    return <div className="bg-white p-8 rounded-[2rem] shadow-lg h-80 animate-pulse border border-slate-100" />
  }

  if (isError) {
    return (
      <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-red-100 text-red-600 font-bold uppercase tracking-widest text-center">
        Access Denied: Administrative Clearance Required
      </div>
    )
  }

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">User Management</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Personnel access control and status monitoring.</p>
        </div>
        <div className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">
          {users?.length || 0} Registered Units
        </div>
      </div>
      
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-widest pl-2">Designation</th>
              <th className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-widest">Authority</th>
              <th className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-widest">Operation Status</th>
              <th className="text-right py-4 font-black text-[10px] text-slate-400 uppercase tracking-widest pr-2">Command</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users?.map((user) => (
              <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                <td className="py-5 pl-2">
                  <div className="font-black text-black uppercase tracking-tight">{user.full_name}</div>
                  <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">{user.email || 'System Account'}</div>
                </td>
                <td className="py-5">
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] border ${
                    user.role === 'admin' 
                      ? 'bg-primary/5 text-primary border-primary/20' 
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="py-5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${
                      user.is_active !== false ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'
                    }`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                      user.is_active !== false ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {user.is_active !== false ? 'Online' : 'Deactivated'}
                    </span>
                  </div>
                </td>
                <td className="py-5 text-right pr-2">
                  <button
                    onClick={() => handleToggle(user.id, user.is_active !== false)}
                    disabled={isToggling === user.id}
                    className={`text-[9px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-xl transition-all border ${
                      user.is_active !== false 
                        ? 'text-rose-600 border-rose-200 hover:bg-rose-50' 
                        : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                    } disabled:opacity-50 active:scale-95`}
                  >
                    {isToggling === user.id ? '...' : user.is_active !== false ? 'Deactivate' : 'Authorize'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
