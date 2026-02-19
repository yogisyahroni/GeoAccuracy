import { useState, useCallback } from 'react';
import { StatsCards } from '@/components/StatsCards';
import { DataUpload } from '@/components/DataUpload';
import { ComparisonTable } from '@/components/ComparisonTable';
import { AccuracyChart } from '@/components/AccuracyChart';
import { ComparisonResult, DashboardStats, SystemRecord, FieldRecord } from '@/types/logistics';
import { geocodeAddress, haversineDistance, categorizeDistance } from '@/utils/geocoding';
import { Truck, Activity, RefreshCw, Info } from 'lucide-react';

const Index = () => {
  const [systemRecords, setSystemRecords] = useState<SystemRecord[]>([]);
  const [fieldRecords, setFieldRecords] = useState<FieldRecord[]>([]);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processLog, setProcessLog] = useState('');

  const stats: DashboardStats = {
    total: results.length,
    accurate: results.filter(r => r.category === 'accurate').length,
    fairlyAccurate: results.filter(r => r.category === 'fairly_accurate').length,
    inaccurate: results.filter(r => r.category === 'inaccurate').length,
    pending: results.filter(r => r.category === 'pending').length,
    error: results.filter(r => r.category === 'error').length,
  };

  const handleSystemDataLoad = useCallback((data: Record<string, string>[]) => {
    const mapped: SystemRecord[] = data
      .filter(row => row.connote || row.Connote || row.CONNOTE)
      .map(row => ({
        connote: (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim(),
        recipientName: row.recipient_name || row.Recipient_Name || row.nama_penerima || row.name || '',
        address: row.address || row.Address || row.alamat || '',
        city: row.city || row.City || row.kota || '',
        province: row.province || row.Province || row.provinsi || '',
        geocodeStatus: 'pending' as const,
      }));
    setSystemRecords(mapped);
    setResults([]);
  }, []);

  const handleFieldDataLoad = useCallback((data: Record<string, string>[]) => {
    const mapped: FieldRecord[] = data
      .filter(row => (row.connote || row.Connote || row.CONNOTE) && (row.lat || row.Lat) && (row.lng || row.Lng || row.lon || row.Lon))
      .map(row => ({
        connote: (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim(),
        lat: parseFloat(row.lat || row.Lat || row.latitude || '0'),
        lng: parseFloat(row.lng || row.Lng || row.lon || row.Lon || row.longitude || '0'),
        reportedBy: row.reported_by || row.tim || row.reporter || '',
        reportDate: row.report_date || row.tanggal || row.date || '',
      }));
    setFieldRecords(mapped);
    setResults([]);
  }, []);

  const handleProcess = async () => {
    if (systemRecords.length === 0 || fieldRecords.length === 0) return;

    setIsProcessing(true);
    setProcessLog('Memulai proses geocoding...');

    const fieldMap = new Map<string, FieldRecord>();
    fieldRecords.forEach(f => fieldMap.set(f.connote, f));

    // Initialize results with pending
    const initialResults: ComparisonResult[] = systemRecords.map(s => ({
      connote: s.connote,
      recipientName: s.recipientName,
      systemAddress: `${s.address}, ${s.city}, ${s.province}`,
      fieldLat: fieldMap.get(s.connote)?.lat,
      fieldLng: fieldMap.get(s.connote)?.lng,
      category: 'pending' as const,
      geocodeStatus: 'pending' as const,
    }));
    setResults([...initialResults]);

    // Process geocoding per row
    const finalResults = [...initialResults];

    for (let i = 0; i < systemRecords.length; i++) {
      const sys = systemRecords[i];
      const fieldData = fieldMap.get(sys.connote);

      setProcessLog(`Geocoding ${i + 1}/${systemRecords.length}: ${sys.connote}`);

      // Update to loading
      finalResults[i] = { ...finalResults[i], geocodeStatus: 'loading', category: 'pending' };
      setResults([...finalResults]);

      try {
        const geo = await geocodeAddress(sys.address, sys.city, sys.province);

        if (geo && fieldData) {
          const distance = haversineDistance(geo.lat, geo.lng, fieldData.lat, fieldData.lng);
          const category = categorizeDistance(distance);
          finalResults[i] = {
            ...finalResults[i],
            systemLat: geo.lat,
            systemLng: geo.lng,
            distanceMeters: distance,
            category,
            geocodeStatus: 'done',
          };
        } else if (geo && !fieldData) {
          finalResults[i] = {
            ...finalResults[i],
            systemLat: geo.lat,
            systemLng: geo.lng,
            category: 'error',
            geocodeStatus: 'done',
          };
        } else {
          finalResults[i] = {
            ...finalResults[i],
            category: 'error',
            geocodeStatus: 'error',
          };
        }
      } catch {
        finalResults[i] = {
          ...finalResults[i],
          category: 'error',
          geocodeStatus: 'error',
        };
      }

      setResults([...finalResults]);
    }

    setProcessLog('Selesai!');
    setIsProcessing(false);
  };

  const handleReset = () => {
    setSystemRecords([]);
    setFieldRecords([]);
    setResults([]);
    setProcessLog('');
  };

  const canProcess = systemRecords.length > 0 && fieldRecords.length > 0 && !isProcessing;

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* Navbar */}
      <header className="border-b border-border sticky top-0 z-40" style={{ background: 'hsl(var(--surface-1) / 0.95)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg" style={{ background: 'hsl(var(--primary) / 0.15)' }}>
              <Truck className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
            </div>
            <div>
              <h1 className="text-sm font-bold nav-logo-text">GeoAccuracy</h1>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Logistics Address Validator</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'hsl(142 70% 45% / 0.1)', color: 'hsl(142 70% 55%)', border: '1px solid hsl(142 70% 45% / 0.2)' }}>
              <Activity className="w-3 h-3" />
              Nominatim API
            </div>
            {results.length > 0 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border transition-colors"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6 space-y-5">
        {/* Info Banner */}
        <div className="rounded-xl border p-4 flex gap-3" style={{ background: 'hsl(var(--primary) / 0.05)', borderColor: 'hsl(var(--primary) / 0.2)' }}>
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
          <div className="text-xs space-y-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              Cara Penggunaan
            </p>
            <p>
              1. Upload CSV data sistem (berisi connote + alamat) &nbsp;→&nbsp;
              2. Upload CSV data lapangan (berisi connote + koordinat GPS) &nbsp;→&nbsp;
              3. Klik <strong style={{ color: 'hsl(var(--primary))' }}>Proses</strong> untuk geocoding & perbandingan otomatis
            </p>
            <p className="mt-1">
              Menggunakan <strong>Nominatim (OpenStreetMap)</strong> untuk geocoding · Batas 1 request/detik · 
              Untuk volume besar disarankan upgrade ke Google Maps API
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards stats={stats} />

        {/* Upload Section */}
        <DataUpload
          onSystemDataLoad={handleSystemDataLoad}
          onFieldDataLoad={handleFieldDataLoad}
          systemCount={systemRecords.length}
          fieldCount={fieldRecords.length}
        />

        {/* Process Button */}
        {(systemRecords.length > 0 || fieldRecords.length > 0) && (
          <div className="flex items-center gap-4">
            <button
              onClick={handleProcess}
              disabled={!canProcess}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: canProcess ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                color: canProcess ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
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
                  Proses Geocoding & Bandingkan
                </>
              )}
            </button>
            {processLog && (
              <span className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {processLog}
              </span>
            )}
            {!canProcess && !isProcessing && (
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {systemRecords.length === 0 && '⬆ Upload data sistem'}
                {systemRecords.length > 0 && fieldRecords.length === 0 && '⬆ Upload data lapangan'}
              </span>
            )}
          </div>
        )}

        {/* Charts */}
        {results.length > 0 && <AccuracyChart stats={stats} />}

        {/* Comparison Table */}
        <ComparisonTable results={results} />
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-10 py-4">
        <div className="max-w-7xl mx-auto px-5 text-center text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          GeoAccuracy · Logistics Address Validator · Geocoding via OpenStreetMap Nominatim
        </div>
      </footer>
    </div>
  );
};

export default Index;
