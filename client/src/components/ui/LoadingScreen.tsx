export default function LoadingScreen() {
  return (
    <div className="min-h-screen w-full bg-[#0f0f17] text-slate-200 flex items-center justify-center px-6">
      <div className="glass rounded-2xl px-8 py-6 flex items-center gap-4">
        <span
          className="h-6 w-6 rounded-full border-2 border-amber-300/30 border-t-amber-400 animate-spin"
          aria-hidden="true"
        />
        <div className="leading-tight">
          <p className="text-sm text-slate-400">Please wait</p>
          <p className="text-base font-medium text-slate-100">Loading your workspace...</p>
        </div>
      </div>
    </div>
  );
}
