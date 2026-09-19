export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse max-w-7xl mx-auto w-full">
      {/* Top action bar skeleton */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-md" />
          <div className="h-4 w-72 bg-muted/60 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-muted rounded-md" />
          <div className="h-9 w-28 bg-muted rounded-md" />
        </div>
      </div>

      {/* Filter / search bar skeleton */}
      <div className="h-10 w-full bg-muted/50 rounded-lg" />

      {/* Table / Cards skeleton */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="h-6 w-full bg-muted/40 rounded" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-9 w-9 rounded-full bg-muted/70 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-1/3 bg-muted/80 rounded" />
                  <div className="h-3 w-1/4 bg-muted/50 rounded" />
                </div>
              </div>
              <div className="h-6 w-20 bg-muted/60 rounded-full" />
              <div className="h-4 w-16 bg-muted/50 rounded hidden sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
