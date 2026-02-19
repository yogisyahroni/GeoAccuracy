import { useState, useRef } from 'react';
import { Upload, FileText, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface DataUploadProps {
  onSystemDataLoad: (data: Record<string, string>[]) => void;
  onFieldDataLoad: (data: Record<string, string>[]) => void;
  systemCount: number;
  fieldCount: number;
}

export function DataUpload({ onSystemDataLoad, onFieldDataLoad, systemCount, fieldCount }: DataUploadProps) {
  const [showFormat, setShowFormat] = useState(false);
  const systemRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [systemDrag, setSystemDrag] = useState(false);
  const [fieldDrag, setFieldDrag] = useState(false);

  const handleFile = async (file: File, type: 'system' | 'field') => {
    const text = await file.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
      rows.push(obj);
    }
    if (type === 'system') onSystemDataLoad(rows);
    else onFieldDataLoad(rows);
  };

  const handleDrop = (e: React.DragEvent, type: 'system' | 'field') => {
    e.preventDefault();
    if (type === 'system') setSystemDrag(false);
    else setFieldDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file, type);
  };

  return (
    <div className="section-card">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Upload className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Upload Data
            </h2>
          </div>
          <button
            onClick={() => setShowFormat(!showFormat)}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <Info className="w-3.5 h-3.5" />
            Format CSV
            {showFormat ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {showFormat && (
          <div className="mt-4 grid md:grid-cols-2 gap-4 animate-fade-in">
            <div className="rounded-lg p-3.5 border border-border" style={{ background: 'hsl(var(--surface-3) / 0.5)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--primary))' }}>
                📋 Data Sistem (CSV)
              </p>
              <code className="text-xs font-mono block leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                connote,recipient_name,address,city,province<br />
                JKT-001,Budi Santoso,"Jl. Sudirman No.1",Jakarta,DKI Jakarta<br />
                JKT-002,Siti Rahayu,"Jl. Thamrin No.5",Jakarta,DKI Jakarta
              </code>
            </div>
            <div className="rounded-lg p-3.5 border border-border" style={{ background: 'hsl(var(--surface-3) / 0.5)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(38 92% 55%)' }}>
                📍 Data Lapangan (CSV)
              </p>
              <code className="text-xs font-mono block leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                connote,lat,lng,reported_by,report_date<br />
                JKT-001,-6.2087941,106.845598,Tim A,2025-01-15<br />
                JKT-002,-6.1944491,106.823111,Tim B,2025-01-15
              </code>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 grid md:grid-cols-2 gap-4">
        {/* System Data Upload */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Data Sistem
            </label>
            {systemCount > 0 && (
              <span className="text-xs font-mono" style={{ color: 'hsl(var(--primary))' }}>
                {systemCount} baris
              </span>
            )}
          </div>
          <div
            className={`upload-zone p-6 text-center ${systemDrag ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setSystemDrag(true); }}
            onDragLeave={() => setSystemDrag(false)}
            onDrop={e => handleDrop(e, 'system')}
            onClick={() => systemRef.current?.click()}
          >
            <input
              ref={systemRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'system')}
            />
            <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: systemCount > 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
            {systemCount > 0 ? (
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--primary))' }}>
                ✓ {systemCount} data sistem dimuat
              </p>
            ) : (
              <>
                <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                  Drop CSV atau klik upload
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  connote, recipient_name, address, city, province
                </p>
              </>
            )}
          </div>
        </div>

        {/* Field Data Upload */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Data Lapangan
            </label>
            {fieldCount > 0 && (
              <span className="text-xs font-mono" style={{ color: 'hsl(38 92% 55%)' }}>
                {fieldCount} baris
              </span>
            )}
          </div>
          <div
            className={`upload-zone p-6 text-center ${fieldDrag ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setFieldDrag(true); }}
            onDragLeave={() => setFieldDrag(false)}
            onDrop={e => handleDrop(e, 'field')}
            onClick={() => fieldRef.current?.click()}
          >
            <input
              ref={fieldRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'field')}
            />
            <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: fieldCount > 0 ? 'hsl(38 92% 55%)' : 'hsl(var(--muted-foreground))' }} />
            {fieldCount > 0 ? (
              <p className="text-sm font-medium" style={{ color: 'hsl(38 92% 55%)' }}>
                ✓ {fieldCount} data lapangan dimuat
              </p>
            ) : (
              <>
                <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                  Drop CSV atau klik upload
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  connote, lat, lng, reported_by, report_date
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
