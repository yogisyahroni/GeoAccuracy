import { useState, useRef } from 'react';
import { Upload, FileText, Info, ChevronDown, ChevronUp, Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DataUploadProps {
  onSystemDataLoad: (data: Record<string, string>[]) => void;
  onFieldDataLoad: (data: Record<string, string>[]) => void;
  systemCount: number;
  fieldCount: number;
}

// ─── Template definitions ─────────────────────────────────────────────────────

/** Data Sistem template: columns + 2 sample rows */
const SYSTEM_TEMPLATE = {
  filename: 'template_data_sistem.xlsx',
  sheetName: 'Data Sistem',
  headers: ['connote', 'recipient_name', 'address', 'city', 'province'],
  sampleRows: [
    ['JKT-001', 'Budi Santoso', 'Jl. Sudirman No. 1', 'Jakarta Pusat', 'DKI Jakarta'],
    ['JKT-002', 'Siti Rahayu', 'Jl. Thamrin No. 5', 'Jakarta Pusat', 'DKI Jakarta'],
    ['SBY-001', 'Ahmad Fauzi', 'Jl. Basuki Rahmat No. 10', 'Surabaya', 'Jawa Timur'],
  ],
  colWidths: [{ wch: 14 }, { wch: 24 }, { wch: 36 }, { wch: 20 }, { wch: 18 }],
};

/** Data Lapangan template: columns + 2 sample rows */
const FIELD_TEMPLATE = {
  filename: 'template_data_lapangan.xlsx',
  sheetName: 'Data Lapangan',
  headers: ['connote', 'lat', 'lng', 'reported_by', 'report_date'],
  sampleRows: [
    ['JKT-001', '-6.2087941', '106.8455985', 'Tim A', '2025-01-15'],
    ['JKT-002', '-6.1944491', '106.8231113', 'Tim B', '2025-01-15'],
    ['SBY-001', '-7.2559566', '112.7376855', 'Tim C', '2025-01-16'],
  ],
  colWidths: [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }],
};

// ─── Excel generator ──────────────────────────────────────────────────────────

function downloadTemplate(tpl: typeof SYSTEM_TEMPLATE) {
  const wb = XLSX.utils.book_new();

  // Build rows array: header row + sample rows
  const rows = [tpl.headers, ...tpl.sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = tpl.colWidths;

  // Bold + background on header row (row 0)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0891B2' } }, // cyan-600
      alignment: { horizontal: 'center' },
      border: {
        bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
        right: { style: 'thin', color: { rgb: 'CCCCCC' } },
      },
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, tpl.sheetName);
  XLSX.writeFile(wb, tpl.filename);
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

function parseXLSX(buffer: ArrayBuffer, type: 'system' | 'field'): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = type === 'system' ? SYSTEM_TEMPLATE.sheetName : FIELD_TEMPLATE.sheetName;
  const ws = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
  return rows.map(row => {
    const out: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => { out[k.trim()] = String(v); });
    return out;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DataUpload({ onSystemDataLoad, onFieldDataLoad, systemCount, fieldCount }: DataUploadProps) {
  const [showFormat, setShowFormat] = useState(false);
  const systemRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [systemDrag, setSystemDrag] = useState(false);
  const [fieldDrag, setFieldDrag] = useState(false);

  const handleFile = async (file: File, type: 'system' | 'field') => {
    const isXLSX = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    let rows: Record<string, string>[];

    if (isXLSX) {
      const buffer = await file.arrayBuffer();
      rows = parseXLSX(buffer, type);
    } else {
      const text = await file.text();
      rows = parseCSV(text);
    }

    if (type === 'system') onSystemDataLoad(rows);
    else onFieldDataLoad(rows);
  };

  const handleDrop = (e: React.DragEvent, type: 'system' | 'field') => {
    e.preventDefault();
    if (type === 'system') setSystemDrag(false);
    else setFieldDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFile(file, type);
    }
  };

  return (
    <div className="section-card">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Upload className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Upload Data
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: 'hsl(var(--primary) / 0.1)',
                color: 'hsl(var(--primary))',
                border: '1px solid hsl(var(--primary) / 0.2)',
              }}
            >
              CSV / Excel
            </span>
          </div>
          <button
            onClick={() => setShowFormat(!showFormat)}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <Info className="w-3.5 h-3.5" />
            Format
            {showFormat ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {showFormat && (
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            {/* System format preview */}
            <div className="rounded-lg p-3.5 border border-border" style={{ background: 'hsl(var(--surface-3) / 0.5)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--primary))' }}>
                📋 Data Sistem
              </p>
              <code className="text-xs font-mono block leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                connote, recipient_name, address, city, province<br />
                JKT-001, Budi Santoso, Jl. Sudirman No. 1, Jakarta, DKI Jakarta
              </code>
            </div>
            {/* Field format preview */}
            <div className="rounded-lg p-3.5 border border-border" style={{ background: 'hsl(var(--surface-3) / 0.5)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(38 92% 55%)' }}>
                📍 Data Lapangan
              </p>
              <code className="text-xs font-mono block leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                connote, lat, lng, reported_by, report_date<br />
                JKT-001, -6.2087941, 106.845598, Tim A, 2025-01-15
              </code>
            </div>
          </div>
        )}
      </div>

      {/* ── Upload Zones ──────────────────────────────────────────────────── */}
      <div className="p-5 grid md:grid-cols-2 gap-4">

        {/* ── Data Sistem ─────────────────────────────────────── */}
        <div>
          {/* Label row + template download */}
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Data Sistem
            </label>
            <div className="flex items-center gap-3">
              {systemCount > 0 && (
                <span className="text-xs font-mono" style={{ color: 'hsl(var(--primary))' }}>
                  {systemCount} baris
                </span>
              )}
              <button
                onClick={() => downloadTemplate(SYSTEM_TEMPLATE)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all duration-150 hover:brightness-125 active:scale-95"
                style={{
                  color: 'hsl(var(--primary))',
                  borderColor: 'hsl(var(--primary) / 0.3)',
                  background: 'hsl(var(--primary) / 0.07)',
                }}
                title="Download template Excel Data Sistem"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Template
                <Download className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Drop zone */}
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
              accept=".csv,.xlsx,.xls"
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
                  Drop file atau klik upload
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  CSV atau Excel (.xlsx)
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Data Lapangan ───────────────────────────────────── */}
        <div>
          {/* Label row + template download */}
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Data Lapangan
            </label>
            <div className="flex items-center gap-3">
              {fieldCount > 0 && (
                <span className="text-xs font-mono" style={{ color: 'hsl(38 92% 55%)' }}>
                  {fieldCount} baris
                </span>
              )}
              <button
                onClick={() => downloadTemplate(FIELD_TEMPLATE)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all duration-150 hover:brightness-125 active:scale-95"
                style={{
                  color: 'hsl(38 92% 55%)',
                  borderColor: 'hsl(38 92% 50% / 0.3)',
                  background: 'hsl(38 92% 50% / 0.07)',
                }}
                title="Download template Excel Data Lapangan"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Template
                <Download className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Drop zone */}
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
              accept=".csv,.xlsx,.xls"
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
                  Drop file atau klik upload
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  CSV atau Excel (.xlsx)
                </p>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
