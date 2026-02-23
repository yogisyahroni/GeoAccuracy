import { useState } from 'react';
import { Database, Plus, Trash2, TestTube, CheckCircle, XCircle, ChevronDown, ChevronUp, Eye, EyeOff, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type DbType = 'postgresql' | 'mysql' | 'mongodb' | 'mssql' | 'oracle' | 'sqlite';

export interface DbConnection {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  status: 'idle' | 'testing' | 'connected' | 'failed';
  sslEnabled: boolean;
}

const DB_TYPES: { value: DbType; label: string; defaultPort: string; icon: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: '5432', icon: '🐘' },
  { value: 'mysql', label: 'MySQL / MariaDB', defaultPort: '3306', icon: '🐬' },
  { value: 'mongodb', label: 'MongoDB', defaultPort: '27017', icon: '🍃' },
  { value: 'mssql', label: 'SQL Server (MSSQL)', defaultPort: '1433', icon: '🪟' },
  { value: 'oracle', label: 'Oracle DB', defaultPort: '1521', icon: '🔴' },
  { value: 'sqlite', label: 'SQLite (file path)', defaultPort: '-', icon: '📁' },
];

interface DatabaseConnectorProps {
  onConnectionSelect?: (conn: DbConnection | null) => void;
}

const generateId = () => Math.random().toString(36).slice(2, 9);

const emptyConn = (): DbConnection => ({
  id: generateId(),
  name: 'Koneksi Baru',
  type: 'postgresql',
  host: 'localhost',
  port: '5432',
  database: '',
  username: '',
  password: '',
  status: 'idle',
  sslEnabled: false,
});

// Komponen tooltip kecil dengan ikon "?"
function Info({ text, example }: { text: string; example?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center ml-1 cursor-help text-muted-foreground hover:text-primary transition-colors" tabIndex={0}>
            <HelpCircle className="w-3 h-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left p-3 space-y-1 z-[100]">
          <p className="text-xs leading-snug">{text}</p>
          {example && (
            <p className="font-mono text-[10px] bg-muted/70 text-primary rounded px-2 py-1 mt-1 whitespace-pre-line">
              {example}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function DatabaseConnector({ onConnectionSelect }: DatabaseConnectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const addConnection = () => {
    const conn = emptyConn();
    setConnections(prev => [...prev, conn]);
    setEditingId(conn.id);
  };

  const updateConn = (id: string, patch: Partial<DbConnection>) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const deleteConn = (id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      onConnectionSelect?.(null);
    }
    if (editingId === id) setEditingId(null);
  };

  const testConnection = async (id: string) => {
    const conn = connections.find(c => c.id === id);
    if (!conn) return;

    updateConn(id, { status: 'testing' });
    try {
      const token = localStorage.getItem('geoaccuracy_token');
      const res = await fetch('/api/datasources/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          db_type: conn.type,
          host: conn.host,
          port: conn.port,
          database: conn.database,
          username: conn.username,
          password: conn.password,
          ssl_enabled: conn.sslEnabled,
        }),
      });

      if (res.ok) {
        updateConn(id, { status: 'connected' });
      } else {
        updateConn(id, { status: 'failed' });
      }
    } catch {
      updateConn(id, { status: 'failed' });
    }
  };

  const selectConnection = (conn: DbConnection) => {
    setActiveId(conn.id);
    onConnectionSelect?.(conn);
  };

  const getDbInfo = (type: DbType) => DB_TYPES.find(d => d.value === type)!;

  const handleTypeChange = (id: string, type: DbType) => {
    const info = DB_TYPES.find(d => d.value === type)!;
    updateConn(id, { type, port: info.defaultPort });
  };

  return (
    <div className="section-card">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="text-sm font-semibold flex items-center" style={{ color: 'hsl(var(--foreground))' }}>
              Koneksi Database
              <Info
                text="Sambungkan database eksternal (PostgreSQL, MySQL, dsb.) sebagai sumber data pipeline. Koneksi ini digunakan untuk ETL — mengambil data alamat dari tabel Anda lalu menjalankan proses geokode."
                example="Contoh: Database ERP di server produksi yang berisi tabel orders dengan kolom alamat."
              />
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono"
              style={{ background: 'hsl(var(--surface-3))', color: 'hsl(var(--muted-foreground))' }}>
              {connections.length} koneksi
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={addConnection}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))', border: '1px solid hsl(var(--primary) / 0.25)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Koneksi
            </button>
            <button onClick={() => setExpanded(!expanded)} style={{ color: 'hsl(var(--muted-foreground))' }}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Connection List */}
      {(expanded || connections.length > 0) && (
        <div className="p-5 space-y-3">
          {connections.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <Database className="w-8 h-8 mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Belum ada koneksi database</p>
              <button onClick={addConnection}
                className="mt-3 text-xs px-4 py-2 rounded-lg transition-all"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                + Tambah Koneksi Pertama
              </button>
            </div>
          ) : (
            connections.map(conn => (
              <div key={conn.id} className="rounded-xl border transition-all"
                style={{
                  borderColor: activeId === conn.id ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--border))',
                  background: activeId === conn.id ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--surface-2))',
                }}>
                {/* Connection Header */}
                <div className="p-4 flex items-center gap-3">
                  <span className="text-lg">{getDbInfo(conn.type).icon}</span>
                  <div className="flex-1 min-w-0">
                    {editingId === conn.id ? (
                      <input
                        value={conn.name}
                        onChange={e => updateConn(conn.id, { name: e.target.value })}
                        className="text-sm font-semibold bg-transparent border-b outline-none w-full"
                        style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--primary) / 0.4)' }}
                      />
                    ) : (
                      <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>{conn.name}</p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {getDbInfo(conn.type).label} · {conn.host}:{conn.port} / {conn.database || '—'}
                    </p>
                  </div>
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {conn.status === 'connected' && <CheckCircle className="w-4 h-4" style={{ color: 'hsl(142 70% 55%)' }} />}
                    {conn.status === 'failed' && <XCircle className="w-4 h-4" style={{ color: 'hsl(0 72% 60%)' }} />}
                    {conn.status === 'testing' && <span className="text-xs animate-pulse" style={{ color: 'hsl(var(--primary))' }}>Menguji...</span>}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setEditingId(editingId === conn.id ? null : conn.id)}
                      className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                      style={{ color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}>
                      {editingId === conn.id ? 'Tutup' : 'Edit'}
                    </button>
                    <button onClick={() => testConnection(conn.id)}
                      disabled={conn.status === 'testing'}
                      title="Uji koneksi ke database menggunakan kredensial yang diisi"
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50"
                      style={{ color: 'hsl(215 100% 60%)', borderColor: 'hsl(215 100% 60% / 0.3)' }}>
                      <TestTube className="w-3 h-3" />
                      {conn.status === 'testing' ? 'Menguji...' : 'Test'}
                    </button>
                    <button onClick={() => selectConnection(conn)}
                      title="Pilih koneksi ini sebagai sumber data untuk pipeline"
                      className="text-xs px-2.5 py-1 rounded-lg transition-all"
                      style={{
                        background: activeId === conn.id ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.1)',
                        color: activeId === conn.id ? 'hsl(var(--primary-foreground))' : 'hsl(var(--primary))',
                      }}>
                      {activeId === conn.id ? '✓ Aktif' : 'Gunakan'}
                    </button>
                    <button onClick={() => deleteConn(conn.id)}
                      title="Hapus koneksi ini"
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'hsl(0 72% 60%)' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Edit Form */}
                {editingId === conn.id && (
                  <div className="px-4 pb-4 border-t border-border pt-4 grid grid-cols-2 md:grid-cols-3 gap-3 animate-fade-in">
                    {/* DB Type */}
                    <div className="col-span-2 md:col-span-3">
                      <label className="text-xs font-medium mb-1 flex items-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Tipe Database
                        <Info text="Pilih jenis database yang ingin disambungkan. Port akan terisi otomatis sesuai standar masing-masing database." example="PostgreSQL = 5432 | MySQL = 3306 | MongoDB = 27017" />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {DB_TYPES.map(db => (
                          <button key={db.value} onClick={() => handleTypeChange(conn.id, db.value)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all"
                            style={{
                              background: conn.type === db.value ? 'hsl(var(--primary) / 0.15)' : 'transparent',
                              borderColor: conn.type === db.value ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--border))',
                              color: conn.type === db.value ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                            }}>
                            <span>{db.icon}</span> {db.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Host */}
                    <div>
                      <label className="text-xs font-medium mb-1 flex items-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {conn.type === 'sqlite' ? 'File Path' : 'Host / IP Server'}
                        <Info
                          text={conn.type === 'sqlite'
                            ? "Masukkan jalur lengkap ke file SQLite di server backend."
                            : "Alamat IP atau nama host server database. Gunakan 'localhost' jika database ada di server yang sama dengan backend."}
                          example={conn.type === 'sqlite' ? "/var/data/db.sqlite" : "localhost  atau  192.168.1.10  atau  db.perusahaan.com"}
                        />
                      </label>
                      <input value={conn.host} onChange={e => updateConn(conn.id, { host: e.target.value })}
                        placeholder={conn.type === 'sqlite' ? '/path/to/db.sqlite' : 'localhost'}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border bg-transparent outline-none"
                        style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }} />
                    </div>

                    {/* Port */}
                    {conn.type !== 'sqlite' && (
                      <div>
                        <label className="text-xs font-medium mb-1 flex items-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Port
                          <Info text="Nomor port tempat database berjalan. Biasanya tidak perlu diubah kecuali database dikonfigurasi dengan port non-standar." example="PostgreSQL=5432 | MySQL=3306 | MongoDB=27017 | MSSQL=1433" />
                        </label>
                        <input value={conn.port} onChange={e => updateConn(conn.id, { port: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border bg-transparent outline-none"
                          style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }} />
                      </div>
                    )}

                    {/* Database Name */}
                    {conn.type !== 'sqlite' && (
                      <div>
                        <label className="text-xs font-medium mb-1 flex items-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {conn.type === 'mongodb' ? 'Nama Database' : 'Database / Schema'}
                          <Info text="Nama database atau schema yang akan diakses. Pastikan user memiliki hak akses READ minimal ke database ini." example="geodata  atau  db_logistik  atau  warehouse_prod" />
                        </label>
                        <input value={conn.database} onChange={e => updateConn(conn.id, { database: e.target.value })}
                          placeholder="nama_database"
                          className="w-full px-3 py-1.5 text-xs rounded-lg border bg-transparent outline-none"
                          style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }} />
                      </div>
                    )}

                    {/* Username */}
                    {conn.type !== 'sqlite' && (
                      <div>
                        <label className="text-xs font-medium mb-1 flex items-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Username
                          <Info text="Username akun database yang memiliki hak READ ke tabel yang dibutuhkan. Disarankan membuat user khusus dengan hak akses terbatas (READ ONLY) untuk keamanan." example="db_readonly_user  atau  etl_service" />
                        </label>
                        <input value={conn.username} onChange={e => updateConn(conn.id, { username: e.target.value })}
                          placeholder="username"
                          className="w-full px-3 py-1.5 text-xs rounded-lg border bg-transparent outline-none"
                          style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }} />
                      </div>
                    )}

                    {/* Password */}
                    {conn.type !== 'sqlite' && (
                      <div>
                        <label className="text-xs font-medium mb-1 flex items-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Password
                          <Info text="Password akun database. Disimpan terenkripsi di session browser dan tidak pernah dikirim ke server pihak ketiga. Gunakan tombol 'Test' untuk memverifikasi kredensial." />
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword[conn.id] ? 'text' : 'password'}
                            value={conn.password} onChange={e => updateConn(conn.id, { password: e.target.value })}
                            placeholder="••••••••"
                            className="w-full pl-3 pr-8 py-1.5 text-xs rounded-lg border bg-transparent outline-none"
                            style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }} />
                          <button
                            type="button"
                            onClick={() => setShowPassword(p => ({ ...p, [conn.id]: !p[conn.id] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {showPassword[conn.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SSL */}
                    {conn.type !== 'sqlite' && conn.type !== 'mongodb' && (
                      <div className="flex items-center gap-2 mt-1">
                        <input type="checkbox" id={`ssl-${conn.id}`} checked={conn.sslEnabled}
                          onChange={e => updateConn(conn.id, { sslEnabled: e.target.checked })}
                          className="rounded" />
                        <label htmlFor={`ssl-${conn.id}`} className="text-xs flex items-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Aktifkan SSL/TLS
                          <Info text="Enkripsi koneksi ke database menggunakan SSL/TLS. Wajib diaktifkan untuk database di cloud (AWS RDS, Cloud SQL, Azure DB) atau jaringan yang tidak aman." example="Aktifkan untuk: Database production, cloud database\nNonaktifkan untuk: Database lokal development" />
                        </label>
                      </div>
                    )}

                    {/* Connection String Preview */}
                    <div className="col-span-2 md:col-span-3">
                      <label className="text-xs font-medium mb-1 flex items-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        String Koneksi (preview)
                        <Info text="Pratinjau string koneksi yang akan digunakan backend untuk terhubung ke database. Password disembunyikan (***) untuk keamanan. String ini otomatis dibentuk dari isian di atas." />
                      </label>
                      <code className="block text-xs px-3 py-2 rounded-lg font-mono break-all"
                        style={{ background: 'hsl(var(--surface-3))', color: 'hsl(var(--primary))' }}>
                        {conn.type === 'postgresql' && `postgresql://${conn.username}:***@${conn.host}:${conn.port}/${conn.database}${conn.sslEnabled ? '?sslmode=require' : ''}`}
                        {conn.type === 'mysql' && `${conn.username}:***@tcp(${conn.host}:${conn.port})/${conn.database}`}
                        {conn.type === 'mongodb' && `mongodb://${conn.username}:***@${conn.host}:${conn.port}/${conn.database}`}
                        {conn.type === 'mssql' && `sqlserver://${conn.username}:***@${conn.host}:${conn.port}?database=${conn.database}`}
                        {conn.type === 'oracle' && `oracle://${conn.username}:***@${conn.host}:${conn.port}/${conn.database}`}
                        {conn.type === 'sqlite' && `sqlite://${conn.host}`}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
