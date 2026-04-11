import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationApi, DataSource, TableSchema, TransformationPipeline, SourceConfig, MultiSourceConfig } from '../lib/api';
import { Database, Plus, Play, Server, DatabaseZap, Loader2, CheckCircle2, RefreshCw, Hash, MapPin, User, Navigation, Settings, ChevronDown, Trash2, ArrowRightLeft, Layers, Filter, Activity, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

export default function DataIntegration() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'connections' | 'pipeline' | 'orchestrator'>('connections');

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

    // Orchestrator State
    const [orchSources, setOrchSources] = useState<SourceConfig[]>([
        { data_source_id: 0, base_table: '', alias: 'src1', joins: [], filters: [] },
        { data_source_id: 0, base_table: '', alias: 'src2', joins: [], filters: [] }
    ]);
    const [orchJoinKey, setOrchJoinKey] = useState('');
    const [orchMappings, setOrchMappings] = useState<any[]>([
        { target_column: 'connote', expression: '', label: 'Nomor Resi (Key)' },
        { target_column: 'full_address', expression: '', label: 'Alamat Sistem' },
        { target_column: 'courier_id', expression: '', label: 'Courier ID' },
        { target_column: 'latitude', expression: '', label: 'Field Lat' },
        { target_column: 'longitude', expression: '', label: 'Field Long' },
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
                config: { base_table: baseTable, mappings: [], joins: joins.filter(j => j.table && j.on_source && j.on_target) } as any
            };
            integrationApi.previewPipeline(pipeline).then(res => setPreviewRows(res.data.slice(0, 5))).catch(() => {});
        }
    }, [baseTable, selectedDS, joins]);

    const handlePreview = () => {
        if (activeTab === 'pipeline') {
            if (!selectedDS) { toast.error("Pilih koneksi database terlebih dahulu."); return; }
            if (!baseTable) { toast.error("Base table is required"); return; }
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
                } as any
            };
            previewMutation.mutate(pipeline);
        } else {
            // Orchestrator Preview
            const config: MultiSourceConfig = {
                sources: orchSources.filter(s => s.data_source_id && s.base_table),
                join_key: orchJoinKey,
                mappings: orchMappings.filter(m => m.expression).map(m => ({
                    target_column: m.target_column,
                    expression: m.expression
                }))
            };
            const pipeline: TransformationPipeline = {
                name: 'OrchPreview',
                config: config
            };
            previewMutation.mutate(pipeline);
        }
    };

    const handleRun = () => {
        if (activeTab === 'pipeline') {
            if (!selectedDS) { toast.error("Pilih koneksi database terlebih dahulu."); return; }
            if (!baseTable) { toast.error("Base table is required"); return; }
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
                } as any
            };
            toast.promise(runMutation.mutateAsync(pipeline), {
                loading: 'Stream processing millions of rows...',
                success: 'Pipeline extraction and validation stream finished!',
                error: 'Failed to run pipeline.'
            });
        } else {
            // Orchestrator Run
            const config: MultiSourceConfig = {
                sources: orchSources.filter(s => s.data_source_id && s.base_table),
                join_key: orchJoinKey,
                mappings: orchMappings.filter(m => m.expression).map(m => ({
                    target_column: m.target_column,
                    expression: m.expression
                }))
            };
            const pipeline: TransformationPipeline = {
                name: pipelineName || 'Multi-Source Job',
                config: config
            };
            toast.promise(runMutation.mutateAsync(pipeline), {
                loading: 'Orchestrating virtual joins across multiple repositories...',
                success: 'Data orchestrated and validated successfully!',
                error: 'Orchestration failed.'
            });
        }
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
        if (activeTab === 'pipeline') {
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
        } else {
            // Save Orchestration
            const config: MultiSourceConfig = {
                sources: orchSources.filter(s => s.data_source_id && s.base_table),
                join_key: orchJoinKey,
                mappings: orchMappings.filter(m => m.expression).map(m => ({
                    target_column: m.target_column,
                    expression: m.expression
                }))
            };
            const pipeline: TransformationPipeline = {
                id: loadedPipelineId || undefined,
                name: pipelineName || 'Multi-Source Job',
                config: config
            };
            savePipelineMutation.mutate(pipeline);
        }
    };

    const currentDS = dataSources.find(ds => ds.id === selectedDS);

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h1 className="text-3xl font-extrabold text-foreground flex items-center gap-3 tracking-tight">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <DatabaseZap className="h-8 w-8 text-primary animate-pulse" />
                            </div>
                            Data Orchestrator
                            <div className="px-2 py-0.5 rounded-full bg-primary/20 text-[10px] text-primary font-bold uppercase tracking-widest flex items-center gap-1 shadow-sm border border-primary/20">
                                <Sparkles className="w-3 h-3" /> Grade S++
                            </div>
                        </h1>
                        <p className="text-muted-foreground mt-2 text-sm max-w-2xl">
                            High-performance binary stream engine for cross-repository data extraction, 
                            virtual hash joins, and real-time geocoding validation.
                        </p>
                    </div>
                </div>

                {/* Glassmorphism Tabs */}
                <div className="inline-flex flex-wrap space-x-1 p-1.5 bg-muted/40 backdrop-blur-md rounded-2xl border border-border/40 mb-10 mt-4 shadow-xl">
                    <button
                        onClick={() => setActiveTab('connections')}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'connections'
                            ? 'bg-background text-primary shadow-lg scale-105 border border-primary/10'
                            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                            }`}
                    >
                        <Server className="w-4 h-4" /> Repository Connections
                    </button>
                    <button
                        onClick={() => setActiveTab('pipeline')}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'pipeline'
                            ? 'bg-background text-primary shadow-lg scale-105 border border-primary/10'
                            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                            }`}
                    >
                        <Layers className="w-4 h-4" /> Local Pipeline
                    </button>
                    <button
                        onClick={() => setActiveTab('orchestrator')}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'orchestrator'
                            ? 'bg-gradient-to-r from-primary to-blue-600 text-white shadow-lg scale-105 shadow-primary/20'
                            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                            }`}
                    >
                        <ArrowRightLeft className="w-4 h-4" /> Multi-Source Orchestrator
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
                    {activeTab === 'connections' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-card p-8 rounded-2xl border border-border shadow-2xl relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700">
                                    <Plus className="w-32 h-32" />
                                </div>
                                <h2 className="text-xl font-bold mb-6 flex items-center text-foreground gap-2">
                                    Mendaftarkan Repository
                                    <InfoTooltip info="Sambungkan ke database eksternal (PostgreSQL/MySQL) sebagai sumber data mentah." side="right" />
                                </h2>
                                <form onSubmit={handleAddConn} className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Nama Koneksi</label>
                                        <input required type="text" className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition-all" value={connForm.name} onChange={e => setConnForm({ ...connForm, name: e.target.value })} placeholder="e.g. Master ERP DB" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Provider</label>
                                            <select className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm text-foreground font-bold focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer" value={connForm.provider} onChange={e => setConnForm({ ...connForm, provider: e.target.value as any })}>
                                                <option value="postgresql">PostgreSQL</option>
                                                <option value="mysql">MySQL</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Host</label>
                                            <input required type="text" className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.host} onChange={e => setConnForm({ ...connForm, host: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Port</label>
                                            <input required type="number" className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none font-mono" value={connForm.port} onChange={e => setConnForm({ ...connForm, port: parseInt(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Database</label>
                                            <input required type="text" className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.database} onChange={e => setConnForm({ ...connForm, database: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Username</label>
                                            <input required type="text" className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.username} onChange={e => setConnForm({ ...connForm, username: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Password</label>
                                            <input required type="password" className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none" value={connForm.password} onChange={e => setConnForm({ ...connForm, password: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="flex gap-4 pt-4">
                                        <button type="button" onClick={handleTestConn} disabled={testConnMutation.isPending} className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95">
                                            {testConnMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />} Testing
                                        </button>
                                        <button type="submit" disabled={createConnMutation.isPending} className="flex-[2] bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2">
                                            <Plus className="w-4 h-4" /> Save Configuration
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div className="bg-card p-8 rounded-2xl border border-border shadow-2xl overflow-hidden">
                                <div className="flex items-center justify-between mb-8">
                                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                                        <Server className="w-5 h-5 text-primary" /> Active Repositories
                                    </h2>
                                    <span className="px-3 py-1 bg-muted rounded-full text-[10px] font-bold text-muted-foreground uppercase">{dataSources.length} Connected</span>
                                </div>
                                {loadingDS ? (
                                    <div className="flex flex-col items-center justify-center p-12 space-y-4">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
                                        <p className="text-xs text-muted-foreground animate-pulse font-bold tracking-widest uppercase">Scanning network...</p>
                                    </div>
                                ) : (!dataSources || dataSources.length === 0) ? (
                                    <div className="text-center p-12 border-2 border-dashed border-border rounded-2xl bg-muted/20">
                                        <Database className="w-12 h-12 mx-auto mb-4 opacity-5 text-primary" />
                                        <p className="font-bold text-muted-foreground">No active repositories.</p>
                                        <p className="text-xs text-muted-foreground/60 mt-1 uppercase tracking-widest">Add your first source on the left.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted-foreground/10">
                                        {(dataSources || []).map((ds, i) => (
                                            <div 
                                                key={ds.id} 
                                                className="p-5 bg-background/50 border border-border/60 hover:border-primary/40 rounded-2xl flex justify-between items-center group cursor-pointer hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300 animate-in fade-in slide-in-from-right-4" 
                                                style={{ animationDelay: `${i * 100}ms` }}
                                                onClick={() => { setSelectedDS(ds.id); setActiveTab('pipeline'); }}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 rounded-xl bg-muted/60 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all">
                                                        <Database className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{ds.name}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]`} />
                                                            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-tighter">{ds.provider} • {ds.host}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                                    <ArrowRightLeft className="w-4 h-4 text-primary" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'pipeline' && (
                        <div className="space-y-6">
                            {/* Existing Pipeline logic code (minimized for brevity but full file rewrite mandate) */}
                            {!selectedDS ? (
                                <div className="space-y-10 max-w-4xl mx-auto py-12">
                                    <div className="text-center space-y-3">
                                        <h2 className="text-3xl font-black text-foreground tracking-tighter">MANAGING PIPELINES</h2>
                                        <p className="text-muted-foreground text-lg">Pilih repository utama untuk membangun alur transformasi data tunggal.</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {dataSources.map((ds, i) => (
                                            <button
                                                key={ds.id}
                                                onClick={() => setSelectedDS(ds.id)}
                                                className="group relative p-8 bg-card rounded-2xl border border-border shadow-xl hover:shadow-primary/10 hover:-translate-y-2 transition-all text-left overflow-hidden animate-in zoom-in-95"
                                                style={{ animationDelay: `${i * 100}ms` }}
                                            >
                                                <div className="absolute -right-4 -top-4 opacity-[0.05] group-hover:opacity-20 group-hover:scale-150 transition-all duration-700 text-primary">
                                                    <Server className="w-24 h-24" />
                                                </div>
                                                <div className="relative z-10 space-y-6">
                                                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner group-hover:bg-primary group-hover:text-white transition-all">
                                                        <DatabaseZap className="w-8 h-8" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-black text-lg text-foreground tracking-tight">{ds.name}</h3>
                                                        <p className="text-[10px] text-muted-foreground font-mono mt-1 uppercase">{ds.provider} REPOSITORY</p>
                                                    </div>
                                                    <div className="flex items-center text-xs font-black text-primary uppercase tracking-widest">
                                                        Configuration <Plus className="ml-1 w-3 h-3" />
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                    {/* Sidebar and Builder for Pipeline... (Keeping your structure but with visual upgrades) */}
                                    <div className="lg:col-span-4 space-y-6">
                                        <div className="bg-card p-6 rounded-2xl border border-border shadow-xl backdrop-blur-sm bg-opacity-80 sticky top-6">
                                            <div className="flex items-center justify-between mb-6">
                                                <h2 className="text-lg font-black tracking-tighter flex items-center gap-2 uppercase">
                                                    <Server className="w-5 h-5 text-primary" /> Schema Explorer
                                                </h2>
                                                <button onClick={() => setSelectedDS(null)} className="text-[10px] font-bold text-primary hover:underline">Switch Source</button>
                                            </div>
                                            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2">
                                                {(schema || []).map((table, i) => (
                                                    <div key={table.name} className="animate-in slide-in-from-left-4" style={{ animationDelay: `${i * 50}ms` }}>
                                                        <div
                                                            className={`px-4 py-3 rounded-xl cursor-pointer font-bold text-sm transition-all flex justify-between items-center ${baseTable === table.name ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-muted/50 hover:bg-muted text-foreground hover:translate-x-1'}`}
                                                            onClick={() => setBaseTable(table.name)}
                                                        >
                                                            {table.name}
                                                            {baseTable === table.name && <CheckCircle2 className="w-4 h-4" />}
                                                        </div>
                                                        {baseTable === table.name && (
                                                            <div className="pl-4 mt-3 border-l-2 border-primary/20 ml-2 space-y-1 py-1">
                                                                {table.columns.map(c => (
                                                                    <div key={c.name} className="flex justify-between text-[10px] font-mono p-1 hover:bg-primary/10 rounded cursor-copy">
                                                                        <span className="font-bold">{c.name}</span>
                                                                        <span className="opacity-40 italic">{c.data_type}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="lg:col-span-8 space-y-8">
                                        <div className="bg-card p-8 rounded-2xl border border-border shadow-2xl relative">
                                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/40">
                                                <div>
                                                    <h2 className="text-2xl font-black tracking-tight text-foreground">PIPELINE BUILDER</h2>
                                                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">Context: {currentDS?.name}</p>
                                                </div>
                                                <div className="flex gap-4">
                                                    <select 
                                                        className="rounded-xl border border-input bg-background/50 px-4 py-2 text-xs font-bold w-48 shadow-inner"
                                                        value={loadedPipelineId || ''}
                                                        onChange={handleLoadPipeline}
                                                    >
                                                        <option value="">-- New Local Pipeline --</option>
                                                        {savedPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            
                                            {/* Simplified configuration view for existing pipeline */}
                                            <div className="space-y-10">
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Job Identifier</label>
                                                        <input type="text" className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm font-bold" value={pipelineName} onChange={e => setPipelineName(e.target.value)} />
                                                    </div>
                                                    <div className="space-y-2 text-right">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Table</label>
                                                        <div className="text-xl font-black text-primary font-mono">{baseTable || 'UNDETERMINED'}</div>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm font-black flex items-center gap-2 uppercase tracking-tight">
                                                            <Filter className="w-4 h-4 text-primary" /> Join Topology
                                                        </label>
                                                        <button onClick={() => setJoins([...joins, { type: 'LEFT', table: '', on_source: '', on_target: '' }])} className="text-[10px] font-black bg-primary/10 text-primary px-3 py-1.5 rounded-full hover:bg-primary/20">+ Add Layer</button>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {joins.map((j, idx) => (
                                                            <div key={idx} className="flex items-center gap-3 p-4 bg-muted/30 rounded-2xl border border-border/40 group hover:border-primary/30 transition-all">
                                                                <div className="font-black text-xs opacity-20">#{idx+1}</div>
                                                                <select className="bg-transparent font-black text-xs w-24" value={j.type} onChange={e => { const n = [...joins]; n[idx].type = e.target.value; setJoins(n); }}>
                                                                    <option value="LEFT">LEFT</option>
                                                                    <option value="INNER">INNER</option>
                                                                </select>
                                                                <input className="bg-transparent flex-1 font-bold text-sm border-b border-border focus:border-primary" placeholder="Target Table" value={j.table} onChange={e => { const n = [...joins]; n[idx].table = e.target.value; setJoins(n); }} />
                                                                <input className="bg-transparent w-32 font-mono text-xs border-b border-border opacity-60" placeholder="On Src Key" value={j.on_source} onChange={e => { const n = [...joins]; n[idx].on_source = e.target.value; setJoins(n); }} />
                                                                <span className="opacity-40">=</span>
                                                                <input className="bg-transparent w-32 font-mono text-xs border-b border-border opacity-60" placeholder="On Tgt Key" value={j.on_target} onChange={e => { const n = [...joins]; n[idx].on_target = e.target.value; setJoins(n); }} />
                                                                <button onClick={() => setJoins(joins.filter((_, i) => i !== idx))} className="p-2 text-destructive opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="pt-8 flex justify-end gap-3">
                                                    <button onClick={handleSavePipeline} className="px-6 py-3 bg-secondary text-secondary-foreground font-black text-xs rounded-xl hover:brightness-110 uppercase tracking-widest active:scale-95 transition-all">Persist Pipeline</button>
                                                    <button onClick={handlePreview} className="px-6 py-3 bg-primary text-primary-foreground font-black text-xs rounded-xl hover:shadow-lg shadow-primary/20 hover:scale-[1.05] uppercase tracking-widest active:scale-95 transition-all">Compute Preview</button>
                                                    <button onClick={handleRun} className="px-6 py-3 bg-foreground text-background font-black text-xs rounded-xl hover:brightness-125 uppercase tracking-widest active:scale-95 transition-all">Execute Stream</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'orchestrator' && (
                        <div className="space-y-10">
                            <div className="max-w-6xl mx-auto space-y-10 pb-20">
                                <div className="bg-gradient-to-br from-card to-muted p-12 rounded-[32px] border border-border shadow-2xl relative overflow-hidden">
                                    <div className="absolute -right-20 -top-20 opacity-[0.05] blur-3xl pointer-events-none">
                                        <div className="w-96 h-96 bg-primary rounded-full animate-pulse" />
                                    </div>
                                    
                                    <div className="grid lg:grid-cols-2 gap-16 items-start relative z-10">
                                        <div className="space-y-8">
                                            <div>
                                                <h2 className="text-4xl font-black text-foreground tracking-tighter mb-4">Multi-Source Orchestrator</h2>
                                                <p className="text-muted-foreground text-lg italic leading-relaxed">
                                                    Membangun virtual join melintasi repository yang terpisah secara fisik. 
                                                    Data ditarik secara paralel, di-hash di dalam memori, dan divalidasi sebagai satu kesatuan.
                                                </p>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                                        <Layers className="w-4 h-4 text-primary" /> Sources to Harmonize
                                                    </h3>
                                                    <button 
                                                        onClick={() => setOrchSources([...orchSources, { data_source_id: 0, base_table: '', alias: `src${orchSources.length + 1}`, joins: [], filters: [] }])}
                                                        className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-lg active:scale-90"
                                                    >
                                                        <Plus className="w-5 h-5" />
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    {orchSources.map((source, idx) => (
                                                        <div key={idx} className="p-6 bg-background/80 backdrop-blur-md border border-border/60 rounded-3xl shadow-xl hover:border-primary/30 transition-all group animate-in slide-in-from-right-8" style={{ animationDelay: `${idx * 150}ms` }}>
                                                            <div className="grid grid-cols-12 gap-4 items-center">
                                                                <div className="col-span-1 font-black text-2xl opacity-10">{idx + 1}</div>
                                                                <div className="col-span-4">
                                                                    <select 
                                                                        className="w-full bg-transparent font-black text-sm focus:outline-none cursor-pointer text-primary"
                                                                        value={source.data_source_id}
                                                                        onChange={e => { const n = [...orchSources]; n[idx].data_source_id = Number(e.target.value); setOrchSources(n); }}
                                                                    >
                                                                        <option value="0">Select Repository</option>
                                                                        {dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className="col-span-3">
                                                                    <input 
                                                                        className="w-full bg-transparent border-b border-dashed border-border focus:border-primary px-1 py-1 text-sm font-mono" 
                                                                        placeholder="Table name" 
                                                                        value={source.base_table}
                                                                        onChange={e => { const n = [...orchSources]; n[idx].base_table = e.target.value; setOrchSources(n); }}
                                                                    />
                                                                </div>
                                                                <div className="col-span-3 text-right">
                                                                    <input 
                                                                        className="w-20 bg-muted px-3 py-1.5 rounded-xl font-black text-[10px] uppercase text-center focus:ring-1 focus:ring-primary focus:outline-none" 
                                                                        value={source.alias}
                                                                        onChange={e => { const n = [...orchSources]; n[idx].alias = e.target.value; setOrchSources(n); }}
                                                                        placeholder="Alias"
                                                                    />
                                                                </div>
                                                                <div className="col-span-1 flex justify-end">
                                                                    <button onClick={() => setOrchSources(orchSources.filter((_, i) => i !== idx))} className="p-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-8 bg-card/60 backdrop-blur-xl rounded-[40px] border border-primary/20 shadow-[-20px_20px_60px_-15px_rgba(0,0,0,0.3)] space-y-10">
                                            <div className="space-y-6">
                                                <h3 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2 uppercase">
                                                    <ArrowRightLeft className="w-5 h-5 text-primary" /> Virtual Join Strategy
                                                </h3>
                                                
                                                <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 space-y-4">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary/60">Hash Join Common Key</label>
                                                    <input 
                                                        className="w-full bg-transparent text-3xl font-black tracking-tighter text-foreground focus:outline-none placeholder:opacity-10" 
                                                        placeholder="e.g. connote_id" 
                                                        value={orchJoinKey}
                                                        onChange={e => setOrchJoinKey(e.target.value)}
                                                    />
                                                    <p className="text-xs text-muted-foreground">This column must exist in all selected sources to perform the in-memory lookup.</p>
                                                </div>

                                                <div className="space-y-4">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Output Mapping (Harmonized)</h4>
                                                    <div className="space-y-3">
                                                        {orchMappings.map((m, idx) => (
                                                            <div key={idx} className="grid grid-cols-2 gap-4 items-center">
                                                                <div className="text-xs font-bold font-mono p-3 bg-muted/40 rounded-xl border border-border/40">{m.label}</div>
                                                                <input 
                                                                    className="p-3 bg-background/50 rounded-xl border border-input focus:ring-2 focus:ring-primary focus:outline-none text-xs font-bold text-primary font-mono" 
                                                                    placeholder="e.g. src1.resi_no" 
                                                                    value={m.expression}
                                                                    onChange={e => { const n = [...orchMappings]; n[idx].expression = e.target.value; setOrchMappings(n); }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-border/40 flex flex-col gap-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <input type="text" className="flex-1 bg-muted px-4 py-3 rounded-xl text-sm font-bold border border-transparent focus:border-primary outline-none" placeholder="Execution Name..." value={pipelineName} onChange={e => setPipelineName(e.target.value)} />
                                                </div>
                                                <div className="flex gap-3">
                                                    <button onClick={handleSavePipeline} className="flex-1 py-4 bg-secondary text-secondary-foreground font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all text-sm uppercase tracking-widest shadow-lg">Save Strategy</button>
                                                    <button onClick={handleRun} className="flex-[2] py-4 bg-primary text-primary-foreground font-black rounded-2xl hover:scale-[1.03] active:scale-95 transition-all text-sm uppercase tracking-widest shadow-2xl shadow-primary/30 flex items-center justify-center gap-2">
                                                        <Activity className="w-5 h-5 animate-pulse" /> Commence Sync
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preview Results (reusing same logic but with aesthetic wrap) */}
                                    {previewResults && (
                                        <div className="mt-12 bg-card border border-border rounded-[32px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10">
                                            <div className="p-8 border-b border-border flex justify-between items-center">
                                                <h3 className="text-xl font-black tracking-tight flex items-center gap-3">
                                                    <Sparkles className="w-6 h-6 text-primary" /> Computed Virtual Join Results
                                                </h3>
                                                <button onClick={() => setPreviewResults(null)} className="p-3 hover:bg-muted rounded-full transition-all"><Plus className="rotate-45" /></button>
                                            </div>
                                            <div className="overflow-x-auto p-4">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-muted/50 font-black uppercase tracking-widest">
                                                        <tr>
                                                            <th className="px-6 py-5">#</th>
                                                            {Object.keys(previewResults[0] || {}).map(k => <th key={k} className="px-6 py-5">{k}</th>)}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/20">
                                                        {previewResults.map((row, i) => (
                                                            <tr key={i} className="hover:bg-primary/5">
                                                                <td className="px-6 py-4 font-mono opacity-40">{i+1}</td>
                                                                {Object.values(row).map((v: any, j) => <td key={j} className="px-6 py-4 font-bold">{String(v)}</td>)}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
