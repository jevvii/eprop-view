export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading page">
      <div className="mb-6 h-8 w-48 rounded bg-slate-200 animate-pulse" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-2xl bg-slate-200 animate-pulse" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-slate-200 animate-pulse" />
    </div>
  )
}
