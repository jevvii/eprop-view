import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">EPROPVIEW</p>
      <h1 className="mt-2 font-koulen text-3xl tracking-wide text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-600">
        The page you requested does not exist, or your account does not have access to it.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
      >
        Go to dashboard
      </Link>
    </main>
  )
}
