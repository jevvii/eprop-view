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
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-60 animate-pulse" />
  }

  if (isError) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">Failed to load users</div>
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
      <h3 className="text-lg font-bold text-slate-900 mb-4">User Management</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 font-semibold text-slate-600">Name</th>
              <th className="text-left py-3 font-semibold text-slate-600">Role</th>
              <th className="text-left py-3 font-semibold text-slate-600">Status</th>
              <th className="text-right py-3 font-semibold text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((user) => (
              <tr key={user.id} className="border-b border-slate-100">
                <td className="py-4">
                  <div className="font-medium text-slate-900">{user.full_name}</div>
                  <div className="text-xs text-slate-500">{user.email || 'No email'}</div>
                </td>
                <td className="py-4">
                  <span className="capitalize text-slate-600">{user.role}</span>
                </td>
                <td className="py-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    user.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {user.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <button
                    onClick={() => handleToggle(user.id, user.is_active !== false)}
                    disabled={isToggling === user.id}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                      user.is_active !== false 
                        ? 'text-red-600 hover:bg-red-50' 
                        : 'text-green-600 hover:bg-green-50'
                    } disabled:opacity-50`}
                  >
                    {isToggling === user.id ? '...' : user.is_active !== false ? 'Deactivate' : 'Activate'}
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
