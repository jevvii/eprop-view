'use client'

import { useAllProfiles } from '@/app/lib/queries'
import { toggleUserStatus } from '@/app/actions/admin'
import { useUpdateUserRole } from '@/app/lib/mutations'
import { useState, useMemo } from 'react'
import type { Role } from '@/app/types'

export function UserList() {
  const { data: users, isLoading, isError, refetch } = useAllProfiles()
  const updateUserRole = useUpdateUserRole()
  const [isToggling, setIsToggling] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredUsers = useMemo(() => {
    if (!users) return []
    return users.filter(user => {
      const matchesRole = roleFilter === 'all' || user.role === roleFilter
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'active' ? user.is_active !== false : user.is_active === false)
      return matchesRole && matchesStatus
    })
  }, [users, roleFilter, statusFilter])

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

  const handleRoleChange = async (userId: string, newRole: Role) => {
    try {
      await updateUserRole.mutateAsync({ userId, newRole })
      await refetch()
    } catch (err: any) {
      alert(err?.message || 'Failed to update role')
    }
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
    <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 px-2">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">User Management & Access Control</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Configure roles, permissions, and account statuses.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select 
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-[9px] font-black uppercase tracking-widest bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 outline-none"
          >
            <option value="all">ALL_ROLES</option>
            <option value="admin">ADMIN</option>
            <option value="engineer">ENGINEER</option>
            <option value="inspector">INSPECTOR</option>
          </select>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-[9px] font-black uppercase tracking-widest bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 outline-none"
          >
            <option value="all">ALL_STATUS</option>
            <option value="active">ONLINE</option>
            <option value="inactive">DEACTIVATED</option>
          </select>
          <div className="px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
            {filteredUsers.length} Units
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto flex-1 min-h-[350px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pl-2">Designation & Contact</th>
              <th className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">RBAC Role</th>
              <th className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Status</th>
              <th className="text-right py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pr-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="group hover:bg-slate-50/50 transition-all">
                <td className="py-5 pl-2">
                  <div className="font-black text-black uppercase tracking-tight leading-tight">{user.full_name || 'UNNAMED_USER'}</div>
                  <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">{user.email || 'SYSTEM_ACCOUNT'}</div>
                  {user.department && <div className="text-[9px] text-slate-400 font-medium">{user.department}</div>}
                </td>
                <td className="py-5">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] border outline-none cursor-pointer ${
                      user.role === 'admin'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : user.role === 'engineer'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    <option value="inspector">INSPECTOR</option>
                    <option value="engineer">ENGINEER</option>
                    <option value="admin">ADMIN</option>
                  </select>
                </td>
                <td className="py-5">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2 w-2 rounded-full ${
                      user.is_active !== false ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                    }`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                      user.is_active !== false ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {user.is_active !== false ? 'Active' : 'Deactivated'}
                    </span>
                  </div>
                </td>
                <td className="py-5 text-right pr-2">
                  <button
                    onClick={() => handleToggle(user.id, user.is_active !== false)}
                    disabled={isToggling === user.id}
                    className={`text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-xl transition-all border ${
                      user.is_active !== false 
                        ? 'text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300' 
                        : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300'
                    } disabled:opacity-50 active:scale-95 shadow-sm hover:shadow-md`}
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
