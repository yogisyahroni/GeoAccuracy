import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Target, AlertCircle } from 'lucide-react';
import { analyticsApi } from '@/lib/api';

function StatBox({ label, value, color, sub }: {
    label: string; value: string | number; color: string; sub?: string;
}) {
    return (
        <div
            className="section-card p-5"
            style={{ borderColor: 'hsl(var(--border) / 0.5)' }}
        >
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {label}
            </p>
            <p className="text-3xl font-bold" style={{ color }}>{value}</p>
            {sub && <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{sub}</p>}
        </div>
    );
}

export default function AnalyticsPage() {
    const { data: agg, isLoading: loading, error } = useQuery({
        queryKey: ['analytics'],
        queryFn: () => analyticsApi.getAnalytics(),
        refetchOnWindowFocus: true,
    });

    // Build bar chart data from last 10 sessions. Go returns descending, so we reverse it for chronological display in chart
    const chartData = agg?.recentSessions ? [...agg.recentSessions].reverse() : [];
    const maxTotal = Math.max(...chartData.map(s => s.total_count), 1);

    if (error) {
        return (
            <div className="p-5">
                <div
                    className="rounded-xl border p-4 flex gap-3"
                    style={{ background: 'hsl(var(--destructive) / 0.05)', borderColor: 'hsl(var(--destructive) / 0.3)' }}
                >
                    <AlertCircle className="w-4 h-4" style={{ color: 'hsl(var(--destructive))' }} />
                    <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>{error instanceof Error ? error.message : 'Gagal memuat data'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-5 max-w-6xl mx-auto space-y-6">
            {/* Aggregate Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="section-card p-5 space-y-2">
                            <div className="h-3 w-20 rounded animate-pulse" style={{ background: 'hsl(var(--muted))' }} />
                            <div className="h-8 w-16 rounded animate-pulse" style={{ background: 'hsl(var(--muted))' }} />
                        </div>
                    ))
                ) : (
                    <>
                        <StatBox label="Total Sesi" value={agg.totalSessions} color="hsl(var(--foreground))" sub="sesi compare" />
                        <StatBox label="Total Record" value={agg.totalRecords.toLocaleString('id-ID')} color="hsl(var(--primary))" sub="alamat diproses" />
                        <StatBox label="Rata-rata Akurasi" value={`${agg.avgAccuracyRate}%`} color="hsl(142 70% 55%)" sub="(0–50 m)" />
                        <StatBox label="Total Error" value={agg.totalError} color="hsl(var(--destructive))" sub="tidak cocok / gagal geocode" />
                    </>
                )}
            </div>

            {/* Distribution */}
            {!loading && agg.totalRecords > 0 && (
                <div className="section-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Distribusi Akurasi (Kumulatif)</p>
                    </div>
                    <div className="space-y-3">
                        {[
                            { label: 'Akurat (0–50 m)', count: agg.totalAccurate, color: 'hsl(142 70% 45%)' },
                            { label: 'Cukup (50–100 m)', count: agg.totalFairly, color: 'hsl(38 92% 55%)' },
                            { label: 'Tidak Akurat (>100 m)', count: agg.totalInaccurate, color: 'hsl(var(--destructive))' },
                            { label: 'Error / Tidak cocok', count: agg.totalError, color: 'hsl(var(--muted-foreground))' },
                        ].map(({ label, count, color }) => (
                            <div key={label} className="flex items-center gap-3">
                                <p className="text-xs w-36 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
                                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted) / 0.4)' }}>
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{ width: `${Math.round((count / agg.totalRecords) * 100)}%`, background: color }}
                                    />
                                </div>
                                <p className="text-xs w-12 text-right font-mono" style={{ color }}>
                                    {Math.round((count / agg.totalRecords) * 100)}%
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Trend Chart */}
            {!loading && chartData.length >= 2 && (
                <div className="section-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                            Tren Akurasi — {chartData.length} Sesi Terakhir
                        </p>
                    </div>
                    <div className="flex items-end gap-2 h-32">
                        {chartData.map((s, i) => {
                            const heightPct = s.total_count > 0 ? (s.total_count / maxTotal) * 100 : 4;
                            const accPct = s.total_count > 0 ? Math.round((s.accurate_count / s.total_count) * 100) : 0;
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                    <div
                                        className="w-full rounded-t-sm transition-all duration-300"
                                        style={{ height: `${heightPct}%`, background: `hsl(142 70% 45% / ${0.3 + accPct / 140})` }}
                                        title={`Sesi ${i + 1}: ${accPct}% akurat (${s.total_count} record)`}
                                    />
                                    <p className="text-[9px] font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {accPct}%
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between text-[10px] mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <span>Sesi lama</span>
                        <span>Terbaru</span>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!loading && (!agg?.recentSessions || agg.recentSessions.length === 0) && (
                <div
                    className="section-card p-12 text-center"
                >
                    <BarChart3 className="w-10 h-10 mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground) / 0.4)' }} />
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Belum ada data analitik</p>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Jalankan compare di Dashboard — setiap proses akan tercatat secara otomatis.
                    </p>
                </div>
            )}
        </div>
    );
}
