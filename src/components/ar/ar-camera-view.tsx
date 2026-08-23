'use client'

import { useARSessionContext } from './ar-session-manager'

interface ARCameraViewProps {
  onTapToAnchor?: () => void
}

export function ARCameraView({ onTapToAnchor }: ARCameraViewProps) {
  const { session, hitPose, canvasRef } = useARSessionContext()

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none">
      {/* WebGL Canvas for WebXR Rendering */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover z-0"
        onClick={onTapToAnchor}
      />

      {session ? (
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6">
          {/* Top HUD Telemetry */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-white shadow-lg">
              <span className={`h-2 w-2 rounded-full ${hitPose ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'}`} />
              <span className="text-[9px] font-black uppercase tracking-widest">
                {hitPose ? 'Surface Detected' : 'Scanning Physical Planes…'}
              </span>
            </div>

            {hitPose && (
              <div className="bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-right text-white shadow-lg">
                <div className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Spatial Coordinate</div>
                <div className="text-[9px] font-mono font-bold text-emerald-400">
                  X:{hitPose.position.x.toFixed(2)} Y:{hitPose.position.y.toFixed(2)} Z:{hitPose.position.z.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Center Dynamic Reticle */}
          <div className="flex-1 flex items-center justify-center">
            {hitPose ? (
              <div className="relative flex items-center justify-center animate-pulse">
                {/* 3D Surface Reticle */}
                <div className="w-20 h-20 rounded-full border-2 border-emerald-400/80 shadow-[0_0_15px_rgba(52,211,153,0.5)] flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border border-dashed border-emerald-300 animate-spin" />
                  <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md" />
                </div>
                <span className="absolute -bottom-6 bg-black/80 backdrop-blur-sm text-emerald-300 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-emerald-500/30">
                  Tap to drop anchor
                </span>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
              </div>
            )}
          </div>

          {/* Bottom Helper Bar */}
          <div className="text-center">
            <p className="text-[9px] font-black text-white/80 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl inline-block border border-white/10 uppercase tracking-widest">
              Point camera at concrete, beams, or columns to identify structural targets
            </p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center z-10">
          <div className="max-w-xs space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-3xl shadow-2xl">
              🥽
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">AR Optical Pipeline Standby</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5 leading-relaxed">
                Connect to an active technical inspection and press Start AR Session to begin real-time surface tracking.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
