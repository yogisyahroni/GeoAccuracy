import { useEffect, useState } from 'react';
import { History, ChevronLeft, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';
import { historyApi, type ComparisonSession } from '@/lib/api';

function formatDate(iso: string) {
    return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function AccuracyBar({ accurate, fairly, inaccurate, error, total }: {
    accurate: number; fairly: number; inaccurate: number; error: number; total: number;
}) {
    if (total === 0) return null;
    const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
    return (
        <div className="flex h-1.5 rounded-full overflow-hidden w-24">
            <div style={{ width: pct(accurate), background: 'hsl(142 70% 45%)' }} />
            <div style={{ width: pct(fairly), background: 'hsl(38 92% 55%)' }} />
            <div style={{ width: pct(inaccurate), background: 'hsl(var(--destructive))' }} />
            <div style={{ width: pct(error), background: 'hsl(var(--muted-foreground))' }} />
        </div>
    );
}

export default function HistoryPage() {
    const [sessions, setSessions] = useState<ComparisonSession[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pageSize = 20;

    useEffect(() => {
        setLoading(true);
        setError(null);
        historyApi.listSessions(page, pageSize)
            .then(res => {
                setSessions(res.sessions);
                setTotal(res.total);
            })
            .catch(err => setError(err.message ?? 'Gagal memuat riwayat'))
            .finally(() => setLoading(false));
    }, [page]);

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="p-5 max-w-6xl mx-auto space-y-5">
            {/* Header stat */}
            <div className="flex items-center gap-2.5">
                <History className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {total} sesi tersimpan
                </p>
            </div>

            {/* Error state */}
            {error && (
                <div
                    className="rounded-xl border p-4 flex gap-3"
                    style={{ background: 'hsl(var(--destructive) / 0.05)', borderColor: 'hsl(var(--destructive) / 0.3)' }}
                >
                    <AlertCircle className="w-4 h-4" style={{ color: 'hsl(var(--destructive))' }} />
                    <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
                </div>
            )}

            {/* Table */}
            <div className="section-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                                {['#', 'Waktu', 'Total', 'Akurat', 'Cukup', 'Tidak Akurat', 'Error', 'Akurasi'].map(h => (
                                    <th
                                        key={h}
                                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: 'hsl(var(--muted-foreground))' }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 8 }).map((_, j) => (
                                            <td key={j} className="px-4 py-3">
                                                <div className="h-3 rounded animate-pulse" style={{ background: 'hsl(var(--muted) / 0.6)', width: `${40 + (j * 15) % 40}%` }} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : sessions.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Belum ada riwayat. Jalankan compare di Dashboard untuk mulai merekam.
                                    </td>
                                </tr>
                            ) : sessions.map((s, idx) => (
                                <tr
                                    key={s.id}
                                    className="border-b transition-colors hover:brightness-110"
                                    style={{ borderColor: 'hsl(var(--border) / 0.4)' }}
                                >
                                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {(page - 1) * pageSize + idx + 1}
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        {formatDate(s.created_at)}
                                    </td>
                                    <td className="px-4 py-3 font-semibold">{s.total_count}</td>
                                    <td className="px-4 py-3" style={{ color: 'hsl(142 70% 55%)' }}>{s.accurate_count}</td>
                                    <td className="px-4 py-3" style={{ color: 'hsl(38 92% 55%)' }}>{s.fairly_count}</td>
                                    <td className="px-4 py-3" style={{ color: 'hsl(var(--destructive))' }}>{s.inaccurate_count}</td>
                                    <td className="px-4 py-3" style={{ color: 'hsl(var(--muted-foreground))' }}>{s.error_count}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <AccuracyBar
                                                accurate={s.accurate_count}
                                                fairly={s.fairly_count}
                                                inaccurate={s.inaccurate_count}
                                                error={s.error_count}
                                                total={s.total_count}
                                            />
                                            {s.total_count > 0 && (
                                                <span className="text-xs font-mono" style={{ color: 'hsl(142 70% 55%)' }}>
                                                    {Math.round((s.accurate_count / s.total_count) * 100)}%
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div
                        className="flex items-center justify-between px-4 py-3 border-t"
                        style={{ borderColor: 'hsl(var(--border) / 0.4)' }}
                    >
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            Halaman {page} dari {totalPages}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-1.5 rounded-lg border disabled:opacity-40 transition-all hover:brightness-110"
                                style={{ borderColor: 'hsl(var(--border))' }}
                            >
                                <ChevronLeft className="w-3.5 h-3.5" style={{ color: 'hsl(var(--foreground))' }} />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-1.5 rounded-lg border disabled:opacity-40 transition-all hover:brightness-110"
                                style={{ borderColor: 'hsl(var(--border))' }}
                            >
                                <ChevronRight className="w-3.5 h-3.5" style={{ color: 'hsl(var(--foreground))' }} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {[
                    { label: 'Akurat (0–50 m)', color: 'hsl(142 70% 45%)' },
                    { label: 'Cukup (50–100 m)', color: 'hsl(38 92% 55%)' },
                    { label: 'Tidak Akurat (>100 m)', color: 'hsl(var(--destructive))' },
                    { label: 'Error / Tidak cocok', color: 'hsl(var(--muted-foreground))' },
                ].map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3" style={{ color }} />
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}
