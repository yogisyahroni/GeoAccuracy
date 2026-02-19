import { useState, useCallback } from 'react';
import { StatsCards } from '@/components/StatsCards';
import { DataUpload } from '@/components/DataUpload';
import { ComparisonTable } from '@/components/ComparisonTable';
import { AccuracyChart } from '@/components/AccuracyChart';
import { DatabaseConnector } from '@/components/DatabaseConnector';
import { AddressColumnMapper, ColumnMapping } from '@/components/AddressColumnMapper';
import { ComparisonResult, DashboardStats, SystemRecord, FieldRecord } from '@/types/logistics';
import { geocodeAddress, haversineDistance, categorizeDistance } from '@/utils/geocoding';
import { Truck, Activity, RefreshCw, Info, BookOpen } from 'lucide-react';

const Index = () => {
  const [systemRecords, setSystemRecords] = useState<SystemRecord[]>([]);
  const [fieldRecords, setFieldRecords] = useState<FieldRecord[]>([]);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processLog, setProcessLog] = useState('');
  const [systemRawData, setSystemRawData] = useState<Record<string, string>[]>([]);
  const [systemColumns, setSystemColumns] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  const stats: DashboardStats = {
    total: results.length,
    accurate: results.filter(r => r.category === 'accurate').length,
    fairlyAccurate: results.filter(r => r.category === 'fairly_accurate').length,
    inaccurate: results.filter(r => r.category === 'inaccurate').length,
    pending: results.filter(r => r.category === 'pending').length,
    error: results.filter(r => r.category === 'error').length,
  };

  const handleSystemDataLoad = useCallback((data: Record<string, string>[]) => {
    // Detect columns
    if (data.length > 0) {
      setSystemColumns(Object.keys(data[0]));
      setSystemRawData(data);
    }

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

  // Build address using column mappings if configured, otherwise use defaults
  const buildAddressFromMapping = (rawRow: Record<string, string>, sysRecord: SystemRecord): string => {
    if (columnMappings.length > 0) {
      const m = columnMappings[0]; // Use first mapping for address column
      const parts = [
        m.col1 ? rawRow[m.col1] : '',
        m.col2 ? rawRow[m.col2] : '',
        m.col3 ? rawRow[m.col3] : '',
      ].filter(p => p && p.trim());
      return parts.join(m.separator);
    }
    return `${sysRecord.address}, ${sysRecord.city}, ${sysRecord.province}`;
  };

  const handleProcess = async () => {
    if (systemRecords.length === 0 || fieldRecords.length === 0) return;

    setIsProcessing(true);
    setProcessLog('Memulai proses geocoding...');

    const fieldMap = new Map<string, FieldRecord>();
    fieldRecords.forEach(f => fieldMap.set(f.connote, f));

    // Build raw data map for column mapping support
    const rawDataMap = new Map<string, Record<string, string>>();
    systemRawData.forEach(row => {
      const connote = (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim();
      if (connote) rawDataMap.set(connote, row);
    });

    // Initialize results with pending
    const initialResults: ComparisonResult[] = systemRecords.map(s => {
      const rawRow = rawDataMap.get(s.connote) || {};
      const systemAddress = buildAddressFromMapping(rawRow, s);
      return {
        connote: s.connote,
        recipientName: s.recipientName,
        systemAddress,
        fieldLat: fieldMap.get(s.connote)?.lat,
        fieldLng: fieldMap.get(s.connote)?.lng,
        category: 'pending' as const,
        geocodeStatus: 'pending' as const,
      };
    });
    setResults([...initialResults]);

    const finalResults = [...initialResults];

    for (let i = 0; i < systemRecords.length; i++) {
      const sys = systemRecords[i];
      const fieldData = fieldMap.get(sys.connote);
      const rawRow = rawDataMap.get(sys.connote) || {};

      setProcessLog(`Geocoding ${i + 1}/${systemRecords.length}: ${sys.connote}`);

      finalResults[i] = { ...finalResults[i], geocodeStatus: 'loading', category: 'pending' };
      setResults([...finalResults]);

      try {
        // Use mapped columns or fallback to default columns
        const addressStr = columnMappings.length > 0
          ? buildAddressFromMapping(rawRow, sys)
          : sys.address;
        const cityStr = columnMappings.length > 0 ? '' : sys.city;
        const provinceStr = columnMappings.length > 0 ? '' : sys.province;

        const geo = await geocodeAddress(addressStr, cityStr, provinceStr);

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
    setSystemRawData([]);
    setSystemColumns([]);
    setColumnMappings([]);
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
            <a
              href="/BACKEND_GUIDE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors"
              style={{ background: 'hsl(215 100% 60% / 0.1)', color: 'hsl(215 100% 60%)', border: '1px solid hsl(215 100% 60% / 0.2)' }}>
              <BookOpen className="w-3 h-3" />
              Backend Guide
            </a>
            <div className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'hsl(142 70% 45% / 0.1)', color: 'hsl(142 70% 55%)', border: '1px solid hsl(142 70% 45% / 0.2)' }}>
              <Activity className="w-3 h-3" />
              Nominatim API
            </div>
            {(results.length > 0 || systemRecords.length > 0) && (
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
              1. (Opsional) Konfigurasikan koneksi database &nbsp;→&nbsp;
              2. Upload CSV data sistem (connote + alamat) &nbsp;→&nbsp;
              3. Atur mapping kolom alamat jika perlu &nbsp;→&nbsp;
              4. Upload CSV data lapangan (connote + koordinat) &nbsp;→&nbsp;
              5. Klik <strong style={{ color: 'hsl(var(--primary))' }}>Proses</strong>
            </p>
            <p className="mt-1">
              Menggunakan <strong>Nominatim (OpenStreetMap)</strong> · Batas 1 req/detik ·
              Lihat <strong>Backend Guide</strong> untuk setup Golang + Google Maps API
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards stats={stats} />

        {/* Database Connector */}
        <DatabaseConnector />

        {/* Upload Section */}
        <DataUpload
          onSystemDataLoad={handleSystemDataLoad}
          onFieldDataLoad={handleFieldDataLoad}
          systemCount={systemRecords.length}
          fieldCount={fieldRecords.length}
        />

        {/* Address Column Mapper — shown after system data loaded */}
        {systemColumns.length > 0 && (
          <AddressColumnMapper
            availableColumns={systemColumns}
            onMappingChange={setColumnMappings}
            sampleRows={systemRawData.slice(0, 5)}
          />
        )}

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
          GeoAccuracy · Logistics Address Validator · Geocoding via OpenStreetMap Nominatim ·{' '}
          <a href="/BACKEND_GUIDE.md" target="_blank" rel="noopener noreferrer"
            style={{ color: 'hsl(var(--primary))' }}>
            Backend Guide (Golang)
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Index;
