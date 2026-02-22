import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Clock, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area
} from 'recharts';

import { getCourierLeaderboard, getSLATrends } from '@/services/api/analytics';

export default function AdvancedAnalytics() {
    // Days selection for SLA Trends
    const [days, setDays] = useState(7);

    const { data: leaderboards, isLoading: isLeaderboardLoading } = useQuery({
        queryKey: ['advanced_analytics_leaderboard'],
        queryFn: () => getCourierLeaderboard(10)
    });

    const { data: slaTrends, isLoading: isSLATrendsLoading } = useQuery({
        queryKey: ['advanced_analytics_sla', days],
        queryFn: () => getSLATrends(days)
    });

    const aggregateStats = {
        totalCouriers: leaderboards?.length || 0,
        averageAccuracy: leaderboards && leaderboards.length > 0
            ? leaderboards.reduce((acc, curr) => acc + curr.accuracy_rate, 0) / leaderboards.length
            : 0,
        bestCourier: leaderboards && leaderboards.length > 0 ? leaderboards[0].courier_id : '-',
        lateMetrics: slaTrends && slaTrends.length > 0
            ? (slaTrends.reduce((acc, curr) => acc + curr.late_count, 0) / slaTrends.reduce((acc, curr) => acc + curr.total_count, 0)) * 100
            : 0
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl border-l-4 border-l-primary pl-4 font-bold text-foreground">
                        Performa Kurir & SLA
                    </h1>
                    <p className="text-muted-foreground mt-2 max-w-2xl pl-4">
                        Pantau metrik performa masing-masing kurir berdasarkan akurasi titik geo-lokasi serta tren ketepatan waktu pengantaran harian.
                    </p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="glass-card p-6 flex items-center justify-between transform transition hover:scale-[1.02]">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Kurir Aktif</p>
                        <h3 className="text-3xl font-bold mt-2">{aggregateStats.totalCouriers}</h3>
                    </div>
                    <div className="bg-primary/10 p-4 rounded-xl text-primary">
                        <Users className="w-6 h-6" />
                    </div>
                </div>

                <div className="glass-card p-6 flex items-center justify-between transform transition hover:scale-[1.02]">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Rata-rata Akurasi</p>
                        <h3 className="text-3xl font-bold mt-2">
                            {aggregateStats.averageAccuracy.toFixed(2)}%
                        </h3>
                    </div>
                    <div className="bg-emerald-500/10 p-4 rounded-xl text-emerald-500">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                </div>

                <div className="glass-card p-6 flex items-center justify-between transform transition hover:scale-[1.02]">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Kasus Keterlambatan</p>
                        <h3 className="text-3xl font-bold mt-2 truncate">
                            {aggregateStats.lateMetrics.toFixed(1)}%
                        </h3>
                    </div>
                    <div className="bg-amber-500/10 p-4 rounded-xl text-amber-500">
                        <Clock className="w-6 h-6" />
                    </div>
                </div>

                <div className="glass-card p-6 flex items-center justify-between transform transition hover:scale-[1.02]">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Top Performer</p>
                        <h3 className="text-xl font-bold mt-2 truncate max-w-[120px]" title={aggregateStats.bestCourier}>
                            {aggregateStats.bestCourier}
                        </h3>
                    </div>
                    <div className="bg-indigo-500/10 p-4 rounded-xl text-indigo-500">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Chart: Courier Leaderboard */}
                <div className="glass-card flex flex-col h-[400px]">
                    <div className="p-6 border-b border-border/40 pb-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" /> Peringkat Akurasi Kurir (Top 10)
                        </h2>
                    </div>
                    <div className="flex-1 p-6 relative">
                        {isLeaderboardLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : leaderboards && leaderboards.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={leaderboards} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                                    <XAxis dataKey="courier_id" tick={{ fill: 'currentColor', opacity: 0.6 }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fill: 'currentColor', opacity: 0.6 }} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                                        labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                                    />
                                    <Legend />
                                    <Bar name="Akurat" dataKey="accurate_count" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
                                    <Bar name="Cukup Akurat" dataKey="fairly_count" stackId="a" fill="#F59E0B" />
                                    <Bar name="Melenceng" dataKey="inaccurate_count" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center">
                                <AlertTriangle className="h-10 w-10 mb-2 opacity-50" />
                                <p>Belum ada data metrik kurir yang terkumpul.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Chart: SLA Trends */}
                <div className="glass-card flex flex-col h-[400px]">
                    <div className="p-6 border-b border-border/40 pb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" /> Tren Ketepatan Waktu (SLA)
                        </h2>
                        <select
                            className="bg-secondary/50 border border-border/50 text-sm rounded-md px-3 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                            value={days}
                            onChange={(e) => setDays(Number(e.target.value))}
                        >
                            <option value={7}>7 Hari Terakhir</option>
                            <option value={14}>14 Hari Terakhir</option>
                            <option value={30}>30 Hari Terakhir</option>
                        </select>
                    </div>
                    <div className="flex-1 p-6 relative">
                        {isSLATrendsLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : slaTrends && slaTrends.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={slaTrends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorOnTime" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                                    <XAxis dataKey="date" tick={{ fill: 'currentColor', opacity: 0.6 }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fill: 'currentColor', opacity: 0.6 }} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                                        labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                                    />
                                    <Legend />
                                    <Area type="monotone" name="Sesuai SLA (Tepat Waktu)" dataKey="on_time_count" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorOnTime)" />
                                    <Area type="monotone" name="Melewati SLA (Telat)" dataKey="late_count" stroke="#F59E0B" strokeWidth={2} fillOpacity={1} fill="url(#colorLate)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center">
                                <AlertTriangle className="h-10 w-10 mb-2 opacity-50" />
                                <p>Belum ada data tren SLA di rentang waktu tersebut.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}
