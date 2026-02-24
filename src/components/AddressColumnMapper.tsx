import { useState } from 'react';
import { Columns, ArrowRight, Plus, Trash2, Eye, RefreshCw, MapPin } from 'lucide-react';

export interface ColumnMapping {
  id: string;
  label: string;
  source: 'system' | 'field';
  col1: string;
  col2: string;
  col3: string;
  separator: string;
  previewResult?: string;
}

interface AddressColumnMapperProps {
  systemColumns: string[];
  fieldColumns: string[];
  systemSampleRows?: Record<string, string>[];
  fieldSampleRows?: Record<string, string>[];
  onMappingChange: (mappings: ColumnMapping[]) => void;
}

const DEFAULT_SEPARATORS = [
  { value: ', ', label: 'Koma + Spasi (,·)' },
  { value: ' ', label: 'Spasi ( )' },
  { value: ' - ', label: 'Dash (·-·)' },
  { value: '/', label: 'Slash (/)' },
  { value: ' | ', label: 'Pipe (·|·)' },
];

const generateId = () => Math.random().toString(36).slice(2, 9);

export function AddressColumnMapper({
  systemColumns,
  fieldColumns,
  systemSampleRows = [],
  fieldSampleRows = [],
  onMappingChange
}: AddressColumnMapperProps) {
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const addMapping = () => {
    // Default to 'system' unless only field columns exist
    const defaultSource = systemColumns.length > 0 ? 'system' : 'field';
    const cols = defaultSource === 'system' ? systemColumns : fieldColumns;

    const newMapping: ColumnMapping = {
      id: generateId(),
      label: `Alamat ${mappings.length + 1}`,
      source: defaultSource,
      col1: cols[0] || '',
      col2: cols[1] || '',
      col3: cols[2] || '',
      separator: ', ',
    };
    const updated = [...mappings, newMapping];
    setMappings(updated);
    onMappingChange(updated);
  };

  const updateMapping = (id: string, patch: Partial<ColumnMapping>) => {
    const updated = mappings.map(m => {
      if (m.id === id) {
        // If source changed, try to keep the same column names if they exist in the new source, otherwise clear them
        if (patch.source && patch.source !== m.source) {
          const newCols = patch.source === 'system' ? systemColumns : fieldColumns;
          return {
            ...m,
            ...patch,
            col1: newCols.includes(m.col1) ? m.col1 : (newCols[0] || ''),
            col2: newCols.includes(m.col2) ? m.col2 : (newCols[1] || ''),
            col3: newCols.includes(m.col3) ? m.col3 : (newCols[2] || '')
          };
        }
        return { ...m, ...patch };
      }
      return m;
    });
    setMappings(updated);
    onMappingChange(updated);
  };

  const deleteMapping = (id: string) => {
    const updated = mappings.filter(m => m.id !== id);
    setMappings(updated);
    onMappingChange(updated);
  };

  const buildAddress = (mapping: ColumnMapping, row: Record<string, string>) => {
    const parts = [
      mapping.col1 ? row[mapping.col1] : '',
      mapping.col2 ? row[mapping.col2] : '',
      mapping.col3 ? row[mapping.col3] : '',
    ].filter(p => p && p.trim());
    return parts.join(mapping.separator);
  };

  const previewSample = (mapping: ColumnMapping) => {
    const samples = mapping.source === 'system' ? systemSampleRows : fieldSampleRows;
    if (samples.length === 0) return 'Tidak ada sampel data';
    return buildAddress(mapping, samples[0]) || '(kolom kosong)';
  };

  const ColSelect = ({ value, onChange, options }: { value: string; onChange: (v: string) => void, options: string[] }) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border bg-transparent outline-none truncate"
      style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
    >
      <option value="">(tidak digunakan)</option>
      {options.map(col => (
        <option key={col} value={col}>{col}</option>
      ))}
    </select>
  );

  return (
    <div className="section-card">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Columns className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Mapping Kolom Alamat
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {mappings.length > 0 && (systemSampleRows.length > 0 || fieldSampleRows.length > 0) && (
              <button onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border transition-colors"
                style={{ color: 'hsl(var(--muted-foreground))' }}>
                <Eye className="w-3.5 h-3.5" />
                {showPreview ? 'Sembunyikan' : 'Preview'}
              </button>
            )}
            <button onClick={addMapping}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))', border: '1px solid hsl(var(--primary) / 0.25)' }}>
              <Plus className="w-3.5 h-3.5" />
              Tambah Mapping
            </button>
          </div>
        </div>

        <p className="text-xs mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Gabungkan 2–3 kolom dari database menjadi string alamat lengkap untuk proses geocoding.
          {systemColumns.length === 0 && fieldColumns.length === 0 && (
            <span style={{ color: 'hsl(38 92% 55%)' }}> Upload data terlebih dahulu untuk melihat kolom yang tersedia.</span>
          )}
        </p>
      </div>

      <div className="p-5 space-y-4">
        {mappings.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <Columns className="w-8 h-8 mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Belum ada mapping kolom</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Contoh: kolom <code>address</code> + <code>city</code> + <code>province</code> → satu alamat lengkap
            </p>
            <button onClick={addMapping}
              className="mt-3 text-xs px-4 py-2 rounded-lg transition-all"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              + Buat Mapping Pertama
            </button>
          </div>
        ) : (
          mappings.map((mapping, idx) => {
            const currentCols = mapping.source === 'system' ? systemColumns : fieldColumns;
            const currentSamples = mapping.source === 'system' ? systemSampleRows : fieldSampleRows;

            return (
              <div key={mapping.id} className="rounded-xl border p-4 space-y-3"
                style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
                {/* Mapping header */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 flex-1">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                    <input
                      value={mapping.label}
                      onChange={e => updateMapping(mapping.id, { label: e.target.value })}
                      className="text-sm font-medium bg-transparent border-b outline-none flex-1 truncate max-w-[150px]"
                      style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--primary) / 0.3)' }}
                    />

                    {/* Source Selector */}
                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Sumber Data:</span>
                      <select
                        value={mapping.source}
                        onChange={e => updateMapping(mapping.id, { source: e.target.value as 'system' | 'field' })}
                        className="text-xs px-2 py-1 rounded border bg-transparent outline-none cursor-pointer font-medium"
                        style={{ color: 'hsl(var(--primary))', borderColor: 'hsl(var(--border))' }}
                      >
                        <option value="system" disabled={systemColumns.length === 0}>Data Sistem</option>
                        <option value="field" disabled={fieldColumns.length === 0}>Data Lapangan</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={() => deleteMapping(mapping.id)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'hsl(0 72% 60%)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Column selectors */}
                <div className="flex flex-wrap items-center gap-2">
                  <ColSelect options={currentCols} value={mapping.col1} onChange={v => updateMapping(mapping.id, { col1: v })} />
                  <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <ColSelect options={currentCols} value={mapping.col2} onChange={v => updateMapping(mapping.id, { col2: v })} />
                  <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <ColSelect options={currentCols} value={mapping.col3} onChange={v => updateMapping(mapping.id, { col3: v })} />
                </div>

                {/* Separator */}
                <div className="flex items-center gap-3">
                  <label className="text-xs flex-shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>Pemisah:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_SEPARATORS.map(sep => (
                      <button key={sep.value}
                        onClick={() => updateMapping(mapping.id, { separator: sep.value })}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-all font-mono"
                        style={{
                          background: mapping.separator === sep.value ? 'hsl(var(--primary) / 0.15)' : 'transparent',
                          borderColor: mapping.separator === sep.value ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--border))',
                          color: mapping.separator === sep.value ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                        }}>
                        {sep.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Result preview */}
                <div className="flex items-start gap-2 p-3 rounded-lg"
                  style={{ background: 'hsl(var(--surface-3))' }}>
                  <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Hasil gabungan:</p>
                    <code className="text-xs font-mono break-all" style={{ color: 'hsl(var(--foreground))' }}>
                      {previewSample(mapping)}
                    </code>
                  </div>
                </div>

                {/* Preview Table */}
                {showPreview && currentSamples.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <RefreshCw className="w-3 h-3 inline mr-1" />
                      Preview 5 baris pertama:
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'hsl(var(--surface-3))' }}>
                            <th className="px-3 py-2 text-left font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>#</th>
                            {[mapping.col1, mapping.col2, mapping.col3].filter(Boolean).map(col => (
                              <th key={col} className="px-3 py-2 text-left font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{col}</th>
                            ))}
                            <th className="px-3 py-2 text-left font-medium" style={{ color: 'hsl(var(--primary))' }}>→ Hasil Gabungan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentSamples.slice(0, 5).map((row, i) => (
                            <tr key={i} style={{ borderTop: '1px solid hsl(var(--border))' }}>
                              <td className="px-3 py-1.5 font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>{i + 1}</td>
                              {[mapping.col1, mapping.col2, mapping.col3].filter(Boolean).map(col => (
                                <td key={col} className="px-3 py-1.5 max-w-[120px] truncate" style={{ color: 'hsl(var(--foreground))' }} title={row[col]}>
                                  {row[col] || '-'}
                                </td>
                              ))}
                              <td className="px-3 py-1.5 font-mono break-all" style={{ color: 'hsl(var(--primary))' }}>
                                {buildAddress(mapping, row)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
