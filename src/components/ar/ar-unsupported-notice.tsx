export function ARUnsupportedNotice() {
  return (
    <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 text-center">
      <div className="text-4xl mb-4 opacity-20 grayscale">🥽</div>
      <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-2">AR Mode Unsupported</h3>
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider max-w-sm mx-auto leading-relaxed">
        AR Inspection Mode requires a WebXR-capable mobile browser. Currently, immersive AR is best supported on Chrome for Android with ARCore. iOS Safari does not support WebXR immersive AR natively; use a dedicated WebXR viewer or a Capacitor wrapper for native ARKit access.
      </p>
    </div>
  )
}
