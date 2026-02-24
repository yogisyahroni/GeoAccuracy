import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Truck, Activity, RefreshCw, Info, LogOut, User, AlertCircle, Columns } from 'lucide-react';
import { StatsCards } from '@/components/StatsCards';
import { DataUpload } from '@/components/DataUpload';
import { ComparisonTable } from '@/components/ComparisonTable';
import { AccuracyChart } from '@/components/AccuracyChart';
import { DatabaseConnector } from '@/components/DatabaseConnector';
import { AddressColumnMapper, ColumnMapping } from '@/components/AddressColumnMapper';
import { ComparisonResult, DashboardStats, SystemRecord, FieldRecord } from '@/types/logistics';
import { comparisonApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

// ─── Component ────────────────────────────────────────────────────────────────

const Index = () => {
  const navigate = useNavigate();
  const [systemRecords, setSystemRecords] = useState<SystemRecord[]>([]);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processLog, setProcessLog] = useState('');
  const [processError, setProcessError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [systemRawData, setSystemRawData] = useState<Record<string, string>[]>([]);
  const [systemColumns, setSystemColumns] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // New field mapping states
  const [fieldRawData, setFieldRawData] = useState<Record<string, string>[]>([]);
  const [fieldColumns, setFieldColumns] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<{ id: string; lat: string; lng: string }>({ id: '', lat: '', lng: '' });

  const [mappingSource, setMappingSource] = useState<'system' | 'field'>('system');

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats: DashboardStats = {
    total: results.length,
    accurate: results.filter((r) => r.category === 'accurate').length,
    fairlyAccurate: results.filter((r) => r.category === 'fairly_accurate').length,
    inaccurate: results.filter((r) => r.category === 'inaccurate').length,
    pending: results.filter((r) => r.category === 'pending').length,
    error: results.filter((r) => r.category === 'error').length,
  };

  // ── Upload handlers ────────────────────────────────────────────────────────

  const handleSystemDataLoad = useCallback((data: Record<string, string>[]) => {
    if (data.length > 0) {
      setSystemColumns(Object.keys(data[0]));
      setSystemRawData(data);
    } else {
      setSystemColumns([]);
      setSystemRawData([]);
    }
    const mapped: SystemRecord[] = data
      .filter((row) => row.connote || row.Connote || row.CONNOTE)
      .map((row) => ({
        connote: (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim(),
        recipientName: row.recipient_name || row.Recipient_Name || row.nama_penerima || row.name || '',
        address: row.address || row.Address || row.alamat || '',
        city: row.city || row.City || row.kota || '',
        province: row.province || row.Province || row.provinsi || '',
        geocodeStatus: 'pending' as const,
      }));
    setSystemRecords(mapped);
    setResults([]);
    setProcessError(null);
    setMappingSource('system');
  }, []);

  const handleFieldDataLoad = useCallback((data: Record<string, string>[]) => {
    if (data.length > 0) {
      setFieldColumns(Object.keys(data[0]));
      setFieldRawData(data);
      // Auto-detect common column names
      const cols = Object.keys(data[0]);
      const idCol = cols.find(c => /connote|id|resi|no/i.test(c)) || cols[0] || '';
      const latCol = cols.find(c => /lat|latitude|y/i.test(c)) || '';
      const lngCol = cols.find(c => /lng|lon|longitude|x/i.test(c)) || '';
      setFieldMapping({ id: idCol, lat: latCol, lng: lngCol });
    } else {
      setFieldColumns([]);
      setFieldRawData([]);
    }
    setResults([]);
    setProcessError(null);
    setMappingSource('field');
  }, []);

  // ── Address builder (with optional column mapping) ─────────────────────────

  const buildAddress = (
    rawRow: Record<string, string>,
    sys: SystemRecord,
  ): string => {
    if (columnMappings.length > 0) {
      const m = columnMappings[0];
      const parts = [
        m.col1 ? rawRow[m.col1] : '',
        m.col2 ? rawRow[m.col2] : '',
        m.col3 ? rawRow[m.col3] : '',
      ].filter((p) => p && p.trim());
      return parts.join(m.separator);
    }
    return `${sys.address}, ${sys.city}, ${sys.province}`;
  };

  // ── Process — calls Go backend /api/compare ────────────────────────────────

  const handleProcess = async () => {
    if (systemRecords.length === 0 || fieldRawData.length === 0) return;
    if (!fieldMapping.id || !fieldMapping.lat || !fieldMapping.lng) {
      toast.error('Silakan petakan kolom ID, Latitude, dan Longitude untuk Data Lapangan terlebih dahulu.');
      return;
    }

    setIsProcessing(true);
    setProcessError(null);
    setProcessLog('Mengirim data ke backend...');

    // Build field map for O(1) lookup using mapped columns
    const fieldMap = new Map<string, { lat: number, lng: number }>();
    fieldRawData.forEach((row) => {
      const id = (row[fieldMapping.id] || '').toUpperCase().trim();
      if (id) {
        fieldMap.set(id, {
          lat: parseFloat(row[fieldMapping.lat] || '0'),
          lng: parseFloat(row[fieldMapping.lng] || '0')
        });
      }
    });

    // Build raw data map for column-mapping support
    const rawDataMap = new Map<string, Record<string, string>>();
    systemRawData.forEach((row) => {
      const connote = (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim();
      if (connote) rawDataMap.set(connote, row);
    });

    // Build payload — only include records that have a field counterpart
    const items = systemRecords
      .map((sys) => {
        const rawRow = rawDataMap.get(sys.connote) ?? {};
        const fieldData = fieldMap.get(sys.connote);
        if (!fieldData) return null;
        return {
          id: sys.connote,
          system_address: buildAddress(rawRow, sys),
          field_lat: fieldData.lat,
          field_lng: fieldData.lng,
        };
      })
      .filter((r) => r !== null) as any[];

    // Records with no field counterpart get error category immediately
    const noFieldResults: ComparisonResult[] = systemRecords
      .filter((sys) => !fieldMap.has(sys.connote))
      .map((sys) => ({
        connote: sys.connote,
        recipientName: sys.recipientName,
        systemAddress: buildAddress(rawDataMap.get(sys.connote) ?? {}, sys),
        category: 'error' as const,
        geocodeStatus: 'error' as const,
      }));

    if (items.length === 0) {
      setResults(noFieldResults);
      setProcessLog('Tidak ada data lapangan yang cocok dengan data sistem.');
      setIsProcessing(false);
      return;
    }

    try {
      setProcessLog(`Memproses ${items.length} record via Go backend...`);
      const res = await comparisonApi.compareBatch({ items } as any);

      // Map backend results back to frontend ComparisonResult shape
      const backendResults: ComparisonResult[] = res.results.map((item) => {
        const sys = systemRecords.find((s) => s.connote === item.id);
        return {
          connote: item.id,
          recipientName: sys?.recipientName || '',
          systemAddress: item.system_address,
          systemLat: item.geo_lat,
          systemLng: item.geo_lng,
          fieldLat: item.field_lat,
          fieldLng: item.field_lng,
          distanceMeters: item.distance_km * 1000,
          category: item.accuracy_level as any || 'error',
          geocodeStatus: item.error ? 'error' : 'done',
        };
      });

      setResults([...backendResults, ...noFieldResults]);
      setProcessLog(`Selesai memproses ${res.results.length} record.`);
      toast.success(`Selesai memproses ${res.results.length} record.`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) {
          const msg = 'Tidak dapat menghubungi backend. Pastikan server Go berjalan di port 8080.';
          setProcessError(msg);
          toast.error(msg);
        } else if (err.status === 401) {
          toast.error('Sesi Anda telah berakhir. Silakan masuk kembali.');
          logout();
          navigate('/login');
        } else {
          setProcessError(`Error dari backend: ${err.message}`);
          toast.error(err.message);
        }
      } else {
        const msg = 'Terjadi kesalahan tak terduga saat memproses.';
        setProcessError(msg);
        toast.error(msg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Reset ──────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setSystemRecords([]);
    setFieldRawData([]);
    setFieldColumns([]);
    setResults([]);
    setProcessLog('');
    setProcessError(null);
    setSystemRawData([]);
    setSystemColumns([]);
    setColumnMappings([]);
    setFieldMapping({ id: '', lat: '', lng: '' });
  };

  // ── Logout ─────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
    toast.success('Anda telah keluar.');
  };

  const canProcess = systemRecords.length > 0 && fieldRawData.length > 0 && !isProcessing;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header
        className="border-b border-border sticky top-0 z-40"
        style={{ background: 'hsl(var(--surface-1, var(--card)) / 0.95)', backdropFilter: 'blur(12px)' }}
      >
        <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg" style={{ background: 'hsl(var(--primary) / 0.15)' }}>
              <Truck className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
            </div>
            <div>
              <h1 className="text-sm font-bold nav-logo-text">GeoAccuracy</h1>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Logistics Address Validator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Backend status badge */}
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{
                background: 'hsl(142 70% 45% / 0.1)',
                color: 'hsl(142 70% 55%)',
                border: '1px solid hsl(142 70% 45% / 0.2)',
              }}
            >
              <Activity className="w-3 h-3" />
              Go Backend
            </div>

            {/* User badge */}
            {user && (
              <div
                className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                style={{
                  background: 'hsl(var(--primary) / 0.1)',
                  color: 'hsl(var(--primary))',
                  border: '1px solid hsl(var(--primary) / 0.2)',
                }}
              >
                <User className="w-3 h-3" />
                {user.name}
              </div>
            )}

            {/* Reset button */}
            {(results.length > 0 || systemRecords.length > 0) && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6 space-y-5">
        {/* ── Info Banner ──────────────────────────────────────────────────── */}
        <div
          className="rounded-xl border p-4 flex gap-3"
          style={{
            background: 'hsl(var(--primary) / 0.05)',
            borderColor: 'hsl(var(--primary) / 0.2)',
          }}
        >
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
          <div className="text-xs space-y-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              Cara Penggunaan
            </p>
            <p>
              1. (Opsional) Konfigurasikan koneksi database &nbsp;→&nbsp;
              2. Upload CSV data sistem (connote + alamat) &nbsp;→&nbsp;
              3. Atur mapping kolom alamat jika perlu &nbsp;→&nbsp;
              4. Upload CSV data lapangan (connote + koordinat) &nbsp;→&nbsp;
              5. Klik <strong style={{ color: 'hsl(var(--primary))' }}>Proses</strong>
            </p>
            <p className="mt-1">
              Geocoding diproses oleh <strong>Go backend</strong> — mendukung caching Redis &amp;
              fallback Nominatim.
            </p>
          </div>
        </div>

        {/* ── Stats Cards ───────────────────────────────────────────────────── */}
        <StatsCards stats={stats} />

        {/* ── Database Connector ────────────────────────────────────────────── */}
        <DatabaseConnector />

        {/* ── Data Upload ───────────────────────────────────────────────────── */}
        <DataUpload
          onSystemDataLoad={handleSystemDataLoad}
          onFieldDataLoad={handleFieldDataLoad}
          systemCount={systemRecords.length}
          fieldCount={fieldRawData.length}
        />

        {/* ── Unified Data Mapping ──────────────────────────────────────────── */}
        {(systemColumns.length > 0 || fieldColumns.length > 0) && (
          <div className="section-card flex flex-col">
            {/* Header Tabs */}
            <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-4" style={{ background: 'hsl(var(--surface-2))' }}>
              <div className="flex items-center gap-2.5">
                <Columns className="w-4.5 h-4.5" style={{ color: 'hsl(var(--primary))' }} />
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    Konfigurasi Mapping
                  </h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Petakan kolom untuk memproses data.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Pilih Data:</label>
                <div className="relative">
                  <select
                    value={mappingSource}
                    onChange={(e) => setMappingSource(e.target.value as 'system' | 'field')}
                    className="appearance-none text-sm px-4 py-2 pr-8 rounded-lg outline-none transition-all cursor-pointer font-medium"
                    style={{
                      background: 'hsl(var(--surface-1))',
                      border: '1px solid hsl(var(--primary) / 0.5)',
                      color: 'hsl(var(--primary))',
                      boxShadow: '0 2px 10px hsl(var(--primary) / 0.1)',
                    }}
                  >
                    <option value="system" disabled={systemColumns.length === 0}>Data Sistem (Alamat)</option>
                    <option value="field" disabled={fieldColumns.length === 0}>Data Lapangan (Koordinat)</option>
                  </select>
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--primary))' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 flex flex-col">
              {/* Mapping Sistem */}
              <div className={mappingSource === 'system' ? 'block' : 'hidden'}>
                {systemColumns.length > 0 ? (
                  <AddressColumnMapper
                    availableColumns={systemColumns}
                    onMappingChange={setColumnMappings}
                    sampleRows={systemRawData.slice(0, 5)}
                  />
                ) : (
                  <div className="p-8 text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <p className="text-sm">Silakan upload Data Sistem terlebih dahulu.</p>
                  </div>
                )}
              </div>

              {/* Mapping Lapangan */}
              <div className={mappingSource === 'field' ? 'block' : 'hidden'}>
                {fieldColumns.length > 0 ? (
                  <>
                    <div className="p-5 border-b border-border">
                      <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        Mapping Kolom Lapangan
                      </h2>
                      <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Pilih kolom yang berisi ID (Connote) serta Latitude & Longitude dari Data Lapangan agar dapat dibandingkan.
                      </p>
                    </div>
                    <div className="p-5">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'hsl(var(--foreground))' }}>1. Kolom ID (Connote / Resi)</label>
                          <select
                            className="w-full border rounded-lg text-sm px-3 py-2 cursor-pointer transition-colors hover:brightness-110"
                            style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            value={fieldMapping.id}
                            onChange={e => setFieldMapping(m => ({ ...m, id: e.target.value }))}
                          >
                            <option value="">-- Pilih kolom --</option>
                            {fieldColumns.map(c => <option key={`id-${c}`} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'hsl(var(--foreground))' }}>2. Kolom Latitude</label>
                          <select
                            className="w-full border rounded-lg text-sm px-3 py-2 cursor-pointer transition-colors hover:brightness-110"
                            style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            value={fieldMapping.lat}
                            onChange={e => setFieldMapping(m => ({ ...m, lat: e.target.value }))}
                          >
                            <option value="">-- Pilih kolom --</option>
                            {fieldColumns.map(c => <option key={`lat-${c}`} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'hsl(var(--foreground))' }}>3. Kolom Longitude</label>
                          <select
                            className="w-full border rounded-lg text-sm px-3 py-2 cursor-pointer transition-colors hover:brightness-110"
                            style={{ background: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            value={fieldMapping.lng}
                            onChange={e => setFieldMapping(m => ({ ...m, lng: e.target.value }))}
                          >
                            <option value="">-- Pilih kolom --</option>
                            {fieldColumns.map(c => <option key={`lng-${c}`} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <p className="text-sm">Silakan upload Data Lapangan terlebih dahulu.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Process Button ────────────────────────────────────────────────── */}
        {(systemRecords.length > 0 || fieldRawData.length > 0) && (
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleProcess}
              disabled={!canProcess}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
              style={{
                background: canProcess ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                color: canProcess
                  ? 'hsl(var(--primary-foreground))'
                  : 'hsl(var(--muted-foreground))',
                boxShadow: canProcess ? '0 0 20px hsl(var(--primary) / 0.3)' : 'none',
              }}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  Proses &amp; Bandingkan
                </>
              )}
            </button>

            {processLog && !processError && (
              <span className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {processLog}
              </span>
            )}

            {!canProcess && !isProcessing && (
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {systemRecords.length === 0 && '⬆ Upload data sistem'}
                {systemRecords.length > 0 && fieldRawData.length === 0 && '⬆ Upload data lapangan'}
              </span>
            )}
          </div>
        )}

        {/* ── Process Error Banner ──────────────────────────────────────────── */}
        {processError && (
          <div
            className="rounded-xl border p-4 flex gap-3"
            style={{
              background: 'hsl(var(--destructive) / 0.05)',
              borderColor: 'hsl(var(--destructive) / 0.3)',
            }}
          >
            <AlertCircle
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              style={{ color: 'hsl(var(--destructive))' }}
            />
            <div>
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--destructive))' }}>
                Gagal Memproses
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {processError}
              </p>
            </div>
          </div>
        )}

        {/* ── Charts ────────────────────────────────────────────────────────── */}
        {results.length > 0 && <AccuracyChart stats={stats} />}

        {/* ── Comparison Table ──────────────────────────────────────────────── */}
        <ComparisonTable results={results} />
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border mt-10 py-4">
        <div
          className="max-w-7xl mx-auto px-5 text-center text-xs"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          GeoAccuracy · Logistics Address Validator · Geocoding via Go Backend + Nominatim
        </div>
      </footer>
    </div>
  );
};

export default Index;
