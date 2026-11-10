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
    <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xs font-bold text-slate-600 tracking-wider uppercase mb-1">User Management & Access Control</h3>
          <p className="text-xs text-slate-500 font-medium">Configure roles, permissions, and account statuses.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select 
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-base sm:text-xs font-bold uppercase tracking-wider bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[38px] outline-none"
          >
            <option value="all">ALL ROLES</option>
            <option value="admin">ADMIN</option>
            <option value="engineer">ENGINEER</option>
            <option value="inspector">INSPECTOR</option>
          </select>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-base sm:text-xs font-bold uppercase tracking-wider bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[38px] outline-none"
          >
            <option value="all">ALL STATUS</option>
            <option value="active">ACTIVE</option>
            <option value="inactive">DEACTIVATED</option>
          </select>
          <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 uppercase tracking-wider tabular-nums">
            {filteredUsers.length} Users
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto flex-1 min-h-[350px]">
        <table className="responsive-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 font-bold text-xs text-slate-600 uppercase tracking-wider pl-2">Designation & Contact</th>
              <th className="text-left py-3 font-bold text-xs text-slate-600 uppercase tracking-wider">RBAC Role</th>
              <th className="text-left py-3 font-bold text-xs text-slate-600 uppercase tracking-wider">Status</th>
              <th className="text-right py-3 font-bold text-xs text-slate-600 uppercase tracking-wider pr-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="group hover:bg-slate-50/70 transition-all">
                <td className="py-4 pl-2">
                  <div className="font-bold text-slate-900 tracking-tight leading-tight">{user.full_name || 'UNNAMED USER'}</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">{user.email || 'SYSTEM ACCOUNT'}</div>
                  {user.department && <div className="text-xs text-slate-400 font-medium mt-0.5">{user.department}</div>}
                </td>
                <td className="py-4">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border outline-none cursor-pointer min-h-[36px] ${
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
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${
                      user.is_active !== false ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                    }`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                      user.is_active !== false ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {user.is_active !== false ? 'Active' : 'Deactivated'}
                    </span>
                  </div>
                </td>
                <td className="py-4 text-right pr-2">
                  <button
                    onClick={() => handleToggle(user.id, user.is_active !== false)}
                    disabled={isToggling === user.id}
                    className={`text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 min-h-[36px] rounded-xl transition-all border ${
                      user.is_active !== false 
                        ? 'text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300' 
                        : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300'
                    } disabled:opacity-50 active:scale-95 shadow-sm`}
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
