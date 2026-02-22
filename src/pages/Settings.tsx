import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Key, CheckCircle2, Save, Loader2, Eye, EyeOff, Shield, User, Info, TerminalSquare, Copy, Trash2 } from 'lucide-react';
import { settingsApi, type UserSettings } from '@/lib/api';
import { webhookAPI, type ExternalAPIKey } from '@/services/api/webhooks';

type Tab = 'maps' | 'developer' | 'profile' | 'about';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('maps');

    return (
        <div className="p-5 max-w-3xl mx-auto space-y-5">
            {/* Tab bar */}
            <div
                className="flex gap-1 p-1 rounded-xl"
                style={{ background: 'hsl(var(--surface-2) / 0.6)' }}
            >
                {([
                    { id: 'maps' as Tab, label: 'API Maps', icon: Key },
                    { id: 'developer' as Tab, label: 'Developer', icon: TerminalSquare },
                    { id: 'profile' as Tab, label: 'Profil', icon: User },
                    { id: 'about' as Tab, label: 'Tentang', icon: Shield },
                ] as const).map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium flex-1 justify-center transition-all duration-150"
                        style={
                            activeTab === id
                                ? { background: 'hsl(var(--surface-1))', color: 'hsl(var(--foreground))', boxShadow: '0 1px 4px hsl(220 27% 4% / 0.3)' }
                                : { color: 'hsl(var(--muted-foreground))' }
                        }
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'maps' && <MapsAPITab />}
            {activeTab === 'developer' && <DeveloperTab />}
            {activeTab === 'profile' && <ProfileTab />}
            {activeTab === 'about' && <AboutTab />}
        </div>
    );
}

// ─── Tab: Geocoding API Keys ───────────────────────────────────────────────

function MapsAPITab() {
    const [keys, setKeys] = useState({ maps_key: '', geoapify_key: '', position_stack_key: '' });
    const [showKey, setShowKey] = useState({ maps: false, geoapify: false, posstack: false });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<Record<string, { valid: boolean; message: string } | null>>({
        google: null, geoapify: null, positionstack: null
    });

    useEffect(() => {
        settingsApi.getSettings()
            .then((s: UserSettings) => setKeys({
                maps_key: s.maps_key ?? '',
                geoapify_key: s.geoapify_key ?? '',
                position_stack_key: s.position_stack_key ?? ''
            }))
            .catch(() => toast.error('Gagal memuat pengaturan'))
            .finally(() => setLoading(false));
    }, []);

    const handleTest = async (provider: 'google' | 'geoapify' | 'positionstack') => {
        const keyMap = { google: keys.maps_key, geoapify: keys.geoapify_key, positionstack: keys.position_stack_key };
        const k = keyMap[provider];
        if (!k.trim()) return toast.error(`Masukkan API key untuk ${provider} terlebih dahulu`);

        setTesting(provider);
        setTestResult(prev => ({ ...prev, [provider]: null }));
        try {
            const res = await settingsApi.testProviderKey(provider, k);
            setTestResult(prev => ({ ...prev, [provider]: res }));
            if (res.valid) toast.success(`${provider} API Key valid!`);
            else toast.error(`${provider}: ${res.message}`);
        } catch {
            toast.error(`Gagal menguji API key ${provider}`);
        } finally {
            setTesting(null);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await settingsApi.updateSettings(keys);
            toast.success('Pengaturan API key berhasil disimpan');
        } catch {
            toast.error('Gagal menyimpan API key');
        } finally {
            setSaving(false);
        }
    };

    const renderInput = (
        id: 'google' | 'geoapify' | 'positionstack',
        label: string,
        desc: string,
        val: string,
        show: boolean,
        onChange: (v: string) => void,
        onToggleShow: () => void
    ) => (
        <div className="pt-4 border-t" style={{ borderColor: 'hsl(var(--border) / 0.5)' }}>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{desc}</p>
                </div>
                <button
                    onClick={() => handleTest(id)}
                    disabled={testing === id || !val.trim() || loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                    {testing === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Uji Key
                </button>
            </div>
            {loading ? (
                <div className="h-11 rounded-xl animate-pulse" style={{ background: 'hsl(var(--muted) / 0.5)' }} />
            ) : (
                <div className="relative">
                    <input
                        type={show ? 'text' : 'password'}
                        value={val}
                        onChange={e => { onChange(e.target.value); setTestResult(prev => ({ ...prev, [id]: null })); }}
                        placeholder="Masukkan API Key..."
                        className="w-full h-11 px-4 pr-10 rounded-xl text-sm border outline-none focus:ring-2 font-mono transition-all"
                        style={{
                            background: 'hsl(var(--surface-2))',
                            borderColor: testResult[id] === null
                                ? 'hsl(var(--border))'
                                : testResult[id]?.valid ? 'hsl(142 70% 45% / 0.5)' : 'hsl(var(--destructive) / 0.5)',
                            color: 'hsl(var(--foreground))',
                            // @ts-expect-error custom CSS var
                            '--tw-ring-color': 'hsl(var(--primary) / 0.15)',
                        }}
                    />
                    <button
                        onClick={onToggleShow}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
            )}
            {testResult[id] && (
                <div className="flex items-center gap-1.5 mt-2 test-xs text-xs">
                    <CheckCircle2
                        className="w-3.5 h-3.5"
                        style={{ color: testResult[id]?.valid ? 'hsl(142 70% 55%)' : 'hsl(var(--destructive))' }}
                    />
                    <span style={{ color: testResult[id]?.valid ? 'hsl(142 70% 55%)' : 'hsl(var(--destructive))' }}>
                        {testResult[id]?.message}
                    </span>
                </div>
            )}
        </div>
    );

    return (
        <div className="section-card p-6 space-y-5">
            <div className="flex items-start gap-3 mb-2">
                <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'hsl(var(--primary) / 0.1)', border: '1px solid hsl(var(--primary) / 0.2)' }}
                >
                    <Key className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Geocoding API Keys</p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Sistem Geoverify beroperasi dalam mode <strong>Waterfall Fallback</strong>: <br />
                        <span className="text-primary font-mono opacity-80">Nominatim (Free) → Geoapify → PositionStack → Google Maps</span>
                    </p>
                </div>
            </div>

            {/* Info box */}
            <div
                className="rounded-lg border p-3.5 flex gap-2.5"
                style={{ background: 'hsl(var(--primary) / 0.04)', borderColor: 'hsl(var(--primary) / 0.15)' }}
            >
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Konfigurasi kunci API tambahan sangat disarankan untuk mode Batch, karena batas permintaan Nominatim (1 RPS) dapat memperlambat validasi data skala besar.
                </p>
            </div>

            {renderInput('geoapify', 'Geoapify API Key', 'Freemium - 3,000 req/hari.', keys.geoapify_key, showKey.geoapify,
                v => setKeys(prev => ({ ...prev, geoapify_key: v })), () => setShowKey(prev => ({ ...prev, geoapify: !prev.geoapify })))}

            {renderInput('positionstack', 'PositionStack API Key', 'Freemium - 10,000 req/bulan.', keys.position_stack_key, showKey.posstack,
                v => setKeys(prev => ({ ...prev, position_stack_key: v })), () => setShowKey(prev => ({ ...prev, posstack: !prev.posstack })))}

            {renderInput('google', 'Google Maps API Key', 'Premium - Butuh Google Cloud Billing.', keys.maps_key, showKey.maps,
                v => setKeys(prev => ({ ...prev, maps_key: v })), () => setShowKey(prev => ({ ...prev, maps: !prev.maps })))}

            {/* Actions */}
            <div className="flex justify-end pt-4" style={{ borderColor: 'hsl(var(--border) / 0.5)' }}>
                <button
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                    style={{
                        background: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary-foreground))',
                        boxShadow: '0 0 16px hsl(var(--primary) / 0.3)',
                    }}
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
            </div>
        </div>
    );
}

// ─── Tab: Developer / Webhook Keys ──────────────────────────────────────────

function DeveloperTab() {
    const [keys, setKeys] = useState<ExternalAPIKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);

    const loadKeys = async () => {
        setLoading(true);
        try {
            const data = await webhookAPI.listAPIKeys();
            setKeys(data);
        } catch {
            toast.error('Gagal memuat API Keys eksternal');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadKeys();
    }, []);

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim()) return;

        setGenerating(true);
        try {
            const res = await webhookAPI.createAPIKey(newKeyName);
            setNewlyGeneratedKey(res.rawKey);
            setNewKeyName('');
            toast.success('API Key berhasil dibuat');
            loadKeys();
        } catch (err: any) {
            toast.error(err.message || 'Gagal membuat API Key');
        } finally {
            setGenerating(false);
        }
    };

    const handleRevoke = async (id: string, name: string) => {
        if (!confirm(`Hapus hak akses untuk kunci "${name}"? Kunci ini akan segera tidak valid.`)) return;

        try {
            await webhookAPI.revokeAPIKey(id);
            toast.success('API Key berhasil di-revoke');
            loadKeys();
        } catch {
            toast.error('Gagal menghapus API Key');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Ter-copy ke clipboard');
    };

    return (
        <div className="section-card p-6 space-y-6">
            <div className="flex items-start gap-3">
                <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'hsl(var(--primary) / 0.1)', border: '1px solid hsl(var(--primary) / 0.2)' }}
                >
                    <TerminalSquare className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Ingestion Webhooks</p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Gunakan API Key eksternal untuk mengintegrasikan sistem pihak ketiga (ERP/WMS) secara aman tanpa perlu session login, gunakan header <code className="bg-primary/20 text-primary px-1 rounded">X-API-Key: sk_prod_...</code>
                    </p>
                </div>
            </div>

            {/* New Key Alert */}
            {newlyGeneratedKey && (
                <div className="p-4 rounded-xl border border-primary bg-primary/5 space-y-3">
                    <p className="text-sm font-semibold text-primary">Simpan API Key Ini Sekarang!</p>
                    <p className="text-xs text-muted-foreground">Kunci ini tidak akan pernah ditampilkan lagi demi tujuan keamanan.</p>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            readOnly
                            value={newlyGeneratedKey}
                            className="flex-1 px-3 py-2 text-sm font-mono bg-background border border-border rounded-lg outline-none"
                        />
                        <button
                            onClick={() => copyToClipboard(newlyGeneratedKey)}
                            className="p-2 bg-primary text-primary-foreground rounded-lg hover:brightness-110 active:scale-95 transition-all"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Generator Form */}
            <form onSubmit={handleGenerate} className="flex gap-2 items-end pt-2">
                <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-foreground">Nama Aplikasi Eksternal</label>
                    <input
                        type="text"
                        value={newKeyName}
                        onChange={e => setNewKeyName(e.target.value)}
                        placeholder="Cth: SAP Transport Prod"
                        className="w-full h-10 px-3 rounded-lg text-sm border outline-none focus:ring-2 bg-surface-2 border-border text-foreground transition-all"
                        style={{ '--tw-ring-color': 'hsl(var(--primary) / 0.15)' } as React.CSSProperties}
                        required
                        minLength={3}
                    />
                </div>
                <button
                    type="submit"
                    disabled={generating || !newKeyName.trim()}
                    className="h-10 px-4 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-medium text-sm rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                    Buat Kunci
                </button>
            </form>

            <hr className="border-border" />

            {/* Key List */}
            <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Kunci API Aktif</p>
                {loading ? (
                    <div className="flex items-center justify-center p-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                ) : keys.length === 0 ? (
                    <p className="text-sm text-center p-6 text-muted-foreground border border-dashed border-border rounded-xl">
                        Belum ada Webhook Key aktif.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {keys.map(k => (
                            <div key={k.id} className="flex items-center justify-between p-3 border border-border bg-surface-2 rounded-xl">
                                <div>
                                    <p className="text-sm font-medium text-foreground">{k.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <code className="text-xs px-1.5 py-0.5 rounded bg-foreground/10 text-muted-foreground font-mono">
                                            {k.prefix}••••
                                        </code>
                                        <span className="text-[10px] text-muted-foreground">
                                            Dibuat: {new Date(k.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRevoke(k.id, k.name)}
                                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                    title="Revoke Token"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Tab: Profile (placeholder) ───────────────────────────────────────────────

function ProfileTab() {
    return (
        <div className="section-card p-6">
            <div className="flex items-center gap-3 mb-5">
                <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'hsl(var(--primary) / 0.1)', border: '1px solid hsl(var(--primary) / 0.2)' }}
                >
                    <User className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Profil Pengguna</p>
            </div>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Segera hadir — edit nama dan ganti password.
            </p>
        </div>
    );
}

// ─── Tab: About ───────────────────────────────────────────────────────────────

function AboutTab() {
    return (
        <div className="section-card p-6 space-y-4">
            <div className="flex items-center gap-3">
                <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'hsl(var(--primary) / 0.1)', border: '1px solid hsl(var(--primary) / 0.2)' }}
                >
                    <Shield className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                    <p className="text-sm font-bold" style={{ color: 'hsl(var(--primary))' }}>GeoAccuracy</p>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Logistics Address Validator v2.0.0</p>
                </div>
            </div>
            <div className="space-y-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <p>Stack: <strong style={{ color: 'hsl(var(--foreground))' }}>React 18 + TypeScript</strong> (frontend) dan <strong style={{ color: 'hsl(var(--foreground))' }}>Go 1.21 + Gin</strong> (backend)</p>
                <p>Database: <strong style={{ color: 'hsl(var(--foreground))' }}>PostgreSQL</strong></p>
                <p>Geocoding: <strong style={{ color: 'hsl(var(--foreground))' }}>Nominatim (default)</strong> atau Google Maps API (jika key dikonfigurasi)</p>
                <p>Jarak dihitung dengan formula <strong style={{ color: 'hsl(var(--foreground))' }}>Haversine</strong>.</p>
            </div>
        </div>
    );
}
