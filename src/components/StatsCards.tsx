import { DashboardStats } from '@/types/logistics';
import { Package, CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react';

interface StatsCardsProps {
  stats: DashboardStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const accuratePercent = stats.total > 0 ? ((stats.accurate / stats.total) * 100).toFixed(1) : '0.0';
  const fairlyPercent = stats.total > 0 ? ((stats.fairlyAccurate / stats.total) * 100).toFixed(1) : '0.0';
  const inaccuratePercent = stats.total > 0 ? ((stats.inaccurate / stats.total) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total */}
      <div className="stat-card animate-fade-in">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg" style={{ background: 'hsl(var(--primary) / 0.1)' }}>
            <Package className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <span className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>TOTAL</span>
        </div>
        <div className="space-y-1">
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'hsl(var(--foreground))' }}>
            {stats.total.toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Data diupload
          </div>
        </div>
        {stats.pending > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--primary))' }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            {stats.pending} sedang diproses
          </div>
        )}
      </div>

      {/* Accurate */}
      <div className="stat-card-accurate animate-fade-in" style={{ animationDelay: '0.05s' }}>
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg" style={{ background: 'hsl(142 70% 45% / 0.12)' }}>
            <CheckCircle2 className="w-5 h-5" style={{ color: 'hsl(142 70% 50%)' }} />
          </div>
          <span className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>AKURAT</span>
        </div>
        <div className="space-y-1">
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'hsl(142 70% 55%)' }}>
            {stats.accurate.toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Radius 0–50 meter · {accuratePercent}%
          </div>
        </div>
        <div className="mt-3 progress-bar">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${accuratePercent}%`,
              background: 'hsl(142 70% 45%)',
            }}
          />
        </div>
      </div>

      {/* Fairly Accurate */}
      <div className="stat-card-fairly animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg" style={{ background: 'hsl(38 92% 50% / 0.12)' }}>
            <AlertCircle className="w-5 h-5" style={{ color: 'hsl(38 92% 55%)' }} />
          </div>
          <span className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>CUKUP AKURAT</span>
        </div>
        <div className="space-y-1">
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'hsl(38 92% 60%)' }}>
            {stats.fairlyAccurate.toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Radius 50–100 meter · {fairlyPercent}%
          </div>
        </div>
        <div className="mt-3 progress-bar">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${fairlyPercent}%`,
              background: 'hsl(38 92% 50%)',
            }}
          />
        </div>
      </div>

      {/* Inaccurate */}
      <div className="stat-card-inaccurate animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg" style={{ background: 'hsl(0 72% 51% / 0.12)' }}>
            <XCircle className="w-5 h-5" style={{ color: 'hsl(0 72% 60%)' }} />
          </div>
          <span className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>TIDAK AKURAT</span>
        </div>
        <div className="space-y-1">
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'hsl(0 72% 65%)' }}>
            {stats.inaccurate.toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Radius &gt;100 meter · {inaccuratePercent}%
          </div>
        </div>
        <div className="mt-3 progress-bar">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${inaccuratePercent}%`,
              background: 'hsl(0 72% 51%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
