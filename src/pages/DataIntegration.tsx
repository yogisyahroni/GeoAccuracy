import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationApi, DataSource, TableSchema, TransformationPipeline, ErpIntegrationRequest, ErpIntegration } from '../lib/api';
import { Database, Plus, Play, Server, DatabaseZap, Loader2, Clock, CheckCircle2, RefreshCw, Key, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

export default function DataIntegration() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'connections' | 'pipeline' | 'erp'>('connections');

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
    const [mappings, setMappings] = useState([{ target_column: 'full_address', expression: '' }]);
    const [cronActive, setCronActive] = useState(false);
    const [cronSchedule, setCronSchedule] = useState('0 0 * * *');
    const [previewResults, setPreviewResults] = useState<any[] | null>(null);

    const [pipelineName, setPipelineName] = useState('New Pipeline');
    const [loadedPipelineId, setLoadedPipelineId] = useState<number | null>(null);

    // ERP Form State
    const [erpForm, setErpForm] = useState<ErpIntegrationRequest>({
        name: '', url: '', method: 'GET', auth_header_key: '', auth_header_value: '', cron_schedule: '0 0 * * *'
    });

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

    // Fetch ERP Integrations
    const { data: erpIntegrations = [], isLoading: loadingErp } = useQuery({
        queryKey: ['erp-integrations'],
        queryFn: integrationApi.listErpIntegrations,
    });

    // Mutations
    const testConnMutation = useMutation({
        mutationFn: integrationApi.testConnection,
        onSuccess: () => alert('Connection Successful!'),
        onError: (err: any) => alert('Connection Failed: ' + err.message)
    });

    const createConnMutation = useMutation({
        mutationFn: integrationApi.createDataSource,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] });
            alert('Source added successfully');
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
            // Automatically switch to history/analytics or keep them here
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

    // ERP Mutations
    const createErpMutation = useMutation({
        mutationFn: integrationApi.createErpIntegration,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['erp-integrations'] });
            toast.success('ERP Integration added successfully');
            setErpForm({ name: '', url: '', method: 'GET', auth_header_key: '', auth_header_value: '', cron_schedule: '0 0 * * *' });
        },
        onError: (err: any) => toast.error('Failed to add ERP Integration: ' + err.message)
    });

    const deleteErpMutation = useMutation({
        mutationFn: integrationApi.deleteErpIntegration,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['erp-integrations'] });
            toast.success('ERP Integration deleted');
        }
    });

    const syncErpMutation = useMutation({
        mutationFn: integrationApi.syncErpIntegration,
        onSuccess: () => toast.success('ERP Sync started in background!'),
        onError: (err: any) => toast.error('Failed to trigger sync: ' + err.message)
    });

    // Handlers
    const handleAddConn = (e: React.FormEvent) => {
        e.preventDefault();
        createConnMutation.mutate(connForm);
    };

    const handleTestConn = () => {
        testConnMutation.mutate(connForm);
    };

    const handleAddErp = (e: React.FormEvent) => {
        e.preventDefault();
        createErpMutation.mutate(erpForm);
    };

    const handlePreview = () => {
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
                mappings: mappings.filter(m => m.target_column && m.expression),
                filters: filters.filter(f => f.column && f.operator && f.value)
            }
        };
        previewMutation.mutate(pipeline);
    };

    const handleRun = () => {
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
                mappings: mappings.filter(m => m.target_column && m.expression),
                filters: filters.filter(f => f.column && f.operator && f.value)
            }
        };
        toast.promise(runMutation.mutateAsync(pipeline), {
            loading: 'Stream processing millions of rows... this may take some time depending on dataset size.',
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
            setMappings([{ target_column: 'full_address', expression: '' }]);
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
            setMappings(cfg.mappings || [{ target_column: 'full_address', expression: '' }]);
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
                mappings: mappings.filter(m => m.target_column && m.expression),
                filters: filters.filter(f => f.column && f.operator && f.value),
                cron_active: cronActive,
                cron: cronSchedule
            }
        };
        savePipelineMutation.mutate(pipeline);
    };


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
                        onClick={() => setActiveTab('erp')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'erp'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                            }`}
                    >
                        <LinkIcon className="w-4 h-4" /> ERP API Push/Pull
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
                    {/* --- RELATIONAL DATABASES TAB --- */}
                    {activeTab === 'connections' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Add Connection Form */}
                            <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                                <h2 className="text-lg font-semibold mb-4 flex items-center">Tambah Database
                                    <InfoTooltip info="Sambungkan ke database eksternal (PostgreSQL/MySQL). Data dari database ini dapat digunakan sebagai sumber pipeline ETL untuk validasi geolokasi." side="right" />
                                </h2>
                                <form onSubmit={handleAddConn} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1 flex items-center">Nama Koneksi <InfoTooltip info="Nama pengenal untuk koneksi ini. Gunakan nama yang mudah diingat." example="Contoh: Database Produksi, DB Warehouse" /></label>
                                        <input required type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={connForm.name} onChange={e => setConnForm({ ...connForm, name: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Provider</label>
                                            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={connForm.provider} onChange={e => setConnForm({ ...connForm, provider: e.target.value as any })}>
                                                <option value="postgresql">PostgreSQL</option>
                                                <option value="mysql">MySQL</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Host</label>
                                            <input required type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={connForm.host} onChange={e => setConnForm({ ...connForm, host: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Port</label>
                                            <input required type="number" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={connForm.port} onChange={e => setConnForm({ ...connForm, port: parseInt(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Database</label>
                                            <input required type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={connForm.database} onChange={e => setConnForm({ ...connForm, database: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Username</label>
                                            <input required type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={connForm.username} onChange={e => setConnForm({ ...connForm, username: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Password</label>
                                            <input required type="password" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={connForm.password} onChange={e => setConnForm({ ...connForm, password: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button type="button" onClick={handleTestConn} disabled={testConnMutation.isPending} className="flex-1 bg-secondary text-secondary-foreground py-2 rounded-md font-medium hover:brightness-110 flex items-center justify-center gap-2">
                                            {testConnMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Test Connection
                                        </button>
                                        <button type="submit" disabled={createConnMutation.isPending} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md font-medium hover:brightness-110 flex items-center justify-center gap-2">
                                            <Plus className="w-4 h-4" /> Save Source
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Saved Connections */}
                            <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                                <h2 className="text-lg font-semibold mb-4">Saved Connections</h2>
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
                                            <li key={ds.id} className="p-3 bg-background border border-border rounded-md flex justify-between items-center group cursor-pointer hover:border-primary transition-colors" onClick={() => { setSelectedDS(ds.id); setActiveTab('pipeline'); }}>
                                                <div className="flex items-center gap-3">
                                                    <Server className="h-5 w-5 text-muted-foreground" />
                                                    <div>
                                                        <p className="font-medium text-sm">{ds.name}</p>
                                                        <p className="text-xs text-muted-foreground font-mono">{ds.provider}://{ds.host}:{ds.port}/{ds.database}</p>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- ERP INTEGRATION TAB --- */}
                    {activeTab === 'erp' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* ERP Integrations List */}
                            <div className="lg:col-span-1 space-y-6">
                                <div className="bg-card rounded-xl p-6 border border-border shadow-sm transition-all">
                                    <h2 className="text-xl font-semibold tracking-tight mb-4 flex items-center gap-2">
                                        <DatabaseZap className="w-5 h-5 text-primary" /> Active Integrations
                                    </h2>
                                    {loadingErp ? (
                                        <div className="animate-pulse bg-muted rounded-md h-24"></div>
                                    ) : (!erpIntegrations || erpIntegrations.length === 0) ? (
                                        <div className="text-center p-6 bg-black/5 rounded-lg border border-dashed border-border/40">
                                            <p className="text-sm text-muted-foreground">No ERP integrations found.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {erpIntegrations.map(erp => (
                                                <div key={erp.id} className="p-4 rounded-xl border border-border hover:border-primary/50 transition-colors bg-background shadow-sm group">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h3 className="font-semibold text-foreground truncate max-w-[150px]">{erp.name}</h3>
                                                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{erp.method}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate mb-3">{erp.url}</p>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                                                        <Clock className="w-3 h-3" /> {erp.cron_schedule || 'Manual'}
                                                    </div>
                                                    <div className="flex items-center gap-2 border-t pt-3">
                                                        <button
                                                            onClick={() => syncErpMutation.mutate(erp.id!)}
                                                            disabled={syncErpMutation.isPending}
                                                            className="flex-1 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:bg-secondary/80 transition-colors"
                                                        >
                                                            <RefreshCw className="w-3 h-3 inline mr-1" /> Sync Now
                                                        </button>
                                                        <button
                                                            onClick={() => deleteErpMutation.mutate(erp.id!)}
                                                            className="px-3 py-1.5 bg-destructive/10 text-destructive hover:bg-destructive text-white rounded-md text-xs font-medium transition-colors"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Add ERP Form */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-card rounded-xl p-8 border border-border shadow-sm">
                                    <h2 className="text-2xl font-semibold tracking-tight mb-6 flex items-center">Buat Koneksi ERP Baru <InfoTooltip info="Hubungkan sistem ERP eksternal (SAP, Oracle, dsb.) melalui HTTP API. Data akan ditarik/dikirim secara otomatis sesuai jadwal Cron yang ditentukan." side="right" /></h2>
                                    <form onSubmit={handleAddErp} className="space-y-5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-foreground flex items-center">Nama Integrasi <InfoTooltip info="Nama pengenal untuk integrasi ERP ini. Pilih nama yang mencerminkan sistem sumber dan tujuannya." example="Contoh: SAP Logistik Alpha, Oracle WMS Surabaya" /></label>
                                                <input
                                                    required type="text"
                                                    disabled={createErpMutation.isPending}
                                                    placeholder="e.g. SAP Logistics Alpha"
                                                    value={erpForm.name}
                                                    onChange={e => setErpForm({ ...erpForm, name: e.target.value })}
                                                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-foreground flex items-center">Metode HTTP <InfoTooltip info="Pilih GET untuk mengambil data dari API ERP (pull). Pilih POST untuk mengirim data ke API ERP (push)." example="GET = Ambil data dari ERP  |  POST = Kirim data ke ERP" /></label>
                                                <select
                                                    value={erpForm.method}
                                                    disabled={createErpMutation.isPending}
                                                    onChange={e => setErpForm({ ...erpForm, method: e.target.value })}
                                                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                                                >
                                                    <option value="GET">GET</option>
                                                    <option value="POST">POST</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground flex items-center">URL Endpoint API <InfoTooltip info="Alamat lengkap endpoint API ERP yang akan dipanggil. Harus diawali dengan https:// untuk keamanan." example="https://api.erp-perusahaan.com/v1/shipments" /></label>
                                            <input
                                                required type="url"
                                                disabled={createErpMutation.isPending}
                                                placeholder="https://api.erp.example.com/v1/data"
                                                value={erpForm.url}
                                                onChange={e => setErpForm({ ...erpForm, url: e.target.value })}
                                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">Data from this endpoint must correspond to the standard Webhook Payload format.</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 rounded-lg bg-black/5 border border-border/40">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-foreground flex items-center gap-1"><Key className="w-3 h-3" /> Header Key <span className="text-xs text-muted-foreground">(Optional)</span></label>
                                                <input
                                                    type="text"
                                                    disabled={createErpMutation.isPending}
                                                    placeholder="Authorization / x-api-key"
                                                    value={erpForm.auth_header_key}
                                                    onChange={e => setErpForm({ ...erpForm, auth_header_key: e.target.value })}
                                                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-foreground flex items-center">Nilai Header / Kunci Rahasia <InfoTooltip info="Nilai token atau API key yang akan dikirim pada header. Disimpan terenkripsi AES-256. Jangan bagikan nilai ini." example="Bearer eyJhbGci...  atau  sk_live_xxxxxxxxxxx" /></label>
                                                <input
                                                    type="password"
                                                    disabled={createErpMutation.isPending}
                                                    placeholder="Bearer eyJhbGci..."
                                                    value={erpForm.auth_header_value}
                                                    onChange={e => setErpForm({ ...erpForm, auth_header_value: e.target.value })}
                                                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                                                />
                                                <p className="text-[10px] text-muted-foreground mt-1">AES-256 Encrypted at rest.</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Cron Execution Schedule</label>
                                            <input
                                                type="text"
                                                disabled={createErpMutation.isPending}
                                                placeholder="0 0 * * *"
                                                value={erpForm.cron_schedule}
                                                onChange={e => setErpForm({ ...erpForm, cron_schedule: e.target.value })}
                                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">Format: <b>* * * * *</b> (Min, Hr, DayOfMonth, Month, DayOfWeek). Leave empty for manual trigger only.</p>
                                        </div>

                                        <div className="pt-2">
                                            <button
                                                type="submit"
                                                disabled={createErpMutation.isPending}
                                                className="w-auto px-6 h-10 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground font-medium text-sm transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                                            >
                                                {createErpMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                                Save Integration
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- PIPELINES TAB --- */}
                    {activeTab === 'pipeline' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Source Schema Explorer */}
                            <div className="bg-card p-6 rounded-lg border border-border shadow-sm md:col-span-1">
                                <h2 className="text-lg font-semibold mb-4">Source Schema</h2>
                                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-4" value={selectedDS || ''} onChange={e => setSelectedDS(Number(e.target.value))}>
                                    <option value="" disabled>Select a connection...</option>
                                    {dataSources && dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
                                </select>

                                {loadingSchema ? (
                                    <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                                ) : (schema && schema.length > 0) ? (
                                    <div className="overflow-y-auto max-h-[500px] text-sm pr-2">
                                        {(schema || []).map(table => (
                                            <div key={table.name} className="mb-4">
                                                <div className="font-semibold bg-muted px-2 py-1 rounded cursor-pointer" onClick={() => setBaseTable(table.name)}>
                                                    {table.name}
                                                </div>
                                                <ul className="pl-4 mt-1 space-y-1 text-muted-foreground font-mono text-xs">
                                                    {(table.columns || []).map(col => (
                                                        <li key={col.name} className="flex justify-between">
                                                            <span>{col.name}</span>
                                                            <span className="opacity-50">{col.data_type}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center">Select a source to view schema</p>
                                )}
                            </div>

                            {/* Mappings & Preview */}
                            <div className="bg-card p-6 rounded-lg border border-border shadow-sm md:col-span-2 flex flex-col">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold">Pipeline Configuration</h2>
                                    {selectedDS !== null && (
                                        <div className="flex gap-2">
                                            <select
                                                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-48"
                                                value={loadedPipelineId || ''}
                                                onChange={handleLoadPipeline}
                                            >
                                                <option value="">-- New Pipeline --</option>
                                                {(savedPipelines || []).map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                            {loadedPipelineId && (
                                                <button
                                                    onClick={() => { if (confirm('Delete this pipeline?')) deletePipelineMutation.mutate(loadedPipelineId); }}
                                                    className="px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded-md font-medium hover:brightness-110"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 mb-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 flex items-center">Nama Pipeline <InfoTooltip info="Nama untuk menyimpan konfigurasi pipeline ini. Anda dapat memilih pipeline yang tersimpan dari dropdown di atas." example="Contoh: Sync Harian Orders, ETL Bulanan" /></label>
                                            <input type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={pipelineName} onChange={e => setPipelineName(e.target.value)} placeholder="e.g. Daily Sync" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1 flex items-center">Tabel Utama (Base Table) <InfoTooltip info="Nama tabel utama di database sumber yang menjadi titik awal pengambilan data. Pipeline akan mulai query dari tabel ini." example="Contoh: orders, users, shipments" /></label>
                                            <input type="text" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={baseTable} onChange={e => setBaseTable(e.target.value)} placeholder="e.g. users" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1 flex items-center">Gabungkan Tabel (Table Joins) — Opsional <InfoTooltip info="Gabungkan tabel lain ke tabel utama menggunakan LEFT JOIN atau INNER JOIN. Berguna jika data alamat tersebar di beberapa tabel." example="LEFT JOIN: orders + users ON orders.user_id = users.id" /></label>
                                        <div className="space-y-3">
                                            {joins.map((j, idx) => (
                                                <div key={idx} className="flex gap-3 items-start">
                                                    <select className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm" value={j.type} onChange={e => { const newJ = [...joins]; newJ[idx].type = e.target.value; setJoins(newJ); }}>
                                                        <option value="LEFT">LEFT</option>
                                                        <option value="INNER">INNER</option>
                                                    </select>
                                                    <input type="text" className="full rounded-md border border-input bg-background px-3 py-2 text-sm flex-1" placeholder="Join Table (e.g. orders)" value={j.table} onChange={e => { const newJ = [...joins]; newJ[idx].table = e.target.value; setJoins(newJ); }} />
                                                    <input type="text" className="full rounded-md border border-input bg-background px-3 py-2 text-sm flex-1" placeholder="Source Key (e.g. users.id)" value={j.on_source} onChange={e => { const newJ = [...joins]; newJ[idx].on_source = e.target.value; setJoins(newJ); }} />
                                                    <span className="py-2 text-muted-foreground">=</span>
                                                    <input type="text" className="full rounded-md border border-input bg-background px-3 py-2 text-sm flex-1" placeholder="Target Key (e.g. orders.user_id)" value={j.on_target} onChange={e => { const newJ = [...joins]; newJ[idx].on_target = e.target.value; setJoins(newJ); }} />
                                                    <button onClick={() => setJoins(joins.filter((_, i) => i !== idx))} className="px-3 py-2 text-destructive hover:bg-destructive/10 rounded-md">X</button>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => setJoins([...joins, { type: 'LEFT', table: '', on_source: '', on_target: '' }])} className="mt-3 text-sm text-primary font-medium hover:underline">+ Add Join</button>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1 flex items-center">Filter Baris (Row Filters) — Opsional <InfoTooltip info="Saring data berdasarkan kondisi tertentu. Hanya baris yang memenuhi kondisi yang akan diproses oleh pipeline." example="Contoh: created_at >= 2024-01-01  |  status = active" /></label>
                                        <div className="space-y-3">
                                            {filters.map((f, idx) => (
                                                <div key={idx} className="flex gap-3 items-start">
                                                    <input type="text" className="full rounded-md border border-input bg-background px-3 py-2 text-sm flex-1" placeholder="Column (e.g. created_at)" value={f.column} onChange={e => { const newF = [...filters]; newF[idx].column = e.target.value; setFilters(newF); }} />
                                                    <select className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.operator} onChange={e => { const newF = [...filters]; newF[idx].operator = e.target.value; setFilters(newF); }}>
                                                        <option value="=">=</option>
                                                        <option value=">">&gt;</option>
                                                        <option value="<">&lt;</option>
                                                        <option value=">=">&gt;=</option>
                                                        <option value="<=">&lt;=</option>
                                                        <option value="!=">!=</option>
                                                        <option value="LIKE">LIKE</option>
                                                        <option value="ILIKE">ILIKE</option>
                                                    </select>
                                                    <input type="text" className="full rounded-md border border-input bg-background px-3 py-2 text-sm flex-1" placeholder="Value (e.g. 2024-01-01)" value={f.value} onChange={e => { const newF = [...filters]; newF[idx].value = e.target.value; setFilters(newF); }} />
                                                    <button onClick={() => setFilters(filters.filter((_, i) => i !== idx))} className="px-3 py-2 text-destructive hover:bg-destructive/10 rounded-md">X</button>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => setFilters([...filters, { column: '', operator: '=', value: '' }])} className="mt-3 text-sm text-primary font-medium hover:underline">+ Add Filter</button>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1 flex items-center">Pemetaan Kolom (Column Mappings) <InfoTooltip info="Tentukan kolom target dan ekspresi SQL untuk menghasilkan alamat lengkap yang akan digeokode. Kolom 'full_address' wajib ada." example="full_address → CONCAT(jalan, ', ', kota, ', ', provinsi)" /></label>
                                        <div className="space-y-3">
                                            {mappings.map((m, idx) => (
                                                <div key={idx} className="flex gap-3 items-start">
                                                    <input type="text" className="w-1/3 rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Target Field (e.g. full_address)" value={m.target_column} onChange={e => { const newM = [...mappings]; newM[idx].target_column = e.target.value; setMappings(newM); }} />
                                                    <input type="text" className="full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono flex-1" placeholder="SQL Exp (e.g. CONCAT(address1, ' ', city))" value={m.expression} onChange={e => { const newM = [...mappings]; newM[idx].expression = e.target.value; setMappings(newM); }} />
                                                    <button onClick={() => setMappings(mappings.filter((_, i) => i !== idx))} className="px-3 py-2 text-destructive hover:bg-destructive/10 rounded-md">X</button>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => setMappings([...mappings, { target_column: '', expression: '' }])} className="mt-3 text-sm text-primary font-medium hover:underline">+ Add Mapping</button>
                                    </div>

                                    <div className="pt-4 border-t border-border">
                                        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-primary" />
                                            Otomatisasi &amp; Penjadwalan
                                            <InfoTooltip info="Jalankan pipeline secara otomatis sesuai jadwal. Pipeline akan berjalan di background tanpa perlu klik manual." example="Setiap hari = 0 0 * * *  |  Setiap jam = 0 * * * *" side="right" />
                                        </h3>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 text-sm">
                                                <input type="checkbox" className="rounded text-primary focus:ring-primary" checked={cronActive} onChange={(e) => setCronActive(e.target.checked)} />
                                                Aktifkan Eksekusi Terjadwal
                                            </label>

                                            {cronActive && (
                                                <select
                                                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={cronSchedule}
                                                    onChange={(e) => setCronSchedule(e.target.value)}
                                                >
                                                    <option value="0 * * * *">Hourly</option>
                                                    <option value="0 0 * * *">Daily at Midnight</option>
                                                    <option value="0 2 * * *">Daily at 2 AM</option>
                                                    <option value="0 0 * * 0">Weekly (Sunday)</option>
                                                    <option value="0 0 1 * *">Monthly (1st day)</option>
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4 border-t border-border gap-3 items-center">
                                    <button onClick={handleSavePipeline} disabled={savePipelineMutation.isPending || !baseTable || !pipelineName} className="text-primary font-medium text-sm hover:underline mr-auto">
                                        {savePipelineMutation.isPending ? 'Saving...' : 'Save Pipeline'}
                                    </button>
                                    <button onClick={handlePreview} disabled={previewMutation.isPending || !baseTable} className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md font-medium hover:brightness-110 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                        Preview Mapping
                                    </button>
                                    <button onClick={handleRun} disabled={runMutation.isPending || !baseTable} className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:brightness-110 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseZap className="w-4 h-4" />}
                                        Run & Geocode Pipeline
                                    </button>
                                </div>

                                {/* Preview Results Table */}
                                {previewResults && (
                                    <div className="mt-6 border border-border rounded-lg overflow-hidden">
                                        <div className="bg-muted px-4 py-2 border-b border-border flex justify-between items-center">
                                            <h3 className="font-medium text-sm">Preview (Top 10 max)</h3>
                                        </div>
                                        <div className="overflow-x-auto max-h-[300px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                                                    <tr>
                                                        {Object.keys((previewResults && previewResults[0]) || {}).map(k => (
                                                            <th key={k} className="px-4 py-3">{k}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {previewResults.length === 0 ? (
                                                        <tr><td colSpan={100} className="px-4 py-4 text-center text-muted-foreground">No rows returned</td></tr>
                                                    ) : (
                                                        previewResults.map((row, i) => (
                                                            <tr key={i} className="border-b border-border hover:bg-muted/20">
                                                                {Object.values(row).map((v: any, j) => (
                                                                    <td key={j} className="px-4 py-3 truncate max-w-[200px]" title={String(v)}>{String(v)}</td>
                                                                ))}
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
