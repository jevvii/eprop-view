import { LoginForm } from '@/components/auth/login-form'
import Image from 'next/image'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-gray relative overflow-hidden">
      {/* Dynamic Background Element */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[60%] bg-primary/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[60%] bg-accent/5 rounded-full blur-[120px] -z-10" />

      <div className="w-full max-w-md p-12 bg-white rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] border border-slate-100">
        <div className="flex flex-col items-center text-center mb-12">
          <div className="w-20 h-20 relative mb-6 drop-shadow-md">
            <Image 
              src="/logo-blue.png" 
              alt="EPROP VIEW Logo" 
              fill
              priority
              className="object-contain" 
            />
            <div className="absolute inset-0 bg-primary/5 rounded-2xl -z-10 scale-125" />
          </div>
          <h1 className="text-4xl font-koulen tracking-wider text-black mb-2 uppercase">EPROP VIEW</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Authorized Personnel Only</p>
        </div>
        
        <LoginForm />

        <div className="mt-12 pt-8 border-t border-slate-50 text-center">
          <div className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1 leading-none">
            Secure Node Deployment
          </div>
          <div className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.1em]">
            Precision Environmental Monitoring &copy; 2026
          </div>
        </div>
      </div>
    </div>
  )
}
