import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { DashboardStats } from '@/types/logistics';
import { BarChart2 } from 'lucide-react';

interface AccuracyChartProps {
  stats: DashboardStats;
}

const COLORS = {
  accurate: 'hsl(142, 70%, 45%)',
  fairly: 'hsl(38, 92%, 50%)',
  inaccurate: 'hsl(0, 72%, 51%)',
};

export function AccuracyChart({ stats }: AccuracyChartProps) {
  const pieData = [
    { name: 'Akurat', value: stats.accurate, color: COLORS.accurate },
    { name: 'Cukup Akurat', value: stats.fairlyAccurate, color: COLORS.fairly },
    { name: 'Tidak Akurat', value: stats.inaccurate, color: COLORS.inaccurate },
  ].filter(d => d.value > 0);

  const barData = [
    {
      label: 'Akurat\n(0–50m)',
      value: stats.accurate,
      fill: COLORS.accurate,
    },
    {
      label: 'Cukup Akurat\n(50–100m)',
      value: stats.fairlyAccurate,
      fill: COLORS.fairly,
    },
    {
      label: 'Tidak Akurat\n(>100m)',
      value: stats.inaccurate,
      fill: COLORS.inaccurate,
    },
  ];

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
    if (active && payload && payload.length) {
      const d = payload[0];
      const total = stats.accurate + stats.fairlyAccurate + stats.inaccurate;
      const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
      return (
        <div className="rounded-lg border border-border px-3 py-2" style={{ background: 'hsl(var(--surface-1))' }}>
          <p className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{d.name}</p>
          <p className="text-sm font-mono font-bold mt-0.5" style={{ color: 'hsl(var(--primary))' }}>
            {d.value} data ({pct}%)
          </p>
        </div>
      );
    }
    return null;
  };

  const isEmpty = stats.accurate === 0 && stats.fairlyAccurate === 0 && stats.inaccurate === 0;

  return (
    <div className="section-card">
      <div className="p-5 border-b border-border flex items-center gap-2.5">
        <BarChart2 className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          Distribusi Akurasi
        </h2>
      </div>
      {isEmpty ? (
        <div className="py-16 text-center text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Belum ada data untuk ditampilkan
        </div>
      ) : (
        <div className="p-5 grid md:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Proporsi
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: 'hsl(var(--foreground))', fontSize: '11px' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Jumlah per Kategori
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--primary) / 0.05)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
