import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { History, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Eye, Trash2, Loader2 } from 'lucide-react';
import { historyApi, batchApi, type ComparisonSession } from '@/lib/api';
import { toast } from 'sonner';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ComparisonTable } from '@/components/ComparisonTable';
import { Button } from '@/components/ui/button';

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
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const pageSize = 20;

    // Modal states
    const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
    const [deleteSessionId, setDeleteSessionId] = useState<number | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ['history', page],
        queryFn: () => historyApi.listSessions(page, pageSize),
    });

    const { data: sessionDetails, isLoading: isLoadingDetails } = useQuery({
        queryKey: ['session-details', selectedSessionId],
        queryFn: () => batchApi.getBatchResults(selectedSessionId!.toString()),
        enabled: !!selectedSessionId,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => batchApi.deleteBatch(id.toString()),
        onSuccess: () => {
            toast.success('Sesi berhasil dihapus');
            queryClient.invalidateQueries({ queryKey: ['history'] });
            queryClient.invalidateQueries({ queryKey: ['analytics'] });
            setDeleteSessionId(null);
        },
        onError: (err: any) => {
            toast.error(err.message || 'Gagal menghapus sesi');
        }
    });

    const total = data?.total || 0;
    const sessions = data?.sessions || [];
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
                    <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
                        {error instanceof Error ? error.message : 'Gagal memuat riwayat'}
                    </p>
                </div>
            )}

            {/* Table */}
            <div className="section-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                                {['#', 'Waktu', 'Total', 'Akurat', 'Cukup', 'Tidak Akurat', 'Error', 'Akurasi', 'Aksi'].map(h => (
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
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 9 }).map((_, j) => (
                                            <td key={j} className="px-4 py-3">
                                                <div className="h-3 rounded animate-pulse" style={{ background: 'hsl(var(--muted) / 0.6)', width: `${40 + (j * 15) % 40}%` }} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : sessions.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Belum ada riwayat. Jalankan compare di Dashboard untuk mulai merekam.
                                    </td>
                                </tr>
                            ) : sessions.map((s, idx) => (
                                <tr
                                    key={s.id}
                                    className="border-b transition-colors hover:bg-primary/5"
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
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                onClick={() => setSelectedSessionId(s.id)}
                                                title="Lihat Detail"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => setDeleteSessionId(s.id)}
                                                title="Hapus Sesi"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
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

            {/* Detail Dialog */}
            <Dialog open={!!selectedSessionId} onOpenChange={(open) => !open && setSelectedSessionId(null)}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                    <DialogHeader className="p-6 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-primary" />
                            Detail Sesi — {selectedSessionId && sessions.find(s => s.id === selectedSessionId)?.created_at ? formatDate(sessions.find(s => s.id === selectedSessionId)!.created_at) : ''}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto p-6 bg-background/50">
                        {isLoadingDetails ? (
                            <div className="h-64 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Memuat data...</p>
                            </div>
                        ) : sessionDetails ? (
                            <ComparisonTable
                                results={sessionDetails.map(item => ({
                                    connote: item.connote,
                                    recipientName: item.recipient_name,
                                    systemAddress: item.system_address,
                                    systemLat: item.system_lat || undefined,
                                    systemLng: item.system_lng || undefined,
                                    fieldLat: item.field_lat || undefined,
                                    fieldLng: item.field_lng || undefined,
                                    distanceMeters: item.distance_km ? item.distance_km * 1000 : undefined,
                                    category: item.accuracy_level as any,
                                    geocodeStatus: item.geocode_status as any,
                                }))}
                            />
                        ) : (
                            <p className="text-center py-12 text-muted-foreground">Data tidak ditemukan.</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteSessionId} onOpenChange={(open) => !open && setDeleteSessionId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus Sesi Riwayat?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tindakan ini tidak dapat dibatalkan. Sesi ini akan dihapus permanen dari riwayat dan statistik analitik Anda.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteSessionId && deleteMutation.mutate(deleteSessionId)}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
