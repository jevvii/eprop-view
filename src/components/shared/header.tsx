import { verifySession } from '@/app/lib/dal'

export async function Header() {
  const session = await verifySession()

  // Get current page from URL (simplified - in real app pass as prop)
  const currentPage = 'Dashboard'

  return (
    <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200/50 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="font-bold text-slate-900">{currentPage}</span>
        <span>{'>'}</span>
        <span>PROJECT: NAME</span>
      </div>
      <div className="flex items-center gap-2.5 text-sm text-slate-600">
        <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold">
          {session.email?.[0]?.toUpperCase() || 'U'}
        </div>
        <span className="font-medium">{session.email}</span>
      </div>
    </header>
  )
}
