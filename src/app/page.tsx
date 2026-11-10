import { LoginForm } from '@/components/auth/login-form'
import Image from 'next/image'

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-brand-gray relative overflow-hidden p-4 sm:p-6 lg:p-8">
      {/* Dynamic Background Element */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[60%] bg-primary/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[60%] bg-accent/5 rounded-full blur-[120px] -z-10" />

      <div className="w-full max-w-md p-6 sm:p-8 md:p-12 bg-white rounded-2xl sm:rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] border border-slate-100">
        <div className="flex flex-col items-center text-center mb-8 sm:mb-12">
          <div className="w-20 h-20 relative mb-6 drop-shadow-md">
            <Image
              src="/logo-blue.png"
              alt="EPROP VIEW Logo"
              fill
              priority
              sizes="80px"
              className="object-contain"
            />
            <div className="absolute inset-0 bg-primary/5 rounded-2xl -z-10 scale-125" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-koulen tracking-wider text-black mb-2 uppercase">EPROP VIEW</h1>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Authorized Personnel Only</p>
        </div>
        
        <LoginForm />

        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-slate-100 text-center space-y-1">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Secure Node Deployment
          </div>
          <div className="text-xs font-medium text-slate-500">
            Precision Environmental Monitoring &copy; 2026
          </div>
        </div>
      </div>
    </div>
  )
}
