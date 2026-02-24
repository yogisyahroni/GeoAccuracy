import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Activity, RefreshCw, Info, AlertCircle, Columns } from 'lucide-react';
import { StatsCards } from '@/components/StatsCards';
import { DataUpload } from '@/components/DataUpload';
import { ComparisonTable } from '@/components/ComparisonTable';
import { AccuracyChart } from '@/components/AccuracyChart';
import { DatabaseConnector } from '@/components/DatabaseConnector';
import { AddressColumnMapper, ColumnMapping } from '@/components/AddressColumnMapper';
import { ComparisonResult, DashboardStats, SystemRecord, FieldRecord } from '@/types/logistics';
import { comparisonApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const Dashboard = () => {
    const navigate = useNavigate();
    const logout = useAuthStore(s => s.logout);
    const user = useAuthStore(s => s.user);
    const isObserver = user?.role === 'observer';

    const [systemRecords, setSystemRecords] = useState<SystemRecord[]>([]);
    const [fieldRecords, setFieldRecords] = useState<FieldRecord[]>([]);
    const [results, setResults] = useState<ComparisonResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processLog, setProcessLog] = useState('');
    const [processError, setProcessError] = useState<string | null>(null);
    const [systemRawData, setSystemRawData] = useState<Record<string, string>[]>([]);
    const [systemColumns, setSystemColumns] = useState<string[]>([]);
    const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

    const [fieldRawData, setFieldRawData] = useState<Record<string, string>[]>([]);
    const [fieldColumns, setFieldColumns] = useState<string[]>([]);
    const [fieldMapping, setFieldMapping] = useState<{ id: string; lat: string; lng: string }>({ id: '', lat: '', lng: '' });
    const [mappingSource, setMappingSource] = useState<'system' | 'field'>('system');

    const stats: DashboardStats = {
        total: results.length,
        accurate: results.filter(r => r.category === 'accurate').length,
        fairlyAccurate: results.filter(r => r.category === 'fairly_accurate').length,
        inaccurate: results.filter(r => r.category === 'inaccurate').length,
        pending: results.filter(r => r.category === 'pending').length,
        error: results.filter(r => r.category === 'error').length,
    };

    const handleSystemDataLoad = useCallback((data: Record<string, string>[]) => {
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
        setProcessError(null);
        setMappingSource('system');
    }, []);

    const handleFieldDataLoad = useCallback((data: Record<string, string>[]) => {
        const mapped: FieldRecord[] = data
            .filter(row =>
                (row.connote || row.Connote || row.CONNOTE) &&
                (row.lat || row.Lat) &&
                (row.lng || row.Lng || row.lon || row.Lon),
            )
            .map(row => ({
                connote: (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim(),
                lat: parseFloat(row.lat || row.Lat || row.latitude || '0'),
                lng: parseFloat(row.lng || row.Lng || row.lon || row.Lon || row.longitude || '0'),
                reportedBy: row.reported_by || row.tim || row.reporter || '',
                reportDate: row.report_date || row.tanggal || row.date || '',
            }));
        setFieldRecords(mapped);

        if (data.length > 0) {
            setFieldColumns(Object.keys(data[0]));
            setFieldRawData(data);
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

    const handleProcess = async () => {
        if (systemRecords.length === 0 || fieldRecords.length === 0) return;
        if (!fieldMapping.id || !fieldMapping.lat || !fieldMapping.lng) {
            toast.error('Silakan petakan kolom ID, Latitude, dan Longitude untuk Data Lapangan terlebih dahulu.');
            return;
        }

        setIsProcessing(true);
        setProcessError(null);
        setProcessLog('Mengirim data ke backend...');

        const fieldMap = new Map<string, { lat: number, lng: number, rawRow: Record<string, string> }>();
        fieldRawData.forEach((row) => {
            const id = (row[fieldMapping.id] || '').toUpperCase().trim();
            if (id) {
                fieldMap.set(id, {
                    lat: parseFloat(row[fieldMapping.lat] || '0'),
                    lng: parseFloat(row[fieldMapping.lng] || '0'),
                    rawRow: row
                });
            }
        });

        const rawDataMap = new Map<string, Record<string, string>>();
        systemRawData.forEach((row) => {
            const connote = (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim();
            if (connote) rawDataMap.set(connote, row);
        });

        const getGeocodeAddress = (sysRawRow: Record<string, string>, fieldRawRow: Record<string, string> | null, sys: SystemRecord) => {
            if (columnMappings.length > 0) {
                const m = columnMappings[0];
                const rowData = m.source === 'system' ? sysRawRow : (fieldRawRow || {});
                const parts = [
                    m.col1 ? rowData[m.col1] : '',
                    m.col2 ? rowData[m.col2] : '',
                    m.col3 ? rowData[m.col3] : '',
                ].filter((p) => p && p.trim());
                return parts.join(m.separator);
            }
            return `${sys.address}, ${sys.city}, ${sys.province}`;
        };

        const items = systemRecords
            .map((sys) => {
                const sysRawRow = rawDataMap.get(sys.connote) ?? {};
                const fieldData = fieldMap.get(sys.connote);
                if (!fieldData) return null;

                return {
                    id: sys.connote,
                    system_address: getGeocodeAddress(sysRawRow, fieldData.rawRow, sys),
                    field_lat: fieldData.lat,
                    field_lng: fieldData.lng,
                };
            })
            .filter((r) => r !== null) as any[];

        const noFieldResults: ComparisonResult[] = systemRecords
            .filter((sys) => !fieldMap.has(sys.connote))
            .map((sys) => ({
                connote: sys.connote,
                recipientName: sys.recipientName,
                systemAddress: getGeocodeAddress(rawDataMap.get(sys.connote) ?? {}, null, sys),
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
                    category: (item.accuracy_level as any) || 'error',
                    geocodeStatus: item.error ? 'error' : 'done',
                };
            });

            setResults([...backendResults, ...noFieldResults]);
            setProcessLog(`Selesai memproses ${res.results.length} record.`);
            toast.success(`Selesai memproses ${res.results.length} record.`);
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 0) {
                    const msg = 'Tidak dapat menghubungi backend. Pastikan server Go berjalan.';
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

    const handleReset = () => {
        setSystemRecords([]);
        setFieldRecords([]);
        setResults([]);
        setProcessLog('');
        setProcessError(null);
        setSystemRawData([]);
        setSystemColumns([]);
        setColumnMappings([]);
        setFieldRawData([]);
        setFieldColumns([]);
        setFieldMapping({ id: '', lat: '', lng: '' });
    };

    const canProcess = systemRecords.length > 0 && fieldRecords.length > 0 && !isProcessing;

    return (
        <div className="p-5 space-y-5 max-w-7xl mx-auto">
            {/* Info Banner */}
            <div
                className="rounded-xl border p-4 flex gap-3"
                style={{ background: 'hsl(var(--primary) / 0.05)', borderColor: 'hsl(var(--primary) / 0.2)' }}
            >
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
                <div className="text-xs space-y-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>Cara Penggunaan</p>
                    <p>
                        1. Upload CSV/Excel data sistem →&nbsp;
                        2. Atur mapping kolom alamat →&nbsp;
                        3. Upload data lapangan →&nbsp;
                        4. Klik <strong style={{ color: 'hsl(var(--primary))' }}>Proses</strong>
                    </p>
                    <p className="mt-1">
                        Geocoding diproses oleh <strong>Go backend</strong> — Nominatim geocoder dengan caching.
                    </p>
                </div>
            </div>

            {/* Observer Restriction Banner */}
            {isObserver && (
                <div
                    className="rounded-xl border p-4 flex gap-3"
                    style={{ background: 'hsl(var(--destructive) / 0.05)', borderColor: 'hsl(var(--destructive) / 0.3)' }}
                >
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
                    <div className="text-xs space-y-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <p className="font-medium" style={{ color: 'hsl(var(--destructive))' }}>Mode Akses Terbatas (Observer)</p>
                        <p>
                            Sebagai Observer, Anda hanya diizinkan untuk melihat laporan analitik dan riwayat. Fitur unggah data dan integrasi konektor dinonaktifkan.
                        </p>
                    </div>
                </div>
            )}

            {/* Stats */}
            <StatsCards stats={stats} />

            {/* Database Connector */}
            {!isObserver && <DatabaseConnector />}

            {/* Data Upload */}
            {!isObserver && (
                <DataUpload
                    onSystemDataLoad={handleSystemDataLoad}
                    onFieldDataLoad={handleFieldDataLoad}
                    systemCount={systemRecords.length}
                    fieldCount={fieldRecords.length}
                />
            )}

            {/* Column Mapper */}
            {(systemColumns.length > 0 || fieldColumns.length > 0) && (
                <div className="section-card">
                    <div className="p-3 border-b border-border flex items-center gap-2" style={{ background: 'hsl(var(--surface-2))' }}>
                        <button
                            onClick={() => setMappingSource('system')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mappingSource === 'system' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
                            style={{ color: mappingSource === 'system' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                        >
                            Data Sistem ({systemColumns.length} kolom)
                        </button>
                        <button
                            onClick={() => setMappingSource('field')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mappingSource === 'field' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
                            style={{ color: mappingSource === 'field' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                        >
                            Data Lapangan ({fieldColumns.length} kolom)
                        </button>
                    </div>

                    <div className="p-1">
                        {/* Mapping Sistem */}
                        <div className={mappingSource === 'system' ? 'block' : 'hidden'}>
                            {systemColumns.length > 0 || fieldColumns.length > 0 ? (
                                <AddressColumnMapper
                                    systemColumns={systemColumns}
                                    fieldColumns={fieldColumns}
                                    onMappingChange={setColumnMappings}
                                    systemSampleRows={systemRawData.slice(0, 5)}
                                    fieldSampleRows={fieldRawData.slice(0, 5)}
                                />
                            ) : (
                                <div className="p-8 text-center bg-transparent border-none">
                                    <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                    <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload data sistem terlebih dahulu untuk mapping kolom alamat.</p>
                                </div>
                            )}
                        </div>

                        {/* Mapping Lapangan */}
                        <div className={mappingSource === 'field' ? 'block' : 'hidden'}>
                            {fieldColumns.length > 0 ? (
                                <div className="p-5 border-t border-border mt-[-1px]">
                                    <div className="flex items-center gap-2.5 mb-4">
                                        <Columns className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                                        <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                            Mapping Data Lapangan (ID, Lat, Lng)
                                        </h2>
                                    </div>
                                    <p className="text-xs mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Pilih kolom dari Data Lapangan yang merepresentasikan ID (Connote), Latitude, dan Longitude.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>Kolom ID (Connote)</label>
                                            <select
                                                value={fieldMapping.id}
                                                onChange={e => setFieldMapping({ ...fieldMapping, id: e.target.value })}
                                                className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                                                style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}
                                            >
                                                <option value="" disabled>Pilih Kolom ID</option>
                                                {fieldColumns.map(col => (
                                                    <option key={col} value={col}>{col}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>Kolom Latitude</label>
                                            <select
                                                value={fieldMapping.lat}
                                                onChange={e => setFieldMapping({ ...fieldMapping, lat: e.target.value })}
                                                className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                                                style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}
                                            >
                                                <option value="" disabled>Pilih Kolom Latitude</option>
                                                {fieldColumns.map(col => (
                                                    <option key={col} value={col}>{col}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>Kolom Longitude</label>
                                            <select
                                                value={fieldMapping.lng}
                                                onChange={e => setFieldMapping({ ...fieldMapping, lng: e.target.value })}
                                                className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                                                style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}
                                            >
                                                <option value="" disabled>Pilih Kolom Longitude</option>
                                                {fieldColumns.map(col => (
                                                    <option key={col} value={col}>{col}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 text-center bg-transparent border-none">
                                    <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                    <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload data lapangan terlebih dahulu untuk mapping kolom.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Process + Reset Buttons */}
            {(systemRecords.length > 0 || fieldRecords.length > 0) && (
                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={handleProcess}
                        disabled={!canProcess}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
                        style={{
                            background: canProcess ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                            color: canProcess ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                            boxShadow: canProcess ? '0 0 20px hsl(var(--primary) / 0.3)' : 'none',
                        }}
                    >
                        {isProcessing ? (
                            <><RefreshCw className="w-4 h-4 animate-spin" />Memproses...</>
                        ) : (
                            <><Activity className="w-4 h-4" />Proses &amp; Bandingkan</>
                        )}
                    </button>

                    {(results.length > 0 || systemRecords.length > 0) && (
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border transition-all hover:brightness-110 active:scale-[0.98]"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                            <RefreshCw className="w-3.5 h-3.5" />Reset
                        </button>
                    )}

                    {processLog && !processError && (
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

            {/* Error Banner */}
            {processError && (
                <div
                    className="rounded-xl border p-4 flex gap-3"
                    style={{ background: 'hsl(var(--destructive) / 0.05)', borderColor: 'hsl(var(--destructive) / 0.3)' }}
                >
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
                    <div>
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--destructive))' }}>Gagal Memproses</p>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{processError}</p>
                    </div>
                </div>
            )}

            {/* Charts */}
            {results.length > 0 && <AccuracyChart stats={stats} />}

            {/* Results Table */}
            <ComparisonTable results={results} />
        </div>
    );
};

export default Dashboard;
