import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationApi, DataSource, TableSchema, TransformationPipeline } from '../lib/api';
import { Database, Plus, Play, Server, DatabaseZap, Loader2, CheckCircle2, RefreshCw, Hash, MapPin, User, Navigation, Settings, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

export default function DataIntegration() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'connections' | 'pipeline'>('connections');

    // Connection Form State
    const [connForm, setConnForm] = useState({
        name: '', provider: 'postgresql' as 'postgresql' | 'mysql',
        host: 'localhost', port: 5432, database: '', username: '', password: ''
    });

    // Pipeline Form State
    const [selectedDS, setSelectedDS] = useState<number | null>(null);
    const [baseTable, setBaseTable] = useState('');
    const [joins, setJoins] = useState([{ type: 'LEFT', table: '', on_source: '', on_target: '' }]);
    const [filters, setFilters] = useState([{ column: '', operator: '=', value: '' }]);
    const [mappings, setMappings] = useState<any[]>([
        { target_column: 'connote', source_columns: [''], separator: ' ', label: 'Nomor Resi (Key)', icon: <Hash className="w-3 h-3" /> },
        { target_column: 'full_address', source_columns: [''], separator: ' ', label: 'Alamat Sistem', icon: <MapPin className="w-3 h-3" /> },
        { target_column: 'courier_id', source_columns: [''], separator: ' ', label: 'Courier ID / Name', icon: <User className="w-3 h-3" /> },
        { target_column: 'latitude', source_columns: [''], separator: ' ', label: 'Field Lat (POD)', icon: <Navigation className="w-3 h-3" /> },
        { target_column: 'longitude', source_columns: [''], separator: ' ', label: 'Field Long (POD)', icon: <Navigation className="w-3 h-3" /> },
    ]);
    const [previewRows, setPreviewRows] = useState<any[]>([]); // For real-time inline table preview
    const [cronActive, setCronActive] = useState(false);
    const [cronSchedule, setCronSchedule] = useState('0 0 * * *');
    const [previewResults, setPreviewResults] = useState<any[] | null>(null);

    const [pipelineName, setPipelineName] = useState('New Pipeline');
    const [loadedPipelineId, setLoadedPipelineId] = useState<number | null>(null);

    // Fetch Data Sources
    const { data: dataSources = [], isLoading: loadingDS } = useQuery({
        queryKey: ['datasources'],
        queryFn: integrationApi.listDataSources,
    });

    // Fetch Schema when a DS is selected
    const { data: schema = [], isLoading: loadingSchema } = useQuery({
        queryKey: ['schema', selectedDS],
        queryFn: () => integrationApi.getSchema(selectedDS!),
        enabled: selectedDS !== null,
    });

    // Fetch saved pipelines
    const { data: savedPipelines = [], isLoading: loadingPipelines } = useQuery({
        queryKey: ['pipelines', selectedDS],
        queryFn: () => integrationApi.getPipelines(selectedDS!),
        enabled: selectedDS !== null,
    });

    // Mutations
    const testConnMutation = useMutation({
        mutationFn: integrationApi.testConnection,
        onSuccess: () => toast.success('Connection Successful!'),
        onError: (err: any) => toast.error('Connection Failed: ' + err.message)
    });

    const createConnMutation = useMutation({
        mutationFn: integrationApi.createDataSource,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] });
            toast.success('Source added successfully');
            setConnForm({ ...connForm, name: '', password: '' });
        }
    });

    const previewMutation = useMutation({
        mutationFn: integrationApi.previewPipeline,
        onSuccess: (data) => setPreviewResults(data.data),
        onError: (err: any) => toast.error('Preview Failed: ' + err.message)
    });

    const runMutation = useMutation({
        mutationFn: integrationApi.runPipeline,
        onSuccess: (data) => {
            toast.success(`Pipeline Execution Complete! Validated ${data.results?.length} records.`);
        },
        onError: (err: any) => toast.error('Execution Failed: ' + err.message)
    });

    const savePipelineMutation = useMutation({
        mutationFn: integrationApi.savePipeline,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['pipelines', selectedDS] });
            setLoadedPipelineId(data.id || null);
            toast.success('Pipeline saved successfully!');
        },
        onError: (err: any) => toast.error('Save failed: ' + err.message)
    });

    const deletePipelineMutation = useMutation({
        mutationFn: integrationApi.deletePipeline,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipelines', selectedDS] });
            setLoadedPipelineId(null);
            setPipelineName('New Pipeline');
            toast.success('Pipeline deleted!');
        }
    });

    // Handlers
    const handleAddConn = (e: React.FormEvent) => {
        e.preventDefault();
        createConnMutation.mutate(connForm);
    };

    const handleTestConn = () => {
        testConnMutation.mutate(connForm);
    };

    const buildExpression = (cols: string[], sep: string = ' ') => {
        const filtered = cols.filter(c => c.trim() !== '');
        if (filtered.length === 0) return "''";
        if (filtered.length === 1) return filtered[0];
        
        return `CONCAT_WS('${sep}', ${filtered.join(', ')})`;
    };

    // Auto-update preview rows when table changes
    useEffect(() => {
        if (baseTable && selectedDS) {
            const pipeline: TransformationPipeline = {
                data_source_id: selectedDS,
                name: 'InlinePreview',
                config: { base_table: baseTable, mappings: [], joins: joins.filter(j => j.table && j.on_source && j.on_target) }
            };
            integrationApi.previewPipeline(pipeline).then(res => setPreviewRows(res.data.slice(0, 5))).catch(() => {});
        }
    }, [baseTable, selectedDS, joins]);

    const handlePreview = () => {
        if (!selectedDS) {
            toast.error("Pilih koneksi database terlebih dahulu.");
            return;
        }
        if (!baseTable) {
            toast.error("Base table is required");
            return;
        }
        const pipeline: TransformationPipeline = {
            data_source_id: selectedDS,
            name: 'Preview',
            config: {
                base_table: baseTable,
                joins: joins.filter(j => j.table && j.on_source && j.on_target),
                mappings: mappings.filter(m => m.target_column && m.source_columns?.some(c => c)).map(m => ({
                    target_column: m.target_column,
                    expression: buildExpression(m.source_columns, m.separator)
                })),
                filters: filters.filter(f => f.column && f.operator && f.value)
            }
        };
        previewMutation.mutate(pipeline);
    };

    const handleRun = () => {
        if (!selectedDS) {
            toast.error("Pilih koneksi database terlebih dahulu.");
            return;
        }
        if (!baseTable) {
            toast.error("Base table is required");
            return;
        }
        const pipeline: TransformationPipeline = {
            data_source_id: selectedDS,
            name: 'Run',
            config: {
                base_table: baseTable,
                joins: joins.filter(j => j.table && j.on_source && j.on_target),
                mappings: mappings.filter(m => m.target_column && m.source_columns?.some(c => c)).map(m => ({
                    target_column: m.target_column,
                    expression: buildExpression(m.source_columns)
                })),
                filters: filters.filter(f => f.column && f.operator && f.value)
            }
        };
        toast.promise(runMutation.mutateAsync(pipeline), {
            loading: 'Stream processing millions of rows...',
            success: 'Pipeline extraction and validation stream finished!',
            error: 'Failed to run pipeline.'
        });
    };

    const handleLoadPipeline = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = Number(e.target.value);
        if (!id) {
            setLoadedPipelineId(null);
            setPipelineName('New Pipeline');
            setBaseTable('');
            setJoins([]);
            setFilters([]);
            setMappings([
                { target_column: 'connote', source_columns: [''], label: 'Nomor Resi (Key)', icon: <Hash className="w-3 h-3" /> },
                { target_column: 'full_address', source_columns: [''], label: 'Alamat Sistem', icon: <MapPin className="w-3 h-3" /> },
                { target_column: 'courier_id', source_columns: [''], label: 'Courier ID / Name', icon: <User className="w-3 h-3" /> },
                { target_column: 'latitude', source_columns: [''], label: 'Field Lat (POD)', icon: <Navigation className="w-3 h-3" /> },
                { target_column: 'longitude', source_columns: [''], label: 'Field Long (POD)', icon: <Navigation className="w-3 h-3" /> },
            ]);
            setCronActive(false);
            setCronSchedule('0 0 * * *');
            return;
        }

        const p = savedPipelines.find((p) => p.id === id);
        if (p) {
            setLoadedPipelineId(p.id!);
            setPipelineName(p.name);
            const cfg = p.config as any;
            setBaseTable(cfg.base_table || '');
            setJoins(cfg.joins || []);
            setFilters(cfg.filters || []);

            // Try to recover source_columns from UI metadata OR fallback to simple parsing
            const loadedMappings = (cfg.mappings || []).map((m: any) => {
                const existing = mappings.find(ex => ex.target_column === m.target_column);
                return {
                    target_column: m.target_column,
                    source_columns: m.source_columns || [m.expression], // Fallback
                    label: existing?.label || m.target_column,
                    icon: existing?.icon || <Settings className="w-3 h-3" />
                };
            });
            setMappings(loadedMappings);
            
            setCronActive(cfg.cron_active || false);
            setCronSchedule(cfg.cron || '0 0 * * *');
        }
    };

    const handleSavePipeline = () => {
        if (!selectedDS || !baseTable || !pipelineName) {
            toast.error("Please provide a name and select a base table.");
            return;
        }
        const pipeline: TransformationPipeline = {
            id: loadedPipelineId || undefined,
            data_source_id: selectedDS,
            name: pipelineName,
            config: {
                base_table: baseTable,
                joins: joins.filter(j => j.table && j.on_source && j.on_target),
                mappings: mappings.filter(m => m.target_column && m.source_columns?.some(c => c)).map(m => ({
                    target_column: m.target_column,
                    expression: buildExpression(m.source_columns, m.separator),
                    source_columns: m.source_columns // Save UI state for future reload
                })),
                filters: filters.filter(f => f.column && f.operator && f.value),
                cron_active: cronActive,
                cron: cronSchedule
            } as any
        };
        savePipelineMutation.mutate(pipeline);
    };

    const currentDS = dataSources.find(ds => ds.id === selectedDS);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <DatabaseZap className="h-6 w-6 text-primary" />
                    Data Integration
                </h1>
                <p className="text-muted-foreground mt-1">
                    Connect to external databases and build transformation pipelines (ETL).
                </p>
                {/* Tabs */}
                <div className="inline-flex flex-wrap space-x-1 p-1 bg-muted/50 rounded-xl border border-border/40 mb-8 shadow-sm">
                    <button
                        onClick={() => setActiveTab('connections')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'connections'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                            }`}
                    >
                        <Server className="w-4 h-4" /> Relational Connections
                    </button>
                    <button
                        onClick={() => setActiveTab('pipeline')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'pipeline'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                            }`}
                    >
                        <DatabaseZap className="w-4 h-4" /> Transformation Pipeline
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
                    {activeTab === 'connections' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                                <h2 className="text-lg font-semibold mb-4 flex items-center text-foreground">Tambah Database
                                    <InfoTooltip info="Sambungkan ke database eksternal (PostgreSQL/MySQL)." side="right" />
                                </h2>
                                <form onSubmit={handleAddConn} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1 text-foreground">Nama Koneksi</label>
                                        <input required type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.name} onChange={e => setConnForm({ ...connForm, name: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-foreground">Provider</label>
                                            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.provider} onChange={e => setConnForm({ ...connForm, provider: e.target.value as any })}>
                                                <option value="postgresql">PostgreSQL</option>
                                                <option value="mysql">MySQL</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-foreground">Host</label>
                                            <input required type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.host} onChange={e => setConnForm({ ...connForm, host: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-foreground">Port</label>
                                            <input required type="number" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.port} onChange={e => setConnForm({ ...connForm, port: parseInt(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-foreground">Database</label>
                                            <input required type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.database} onChange={e => setConnForm({ ...connForm, database: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-foreground">Username</label>
                                            <input required type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.username} onChange={e => setConnForm({ ...connForm, username: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-foreground">Password</label>
                                            <input required type="password" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.password} onChange={e => setConnForm({ ...connForm, password: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button type="button" onClick={handleTestConn} disabled={testConnMutation.isPending} className="flex-1 bg-secondary text-secondary-foreground py-2 rounded-md font-medium hover:brightness-110 flex items-center justify-center gap-2 transition-all">
                                            {testConnMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Test Connection
                                        </button>
                                        <button type="submit" disabled={createConnMutation.isPending} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md font-medium hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                            <Plus className="w-4 h-4" /> Save Source
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                                <h2 className="text-lg font-semibold mb-4 text-foreground">Saved Connections</h2>
                                {loadingDS ? (
                                    <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                ) : (!dataSources || dataSources.length === 0) ? (
                                    <div className="text-center p-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                                        <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p>No connections added yet.</p>
                                    </div>
                                ) : (
                                    <ul className="space-y-3">
                                        {(dataSources || []).map(ds => (
                                            <li key={ds.id} className="p-3 bg-background border border-border rounded-md flex justify-between items-center group cursor-pointer hover:border-primary hover:shadow-md transition-all" onClick={() => { setSelectedDS(ds.id); setActiveTab('pipeline'); }}>
                                                <div className="flex items-center gap-3">
                                                    <Server className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                                                    <div>
                                                        <p className="font-medium text-sm text-foreground">{ds.name}</p>
                                                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{ds.provider}://{ds.host}/{ds.database}</p>
                                                    </div>
                                                </div>
                                                <Plus className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'pipeline' && (
                        <div className="space-y-6">
                            {!selectedDS ? (
                                <div className="space-y-6 max-w-4xl mx-auto">
                                    <div className="text-center space-y-2">
                                        <h2 className="text-xl font-bold text-foreground">Pilih Sumber Data Pertama</h2>
                                        <p className="text-muted-foreground">Silakan tentukan koneksi database mana yang ingin Anda gunakan untuk membangun pipeline transformasi ini.</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {loadingDS ? (
                                            Array.from({ length: 3 }).map((_, i) => (
                                                <div key={i} className="h-40 bg-card/50 rounded-xl border border-dashed border-border animate-pulse" />
                                            ))
                                        ) : (!dataSources || dataSources.length === 0) ? (
                                            <div className="col-span-full text-center p-12 bg-card rounded-xl border border-dashed border-border">
                                                <Database className="w-12 h-12 mx-auto mb-4 opacity-10" />
                                                <p className="text-muted-foreground mb-4">Belum ada koneksi tersimpan.</p>
                                                <button onClick={() => setActiveTab('connections')} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm">
                                                    Tambah Koneksi Sekarang
                                                </button>
                                            </div>
                                        ) : (
                                            dataSources.map(ds => (
                                                <button
                                                    key={ds.id}
                                                    onClick={() => setSelectedDS(ds.id)}
                                                    className="group relative p-6 bg-card rounded-xl border border-border shadow-sm hover:border-primary hover:shadow-xl hover:-translate-y-1 transition-all text-left overflow-hidden"
                                                >
                                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-100 group-hover:scale-125 group-hover:text-primary transition-all">
                                                        <Server className="w-12 h-12" />
                                                    </div>
                                                    <div className="relative z-10 space-y-4">
                                                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                                                            <DatabaseZap className="w-6 h-6" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-foreground">{ds.name}</h3>
                                                            <p className="text-xs text-muted-foreground font-mono mt-1 opacity-70">{ds.provider}://{ds.host}</p>
                                                        </div>
                                                        <div className="flex items-center text-xs font-semibold text-primary pt-2">
                                                            Build Pipeline <Plus className="ml-1 w-3 h-3" />
                                                        </div>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-right-4 duration-300">
                                    <div className="lg:col-span-12 flex items-center justify-between p-4 bg-muted/40 border border-border/40 rounded-xl backdrop-blur-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                                                <CheckCircle2 className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Sumber Terpilih</p>
                                                <h3 className="font-bold text-foreground flex items-center gap-2">
                                                    {currentDS?.name} <span className="px-2 py-0.5 rounded-full bg-primary/10 text-[10px] text-primary">{currentDS?.provider}</span>
                                                </h3>
                                            </div>
                                        </div>
                                        <button onClick={() => setSelectedDS(null)} className="px-4 py-1.5 bg-background border border-border hover:bg-muted rounded-lg text-xs font-semibold transition-all">
                                            Ubah Koneksi
                                        </button>
                                    </div>

                                    <div className="lg:col-span-4 bg-card p-6 rounded-xl border border-border shadow-sm max-h-[700px] overflow-y-auto">
                                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground">
                                            <Server className="w-4 h-4 text-primary" /> Source Schema
                                        </h2>
                                        {loadingSchema ? (
                                            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                        ) : (schema && schema.length > 0) ? (
                                            <div className="space-y-4">
                                                {(schema || []).map(table => (
                                                    <div key={table.name} className="group">
                                                        <div
                                                            className={`font-semibold text-sm px-3 py-2 rounded-lg cursor-pointer transition-all flex justify-between items-center ${baseTable === table.name ? 'bg-primary text-white' : 'bg-muted hover:bg-muted-foreground/10'}`}
                                                            onClick={() => setBaseTable(table.name)}
                                                        >
                                                            {table.name}
                                                            {baseTable === table.name && <CheckCircle2 className="w-3 h-3" />}
                                                        </div>
                                                        <ul className="pl-4 mt-2 space-y-1.5 border-l border-primary/20 ml-2">
                                                            {(table.columns || []).map(col => (
                                                                <li key={col.name} className="flex justify-between text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5">
                                                                    <span>{col.name}</span>
                                                                    <span className="opacity-40 italic">{col.data_type}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground text-center p-8 border border-dashed rounded-lg">Skema tidak ditemukan.</p>
                                        )}
                                    </div>

                                    <div className="lg:col-span-8 space-y-6">
                                        <div className="bg-card p-8 rounded-xl border border-border shadow-lg flex flex-col">
                                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/40">
                                                <h2 className="text-xl font-bold text-foreground">Konfigurasi Alur</h2>
                                                <div className="flex gap-3">
                                                    <select
                                                        className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none transition-all w-52"
                                                        value={loadedPipelineId || ''}
                                                        onChange={handleLoadPipeline}
                                                    >
                                                        <option value="">-- Buat Baru --</option>
                                                        {(savedPipelines || []).map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </select>
                                                    {loadedPipelineId && (
                                                        <button
                                                            onClick={() => { if (confirm('Hapus pipeline ini?')) deletePipelineMutation.mutate(loadedPipelineId); }}
                                                            className="p-2 transition-all text-destructive hover:bg-destructive/10 rounded-lg"
                                                            title="Hapus Pipeline"
                                                        >
                                                            <Plus className="rotate-45" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-8">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-bold text-foreground flex items-center gap-1">Nama Pipeline <InfoTooltip info="Nama unik untuk pipeline ini." /></label>
                                                        <input type="text" className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={pipelineName} onChange={e => setPipelineName(e.target.value)} placeholder="e.g. Sync Pengiriman Harian" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-bold text-foreground flex items-center gap-1">Tabel Utama <InfoTooltip info="Tabel master untuk query ini." /></label>
                                                        <select className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground font-mono focus:ring-2 focus:ring-primary focus:outline-none" value={baseTable} onChange={e => setBaseTable(e.target.value)}>
                                                            <option value="">-- Pilih Tabel --</option>
                                                            {schema.map(t => (
                                                                <option key={t.name} value={t.name}>{t.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <label className="text-sm font-bold text-foreground flex items-center gap-1">Gabungkan Tabel (Joins) <InfoTooltip info="Hubungkan tabel lain." /></label>
                                                    <div className="space-y-3">
                                                        {joins.map((j, idx) => (
                                                            <div key={idx} className="flex flex-wrap md:flex-nowrap gap-2 items-center p-4 bg-muted/20 rounded-xl border border-border/40 group">
                                                                <select className="w-full md:w-28 rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold" value={j.type} onChange={e => { const newJ = [...joins]; newJ[idx].type = e.target.value; setJoins(newJ); }}>
                                                                    <option value="LEFT">LEFT</option>
                                                                    <option value="INNER">INNER</option>
                                                                </select>
                                                                <input type="text" className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono" placeholder="Table" value={j.table} onChange={e => { const newJ = [...joins]; newJ[idx].table = e.target.value; setJoins(newJ); }} />
                                                                <input type="text" className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono" placeholder="Key 1" value={j.on_source} onChange={e => { const newJ = [...joins]; newJ[idx].on_source = e.target.value; setJoins(newJ); }} />
                                                                <span className="text-muted-foreground">=</span>
                                                                <input type="text" className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono" placeholder="Key 2" value={j.on_target} onChange={e => { const newJ = [...joins]; newJ[idx].on_target = e.target.value; setJoins(newJ); }} />
                                                                <button onClick={() => setJoins(joins.filter((_, i) => i !== idx))} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg opacity-40 group-hover:opacity-100 transition-opacity"><Plus className="w-4 h-4 rotate-45" /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <button type="button" onClick={() => setJoins([...joins, { type: 'LEFT', table: '', on_source: '', on_target: '' }])} className="text-xs text-primary font-bold hover:brightness-110 flex items-center gap-1">
                                                        <Plus className="w-3 h-3" /> Tambah Join
                                                    </button>
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex flex-col">
                                                            <label className="text-sm font-bold text-foreground flex items-center gap-1">Mapping Kolom Alamat</label>
                                                            <p className="text-xs text-muted-foreground">Gabungkan 2-3 kolom dari database menjadi string alamat lengkap untuk proses geocoding.</p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => setPreviewResults(null)} className="px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-muted transition-all flex items-center gap-2">
                                                                <Play className="w-3 h-3" /> Preview Data
                                                            </button>
                                                            <button onClick={() => setMappings([...mappings, { target_column: 'custom_field', source_columns: [''], separator: ' ', label: 'Custom Metadata', icon: <Settings className="w-3 h-3" /> }])} className="px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold hover:bg-primary/20 transition-all flex items-center gap-2">
                                                                <Plus className="w-3 h-3" /> Tambah Mapping
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4">
                                                        {mappings.map((m, idx) => (
                                                            <div key={idx} className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                                                                {/* Mapping Header */}
                                                                <div className="bg-muted/30 px-6 py-4 border-b border-border flex items-center justify-between">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                                            {m.target_column === 'connote' ? <Hash className="w-4 h-4" /> : 
                                                                             m.target_column === 'full_address' ? <MapPin className="w-4 h-4" /> : 
                                                                             m.target_column === 'courier_id' ? <User className="w-4 h-4" /> : 
                                                                             ['latitude', 'longitude'].includes(m.target_column) ? <Navigation className="w-4 h-4" /> : 
                                                                             <Settings className="w-4 h-4" />}
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{m.label}</span>
                                                                            <div className="flex items-center gap-2">
                                                                                <input 
                                                                                    type="text" 
                                                                                    className="bg-transparent border-b border-dashed border-border text-sm font-bold text-foreground focus:border-primary focus:outline-none w-32" 
                                                                                    value={m.target_column} 
                                                                                    onChange={e => { const newM = [...mappings]; newM[idx].target_column = e.target.value; setMappings(newM); }} 
                                                                                />
                                                                                <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground uppercase">Target</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    {!['connote', 'full_address', 'courier_id', 'latitude', 'longitude'].includes(m.target_column) && (
                                                                        <button onClick={() => setMappings(mappings.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors p-2 hover:bg-destructive/10 rounded-full">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Mapping Pill UI */}
                                                                <div className="p-6 space-y-6">
                                                                    <div className="flex flex-wrap items-center gap-2 p-4 bg-background border border-border/50 rounded-xl min-h-[60px]">
                                                                        {m.source_columns.map((srcCol: string, sIdx: number) => (
                                                                            <div key={sIdx} className="flex items-center gap-2">
                                                                                <div className="relative group/pill">
                                                                                    <select 
                                                                                        className="appearance-none pl-4 pr-10 py-2 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-full text-xs font-bold text-primary focus:ring-2 focus:ring-primary focus:outline-none transition-all cursor-pointer min-w-[140px]"
                                                                                        value={srcCol}
                                                                                        onChange={e => { const newM = [...mappings]; newM[idx].source_columns[sIdx] = e.target.value; setMappings(newM); }}
                                                                                    >
                                                                                        <option value="">(pilih kolom)</option>
                                                                                        {schema.find(t => t.name === baseTable)?.columns.map(c => (
                                                                                            <option key={c.name} value={c.name}>{c.name}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                                                                                        <ChevronDown className="w-3 h-3" />
                                                                                    </div>
                                                                                    {m.source_columns.length > 1 && (
                                                                                        <button 
                                                                                            onClick={() => { const newM = [...mappings]; newM[idx].source_columns.splice(sIdx, 1); setMappings(newM); }}
                                                                                            className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-white rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover/pill:opacity-100 transition-opacity hover:scale-110"
                                                                                        >
                                                                                            <span className="rotate-45 text-sm">+</span>
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                                {sIdx < m.source_columns.length - 1 && (
                                                                                    <div className="h-6 w-6 flex items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-lg">+</div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                        <button 
                                                                            onClick={() => { const newM = [...mappings]; newM[idx].source_columns.push(''); setMappings(newM); }}
                                                                            className="h-8 w-8 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-all"
                                                                        >
                                                                            <Plus className="w-4 h-4" />
                                                                        </button>
                                                                    </div>

                                                                    {/* Separator Selection */}
                                                                    <div className="space-y-3">
                                                                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pemisah Antar Kolom:</label>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {[
                                                                                { label: 'Koma + Spasi (, )', value: ', ' },
                                                                                { label: 'Spasi ( )', value: ' ' },
                                                                                { label: 'Dash (---)', value: ' - ' },
                                                                                { label: 'Slash (/)', value: ' / ' },
                                                                                { label: 'Pipe (|)', value: ' | ' }
                                                                            ].map(s => (
                                                                                <button
                                                                                    key={s.value}
                                                                                    onClick={() => { const newM = [...mappings]; newM[idx].separator = s.value; setMappings(newM); }}
                                                                                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${m.separator === s.value ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20' : 'bg-transparent border-border text-muted-foreground hover:bg-muted'}`}
                                                                                >
                                                                                    {s.label}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    {/* SQL Result Preview */}
                                                                    <div className="p-4 bg-muted/20 border border-border/40 rounded-xl space-y-2">
                                                                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase">
                                                                            <Database className="w-3 h-3" /> Hasil Gabungan:
                                                                        </div>
                                                                        <div className="text-sm font-mono text-primary truncate">
                                                                            {m.source_columns.filter((c: string) => c).join(m.separator) || '(kosong)'}
                                                                        </div>
                                                                    </div>

                                                                    {/* Mini Preview Table */}
                                                                    {previewRows.length > 0 && (
                                                                        <div className="space-y-3 pt-4 border-t border-border/40">
                                                                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase">
                                                                                <Play className="w-3 h-3" /> Preview 5 Baris Pertama:
                                                                            </div>
                                                                            <div className="overflow-x-auto rounded-lg border border-border/40 bg-background/50">
                                                                                <table className="w-full text-[10px] text-left">
                                                                                    <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border/40 uppercase tracking-tighter">
                                                                                        <tr>
                                                                                            <th className="px-3 py-2 w-8 text-center bg-muted/20">#</th>
                                                                                            {m.source_columns.map((c: string) => c && <th key={c} className="px-3 py-2">{c}</th>)}
                                                                                            <th className="px-3 py-2 text-primary font-bold">→ Hasil Gabungan</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="divide-y divide-border/20">
                                                                                        {previewRows.map((row, rIdx) => (
                                                                                            <tr key={rIdx} className="hover:bg-primary/5 transition-colors group">
                                                                                                <td className="px-3 py-1.5 text-center font-mono opacity-40">{rIdx + 1}</td>
                                                                                                {m.source_columns.map((c: string) => c && (
                                                                                                    <td key={c} className="px-3 py-1.5 text-foreground truncate max-w-[120px]" title={row[c]}>
                                                                                                        {row[c] || '-'}
                                                                                                    </td>
                                                                                                ))}
                                                                                                <td className="px-3 py-1.5 font-bold text-primary truncate max-w-[200px]">
                                                                                                    {m.source_columns.map((c: string) => row[c]).filter((v: any) => v).join(m.separator)}
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-10 mt-8 border-t border-border/40 gap-4">
                                                <button onClick={handleSavePipeline} disabled={savePipelineMutation.isPending || !baseTable || !pipelineName} className="px-6 py-2.5 border border-primary text-primary rounded-xl font-bold text-sm hover:bg-primary/5 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50">
                                                    {savePipelineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Simpan Pipeline
                                                </button>
                                                <div className="flex gap-2">
                                                    <button onClick={handlePreview} disabled={previewMutation.isPending || !baseTable} className="px-6 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-bold text-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-2">
                                                        {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Preview
                                                    </button>
                                                    <button onClick={handleRun} disabled={runMutation.isPending || !baseTable} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 shadow-sm">
                                                        {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseZap className="w-4 h-4" />} Jalankan & Geocode
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {previewMutation.isPending && (
                                            <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
                                                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                                                <div className="text-center">
                                                    <p className="font-bold text-lg">Menarik Data Preview...</p>
                                                    <p className="text-muted-foreground text-sm">Sedang mengambil 100 sample data dari database sumber.</p>
                                                </div>
                                            </div>
                                        )}

                                        {previewResults && !previewMutation.isPending && (
                                            <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300">
                                                <div className="bg-muted/50 px-6 py-4 border-b border-border flex justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <h3 className="font-bold text-sm flex items-center gap-2">
                                                            <Play className="w-4 h-4 text-primary" /> 
                                                            Preview Data (Result Set)
                                                        </h3>
                                                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Menampilkan {previewResults.length} record sample</p>
                                                    </div>
                                                    <button onClick={() => setPreviewResults(null)} className="text-muted-foreground hover:text-destructive transition-colors p-1 hover:bg-destructive/10 rounded-full"><Plus className="rotate-45" /></button>
                                                </div>
                                                <div className="overflow-x-auto max-h-[500px] scrollbar-thin scrollbar-thumb-muted-foreground/20">
                                                    <table className="w-full text-xs text-left">
                                                        <thead className="bg-muted/30 text-muted-foreground uppercase font-bold tracking-wider sticky top-0 backdrop-blur-md border-b border-border/40 z-10">
                                                            <tr>
                                                                <th className="px-6 py-4 w-12 text-center bg-muted/20">#</th>
                                                                {Object.keys((previewResults && previewResults[0]) || {}).map(k => (
                                                                    <th key={k} className="px-6 py-4 min-w-[150px]">{k}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-border/40">
                                                            {previewResults.length === 0 ? (
                                                                <tr><td colSpan={100} className="px-6 py-12 text-center text-muted-foreground italic">Tidak ada data yang ditemukan untuk filter ini.</td></tr>
                                                            ) : (
                                                                previewResults.map((row, i) => (
                                                                    <tr key={i} className="hover:bg-primary/5 transition-colors group">
                                                                        <td className="px-6 py-4 text-center font-mono text-muted-foreground bg-muted/5 group-hover:bg-primary/10 transition-colors">{i + 1}</td>
                                                                        {Object.values(row).map((v: any, j) => (
                                                                            <td key={j} className="px-6 py-4 max-w-xs truncate overflow-hidden border-l border-border/10" title={String(v)}>{String(v)}</td>
                                                                        ))}
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="bg-muted/30 px-6 py-3 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
                                                    <p>Gunakan tombol <span className="font-bold text-foreground">Preview</span> kembali jika mengubah filter atau mapping.</p>
                                                    <p className="font-mono">LIMIT: 100 RECORDS</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
