import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-slate-800">
      <div className="w-full max-w-md p-8 bg-white/97 rounded-3xl shadow-2xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 bg-blue-800 rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 40 40" className="w-6 h-6" fill="none">
              <rect width="40" height="40" rx="8" fill="#1e40af"/>
              <path d="M10 20h20M20 10v20M10 10l20 20M30 10L10 30" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-slate-900">EPROP VIEW</h1>
            <p className="text-sm text-slate-500">Secure access to your environmental risk dashboard</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
