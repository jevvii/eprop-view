'use client'

import { useARSessionContext } from './ar-session-manager'

export function ARCameraView() {
  const { session } = useARSessionContext()

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden">
      {session ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">🎥</div>
            <p className="text-[10px] font-black text-white uppercase tracking-widest">Live AR Camera Active</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-2 max-w-xs">
              Point the device at walls, beams, or columns. Tap to place an anchor and the AI will classify the damage.
            </p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4 opacity-50">🥽</div>
            <p className="text-[10px] font-black text-white uppercase tracking-widest">AR Session Not Started</p>
          </div>
        </div>
      )}
    </div>
  )
}
