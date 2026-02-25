import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Activity, RefreshCw, Info, AlertCircle } from 'lucide-react';
import { StatsCards } from '@/components/StatsCards';
import { DataUpload } from '@/components/DataUpload';
import { ComparisonTable } from '@/components/ComparisonTable';
import { AccuracyChart } from '@/components/AccuracyChart';
import { DatabaseConnector } from '@/components/DatabaseConnector';
import { AddressColumnMapper, ColumnMapping } from '@/components/AddressColumnMapper';
import { ComparisonResult, DashboardStats, SystemRecord, FieldRecord } from '@/types/logistics';
import { comparisonApi, batchApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useSessionState } from '@/hooks/useSessionState';

const Dashboard = () => {
    const navigate = useNavigate();
    const logout = useAuthStore(s => s.logout);
    const user = useAuthStore(s => s.user);
    const isObserver = user?.role === 'observer';

    const [systemRecords, setSystemRecords] = useSessionState<SystemRecord[]>('dash_sysRecs', []);
    const [fieldRecords, setFieldRecords] = useSessionState<FieldRecord[]>('dash_fldRecs', []);
    const [results, setResults] = useSessionState<ComparisonResult[]>('dash_results', []);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processLog, setProcessLog] = useState('');
    const [processError, setProcessError] = useState<string | null>(null);
    const [systemRawData, setSystemRawData] = useSessionState<Record<string, string>[]>('dash_sysRaw', []);
    const [systemColumns, setSystemColumns] = useSessionState<string[]>('dash_sysCols', []);
    const [columnMappings, setColumnMappings] = useSessionState<ColumnMapping[]>('dash_colMaps', []);
    const [fieldRawData, setFieldRawData] = useSessionState<Record<string, string>[]>('dash_fldRaw', []);
    const [fieldColumns, setFieldColumns] = useSessionState<string[]>('dash_fldCols', []);
    const [isLoaded, setIsLoaded] = useSessionState<boolean>('dash_isLoaded', false);

    const stats: DashboardStats = {
        total: results.length,
        accurate: results.filter(r => r.category === 'accurate').length,
        fairlyAccurate: results.filter(r => r.category === 'fairly_accurate').length,
        inaccurate: results.filter(r => r.category === 'inaccurate').length,
        pending: results.filter(r => r.category === 'pending').length,
        error: results.filter(r => r.category === 'error').length,
    };

    // Auto-load latest batch from the Enterprise backend if opening on a new device/mobile
    useEffect(() => {
        if (!user || isLoaded) return;

        setIsLoaded(true); // Prevent repeated fetch loops

        let isMounted = true;
        const loadLatestBatch = async () => {
            try {
                const batches = await batchApi.listBatches();
                if (batches.length > 0 && isMounted) {
                    const latestBatch = batches[0];
                    if (latestBatch.status === 'completed' || latestBatch.status === 'failed') {
                        const finalItems = await batchApi.getBatchResults(latestBatch.id);

                        if (finalItems.length > 0 && isMounted) {
                            toast.info(`Memuat riwayat pemrosesan terakhir (${latestBatch.name})...`);
                            const backendResults: ComparisonResult[] = finalItems.map(item => {
                                return {
                                    connote: item.connote,
                                    recipientName: item.recipient_name || '',
                                    systemAddress: item.system_address,
                                    systemLat: item.system_lat || 0,
                                    systemLng: item.system_lng || 0,
                                    fieldLat: item.field_lat || 0,
                                    fieldLng: item.field_lng || 0,
                                    distanceMeters: item.distance_km ? item.distance_km * 1000 : 0,
                                    category: (item.accuracy_level as any) || 'error',
                                    geocodeStatus: item.error ? 'error' : item.geocode_status as any,
                                };
                            });

                            const sysRecs: SystemRecord[] = finalItems.map(item => ({
                                connote: item.connote,
                                recipientName: item.recipient_name || '',
                                address: item.system_address,
                                city: '',
                                province: '',
                                geocodeStatus: item.error ? 'error' : item.geocode_status as any,
                            }));

                            const fldRecs: FieldRecord[] = finalItems.filter(i => i.field_lat && i.field_lng).map(item => ({
                                connote: item.connote,
                                lat: item.field_lat || 0,
                                lng: item.field_lng || 0,
                                reportedBy: '',
                                reportDate: '',
                            }));

                            // Load raw mock representation so that UI tables display properly without uploading files
                            const mockSysRaw = finalItems.map(i => ({ connote: i.connote, recipient_name: i.recipient_name || '', address: i.system_address }));
                            const mockFldRaw = finalItems.filter(i => i.field_lat && i.field_lng).map(i => ({ connote: i.connote, lat: String(i.field_lat), lng: String(i.field_lng) }));

                            if (mockSysRaw.length > 0) {
                                setSystemColumns(Object.keys(mockSysRaw[0]));
                                setSystemRawData(mockSysRaw);
                            }
                            if (mockFldRaw.length > 0) {
                                setFieldColumns(Object.keys(mockFldRaw[0]));
                                setFieldRawData(mockFldRaw as Record<string, string>[]);
                            }

                            setSystemRecords(sysRecs);
                            setFieldRecords(fldRecs);
                            setResults(backendResults);
                        }
                    }
                }
            } catch (err) {
                console.error("Gagal memuat batch terakhir:", err);
            }
        };

        loadLatestBatch();
        return () => { isMounted = false; };
    }, [user, isLoaded, setIsLoaded, setSystemRecords, setFieldRecords, setResults, setSystemColumns, setSystemRawData, setFieldColumns, setFieldRawData]);

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
        } else {
            setFieldColumns([]);
            setFieldRawData([]);
        }
        setResults([]);
        setProcessError(null);
    }, []);

    const buildAddress = (sysRow: Record<string, string>, fieldRow: Record<string, string> | null, sys: SystemRecord): string => {
        if (columnMappings.length > 0) {
            const m = columnMappings[0];
            const rowData = m.source === 'system' ? sysRow : (fieldRow || {});
            const parts = [
                m.col1 ? rowData[m.col1] : '',
                m.col2 ? rowData[m.col2] : '',
                m.col3 ? rowData[m.col3] : '',
            ].filter(p => p && p.trim());
            return parts.join(m.separator);
        }
        return `${sys.address}, ${sys.city}, ${sys.province}`;
    };

    const handleProcess = async () => {
        if (systemRecords.length === 0 || fieldRecords.length === 0) return;

        setIsProcessing(true);
        setProcessError(null);
        setProcessLog('Mengirim data ke backend...');

        const fieldMap = new Map<string, FieldRecord>();
        fieldRecords.forEach(f => fieldMap.set(f.connote, f));

        const fieldRawMap = new Map<string, Record<string, string>>();
        fieldRawData.forEach(row => {
            const connote = (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim();
            if (connote) fieldRawMap.set(connote, row);
        });

        const rawDataMap = new Map<string, Record<string, string>>();
        systemRawData.forEach(row => {
            const connote = (row.connote || row.Connote || row.CONNOTE || '').toUpperCase().trim();
            if (connote) rawDataMap.set(connote, row);
        });

        // Prepare System Records with built addresses
        const systemPayload = systemRecords.map(sys => {
            const sysRawRow = rawDataMap.get(sys.connote) ?? {};
            const fieldRawRow = fieldRawMap.get(sys.connote) ?? null;
            return {
                connote: sys.connote,
                recipient_name: sys.recipientName,
                system_address: buildAddress(sysRawRow, fieldRawRow, sys)
            };
        });

        // Prepare Field Records
        const fieldPayload = fieldRecords.map(fld => ({
            connote: fld.connote,
            field_lat: fld.lat,
            field_lng: fld.lng
        }));

        const noFieldResults: ComparisonResult[] = systemRecords
            .filter(sys => !fieldMap.has(sys.connote))
            .map(sys => ({
                connote: sys.connote,
                recipientName: sys.recipientName,
                systemAddress: buildAddress(rawDataMap.get(sys.connote) ?? {}, null, sys),
                category: 'error' as const,
                geocodeStatus: 'error' as const,
            }));

        try {
            setProcessLog('Membuat Batch baru...');
            const batchName = `Batch ${new Date().toLocaleString('id-ID')}`;
            const batch = await batchApi.createBatch(batchName);

            setProcessLog('Mengunggah data sistem...');
            await batchApi.uploadSystemData(batch.id, systemPayload);

            setProcessLog('Mengunggah data lapangan...');
            await batchApi.uploadFieldData(batch.id, fieldPayload);

            setProcessLog(`Memproses geocoding dan perbandingan via Go backend...`);
            await batchApi.processBatch(batch.id);

            setProcessLog('Mengambil hasil pemrosesan...');
            const finalItems = await batchApi.getBatchResults(batch.id);

            const backendResults: ComparisonResult[] = finalItems.map(item => {
                const sys = systemRecords.find((s) => s.connote === item.connote);
                return {
                    connote: item.connote,
                    recipientName: sys?.recipientName || item.recipient_name || '',
                    systemAddress: item.system_address,
                    systemLat: item.system_lat || 0,
                    systemLng: item.system_lng || 0,
                    fieldLat: item.field_lat || 0,
                    fieldLng: item.field_lng || 0,
                    distanceMeters: item.distance_km ? item.distance_km * 1000 : 0,
                    category: (item.accuracy_level as any) || 'error',
                    geocodeStatus: item.error ? 'error' : item.geocode_status as any,
                };
            });

            setResults([...backendResults, ...noFieldResults]);
            setProcessLog(`Selesai memproses ${finalItems.length} record.`);
            toast.success(`Selesai memproses ${finalItems.length} record.`);
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
                <AddressColumnMapper
                    systemColumns={systemColumns}
                    fieldColumns={fieldColumns}
                    onMappingChange={setColumnMappings}
                    systemSampleRows={systemRawData.slice(0, 5)}
                    fieldSampleRows={fieldRawData.slice(0, 5)}
                />
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
