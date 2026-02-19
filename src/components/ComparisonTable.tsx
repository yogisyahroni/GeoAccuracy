import { ComparisonResult, AccuracyCategory } from '@/types/logistics';
import { formatDistance } from '@/utils/geocoding';
import { Download, Search, MapPin, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { downloadCSV } from '@/utils/geocoding';

interface ComparisonTableProps {
  results: ComparisonResult[];
}

const CATEGORY_LABELS: Record<AccuracyCategory, string> = {
  accurate: 'Akurat',
  fairly_accurate: 'Cukup Akurat',
  inaccurate: 'Tidak Akurat',
  pending: 'Menunggu',
  error: 'Error',
};

function AccuracyBadge({ category }: { category: AccuracyCategory }) {
  if (category === 'accurate') return <span className="badge-accurate">✓ Akurat</span>;
  if (category === 'fairly_accurate') return <span className="badge-fairly">⚠ Cukup Akurat</span>;
  if (category === 'inaccurate') return <span className="badge-inaccurate">✗ Tidak Akurat</span>;
  if (category === 'pending') return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
      <Loader2 className="w-3 h-3 animate-spin" /> Memproses
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(0 72% 60%)' }}>
      <AlertTriangle className="w-3 h-3" /> Gagal
    </span>
  );
}

export function ComparisonTable({ results }: ComparisonTableProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AccuracyCategory | 'all'>('all');
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const filtered = results.filter(r => {
    const matchSearch = search === '' ||
      r.connote.toLowerCase().includes(search.toLowerCase()) ||
      r.recipientName.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || r.category === filter;
    return matchSearch && matchFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleExport = () => {
    const exportData = results.map(r => ({
      connote: r.connote,
      recipient_name: r.recipientName,
      system_address: r.systemAddress,
      system_lat: r.systemLat,
      system_lng: r.systemLng,
      field_lat: r.fieldLat,
      field_lng: r.fieldLng,
      distance_meters: r.distanceMeters !== undefined ? Math.round(r.distanceMeters) : '',
      category: CATEGORY_LABELS[r.category],
    }));
    downloadCSV(exportData, `logistik-akurasi-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const filterButtons: { label: string; value: AccuracyCategory | 'all' }[] = [
    { label: 'Semua', value: 'all' },
    { label: 'Akurat', value: 'accurate' },
    { label: 'Cukup Akurat', value: 'fairly_accurate' },
    { label: 'Tidak Akurat', value: 'inaccurate' },
    { label: 'Error', value: 'error' },
  ];

  return (
    <div className="section-card">
      {/* Header */}
      <div className="p-5 border-b border-border flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(var(--primary))' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            Hasil Perbandingan
          </h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(var(--surface-3))', color: 'hsl(var(--muted-foreground))' }}>
            {filtered.length} data
          </span>
        </div>
        <div className="flex items-center gap-2">
          {results.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border transition-colors"
              style={{ color: 'hsl(var(--primary))', borderColor: 'hsl(var(--primary) / 0.3)' }}
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 pt-4 pb-3 flex flex-wrap gap-2 items-center border-b border-border">
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <input
            type="text"
            placeholder="Cari connote / nama..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-transparent outline-none"
            style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {filterButtons.map(btn => (
            <button
              key={btn.value}
              onClick={() => { setFilter(btn.value); setPage(1); }}
              className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
              style={{
                background: filter === btn.value ? 'hsl(var(--primary) / 0.15)' : 'transparent',
                borderColor: filter === btn.value ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--border))',
                color: filter === btn.value ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full data-table">
          <thead>
            <tr>
              <th className="px-5 py-3 text-left">No</th>
              <th className="px-4 py-3 text-left">Connote / Resi</th>
              <th className="px-4 py-3 text-left">Nama Penerima</th>
              <th className="px-4 py-3 text-left">Alamat Sistem</th>
              <th className="px-4 py-3 text-left">Koordinat Sistem</th>
              <th className="px-4 py-3 text-left">Koordinat Lapangan</th>
              <th className="px-4 py-3 text-left">Jarak</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {results.length === 0
                    ? 'Upload data sistem dan lapangan untuk melihat perbandingan'
                    : 'Tidak ada data yang sesuai filter'}
                </td>
              </tr>
            ) : (
              paginated.map((row, idx) => (
                <tr key={row.connote}>
                  <td className="px-5 py-3 text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {(page - 1) * PER_PAGE + idx + 1}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-medium" style={{ color: 'hsl(var(--primary))' }}>
                      {row.connote}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[140px] truncate" title={row.recipientName}>
                    {row.recipientName || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[180px] truncate" title={row.systemAddress}>
                    {row.systemAddress || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {row.systemLat && row.systemLng ? (
                      <span className="font-mono text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {row.systemLat.toFixed(5)}, {row.systemLng.toFixed(5)}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {row.geocodeStatus === 'loading' ? (
                          <Loader2 className="w-3 h-3 animate-spin inline" />
                        ) : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.fieldLat && row.fieldLng ? (
                      <span className="font-mono text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {row.fieldLat.toFixed(5)}, {row.fieldLng.toFixed(5)}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.distanceMeters !== undefined ? (
                      <span className="font-mono text-xs font-medium" style={{
                        color: row.category === 'accurate'
                          ? 'hsl(142 70% 55%)'
                          : row.category === 'fairly_accurate'
                            ? 'hsl(38 92% 60%)'
                            : 'hsl(0 72% 65%)'
                      }}>
                        {formatDistance(row.distanceMeters)}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <AccuracyBadge category={row.category} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-1.5">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="text-xs px-3 py-1 rounded border border-border disabled:opacity-40 transition-colors"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              ← Prev
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="text-xs px-3 py-1 rounded border border-border disabled:opacity-40 transition-colors"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
