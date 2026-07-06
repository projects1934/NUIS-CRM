import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, ChevronRight, ChevronLeft, Check, AlertCircle, FileSpreadsheet, Loader } from 'lucide-react';
import { apiJson } from '../api';

/* ── Field definitions ─────────────────────────────────────────────── */
const FIELDS = [
  { key: 'organizationName', label: 'שם ארגון *', required: true },
  { key: 'domain',           label: 'תחום עיסוק' },
  { key: 'partnerType',      label: 'סוג שותף' },
  { key: 'partnerCategory',  label: 'קטגוריה' },
  { key: 'region',           label: 'אזור' },
  { key: 'status',           label: 'סטטוס' },
  { key: 'priority',         label: 'עדיפות' },
  { key: 'pic',              label: 'אחראי קשר' },
  { key: 'generalNotes',     label: 'הערות כלליות' },
  { key: 'packageDescription', label: 'תיאור / חבילה' },
  { key: 'contactName',      label: 'שם איש קשר' },
  { key: 'contactRole',      label: 'תפקיד איש קשר' },
  { key: 'contactPhone',     label: 'טלפון איש קשר' },
  { key: 'contactEmail',     label: 'אימייל איש קשר' },
  { key: '_skip',            label: '— דלג על עמודה —' },
];

/* Auto-detect column names (Hebrew + English variants) */
const AUTO_MAP = {
  organizationName: ['ארגון', 'שם ארגון', 'organization', 'name', 'שם', 'חברה', 'מוסד'],
  domain:           ['תחום', 'תחום עיסוק', 'domain', 'sector', 'ענף'],
  partnerType:      ['סוג', 'סוג שותף', 'type', 'partner type', 'סוג נציגות'],
  partnerCategory:  ['קטגוריה', 'category', 'קטגוריית שותף'],
  region:           ['אזור', 'עיר', 'region', 'city', 'location'],
  status:           ['סטטוס', 'status', 'מצב'],
  priority:         ['עדיפות', 'priority'],
  pic:              ['אחראי', 'pic', 'contact person', 'אחראי קשר', 'אחראי מטעמנו'],
  generalNotes:     ['הערות', 'notes', 'general notes', 'הערות כלליות', 'חברות בוועד', 'חברות בוועד / פורום נוסף', 'פורום', 'ועד', 'מידע נוסף'],
  packageDescription: ['תיאור', 'description', 'package', 'הצעה', 'תיאור חבילה'],
  contactName:      ['איש קשר', 'contact', 'שם איש קשר', 'contact name'],
  contactRole:      ['תפקיד', 'role', 'contact role', 'תפקיד איש קשר'],
  contactPhone:     ['טלפון', 'phone', 'tel', 'mobile', 'נייד', 'טל'],
  contactEmail:     ['אימייל', 'email', 'mail', 'דוא"ל', 'דואל'],
};

function detectMapping(headers) {
  const mapping = {};
  headers.forEach((h) => {
    const norm = String(h || '').trim().toLowerCase();
    for (const [field, variants] of Object.entries(AUTO_MAP)) {
      if (variants.some((v) => norm.includes(v.toLowerCase()) || v.toLowerCase().includes(norm))) {
        if (!Object.values(mapping).includes(field)) {
          mapping[h] = field;
          break;
        }
      }
    }
    if (!mapping[h]) mapping[h] = '_skip';
  });
  return mapping;
}

function rowToPartner(row, mapping, headers) {
  const p = {};
  headers.forEach((h) => {
    const field = mapping[h];
    if (!field || field === '_skip') return;
    const val = String(row[h] || '').trim();
    if (!val) return;
    p[field] = val;
  });
  // Build contacts array if any contact fields present
  if (p.contactName || p.contactPhone || p.contactEmail) {
    p.contacts = [{
      id: String(Date.now()),
      name:  p.contactName  || '',
      role:  p.contactRole  || '',
      phone: p.contactPhone || '',
      email: p.contactEmail || '',
      dataSource: '',
      isPrimary: true,
    }];
    delete p.contactName;
    delete p.contactRole;
    delete p.contactPhone;
    delete p.contactEmail;
  }
  return p;
}

/* ── Stepper ────────────────────────────────────────────────────────── */
const STEPS = ['העלאת קובץ', 'מיפוי עמודות', 'תצוגה מקדימה', 'ייבוא'];

export default function ImportPartnersModal({ isOpen, onClose, onDone }) {
  const [step,    setStep]    = useState(0);
  const [rows,    setRows]    = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [results, setResults] = useState(null); // { ok, dupes, failed }
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const reset = () => {
    setStep(0); setRows([]); setHeaders([]); setMapping({});
    setResults(null); setProgress(0); setFileName(''); setImporting(false);
  };
  const handleClose = () => { reset(); onClose(); };

  /* Parse file */
  const parseFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!data.length) { alert('הקובץ ריק'); return; }
        const hdrs = Object.keys(data[0]);
        setHeaders(hdrs);
        setRows(data);
        setMapping(detectMapping(hdrs));
        setStep(1);
      } catch {
        alert('שגיאה בקריאת הקובץ — ודא שזה .xlsx או .csv תקין');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    parseFile(e.dataTransfer.files[0]);
  };

  /* Import */
  const runImport = async () => {
    setImporting(true);
    setStep(3);
    const partners = rows
      .map((r) => rowToPartner(r, mapping, headers))
      .filter((p) => p.organizationName);

    const res = { ok: 0, dupes: 0, failed: 0, failedNames: [] };
    for (let i = 0; i < partners.length; i++) {
      try {
        await apiJson('/partners', { method: 'POST', body: JSON.stringify(partners[i]) });
        res.ok++;
      } catch (err) {
        const body = err?.body || {};
        if (err?.status === 409 || body?.isDuplicate) res.dupes++;
        else { res.failed++; res.failedNames.push(partners[i].organizationName); }
      }
      setProgress(Math.round(((i + 1) / partners.length) * 100));
    }
    setResults(res);
    setImporting(false);
    if (onDone) onDone();
  };

  const validRows = rows.filter((r) => {
    const nameCol = headers.find((h) => mapping[h] === 'organizationName');
    return nameCol && String(r[nameCol] || '').trim();
  });

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-content" style={{ maxWidth: 680 }}>

        {/* Header */}
        <div className="modal-header" style={{ background: 'var(--accent-mint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileSpreadsheet size={22} />
            <h2 style={{ margin: 0 }}>ייבוא נציגויות מ-Excel</h2>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--ink)', background: 'var(--surface-soft)' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center', padding: '10px 4px',
              fontWeight: 700, fontSize: '0.82rem',
              borderBottom: i === step ? '3px solid var(--ink)' : 'none',
              background: i === step ? 'var(--accent-yellow)' : 'transparent',
              color: i < step ? 'var(--cta)' : i === step ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}>
              {i < step ? <Check size={14} style={{ marginInlineEnd: 4 }} /> : `${i + 1}. `}{s}
            </div>
          ))}
        </div>

        <div className="modal-body">

          {/* ── Step 0: Upload ── */}
          {step === 0 && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current.click()}
              style={{
                border: `3px dashed ${dragging ? 'var(--cta)' : 'var(--ink)'}`,
                borderRadius: 'var(--radius-xl)',
                background: dragging ? 'var(--accent-mint)' : 'var(--surface-soft)',
                padding: '48px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s',
                boxShadow: dragging ? 'var(--clay-md)' : 'none',
              }}
            >
              <Upload size={40} style={{ opacity: 0.5, marginBottom: 12 }} />
              <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>גרור לכאן קובץ Excel או לחץ לבחירה</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>תומך ב-.xlsx ו-.csv</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => parseFile(e.target.files[0])} />
            </div>
          )}

          {/* ── Step 1: Mapping ── */}
          {step === 1 && (
            <div>
              <div className="notice" style={{ background: 'var(--accent-yellow)', marginBottom: 16 }}>
                <strong>נמצאו {rows.length} שורות</strong> ב-{fileName}. מפה כל עמודה לשדה במערכת:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '10px 8px', alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>עמודה בקובץ</div>
                <div />
                <div style={{ fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>שדה במערכת</div>
                {headers.map((h) => (
                  <>
                    <div key={`h-${h}`} style={{
                      padding: '8px 12px', background: 'var(--surface-color)',
                      border: '2px solid var(--ink)', borderRadius: 'var(--radius-sm)',
                      fontWeight: 600, fontSize: '0.9rem',
                    }}>{h}</div>
                    <ChevronLeft size={16} style={{ opacity: 0.4 }} />
                    <select
                      key={`s-${h}`}
                      className="form-control"
                      style={{ padding: '8px 12px', fontWeight: 600 }}
                      value={mapping[h] || '_skip'}
                      onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                    >
                      {FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 2 && (
            <div>
              <div className="notice" style={{ background: 'var(--accent-mint)', marginBottom: 16 }}>
                <strong>{validRows.length} נציגויות</strong> ייובאו ({rows.length - validRows.length} שורות ללא שם ארגון — יודלגו)
              </div>
              <div className="table-container" style={{ maxHeight: 340, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      {headers.filter((h) => mapping[h] && mapping[h] !== '_skip').map((h) => (
                        <th key={h}>{FIELDS.find((f) => f.key === mapping[h])?.label || h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 15).map((row, i) => (
                      <tr key={i}>
                        {headers.filter((h) => mapping[h] && mapping[h] !== '_skip').map((h) => (
                          <td key={h} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(row[h] || '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {validRows.length > 15 && (
                      <tr><td colSpan={99} style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        ועוד {validRows.length - 15} שורות...
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Step 3: Import progress / results ── */}
          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              {importing ? (
                <>
                  <Loader size={40} style={{ opacity: 0.5, marginBottom: 16, animation: 'spin 1s linear infinite' }} />
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 12 }}>מייבא נציגויות...</div>
                  <div style={{ background: 'var(--surface-muted)', border: '2px solid var(--ink)', borderRadius: 999, overflow: 'hidden', height: 16, margin: '0 auto', maxWidth: 360 }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'var(--cta)', borderInlineEnd: '2px solid var(--ink)', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: 8, fontWeight: 600 }}>{progress}%</div>
                </>
              ) : results && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: results.ok > 0 ? 'var(--accent-mint)' : 'var(--accent-yellow)',
                    border: '3px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'var(--clay-sm)',
                  }}>
                    {results.ok > 0 ? <Check size={32} /> : <AlertCircle size={32} />}
                  </div>
                  <h3 style={{ margin: 0 }}>הייבוא הסתיים!</h3>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Pill color="var(--accent-mint)" label={`✅ ${results.ok} נוספו`} />
                    {results.dupes > 0 && <Pill color="var(--accent-yellow)" label={`⚠️ ${results.dupes} כפולים — דולגו`} />}
                    {results.failed > 0 && <Pill color="var(--danger-bg)" label={`❌ ${results.failed} נכשלו`} />}
                  </div>
                  {results.failedNames.length > 0 && (
                    <div style={{ color: 'var(--danger-text)', fontSize: '0.82rem' }}>
                      נכשלו: {results.failedNames.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {step > 0 && step < 3 && !importing && (
              <button className="btn btn-outline" onClick={() => setStep(s => s - 1)}>
                <ChevronRight size={16} /> חזור
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step === 3 && results ? (
              <button className="btn btn-primary" onClick={handleClose}>
                <Check size={16} /> סגור
              </button>
            ) : step === 0 ? (
              <button className="btn btn-outline" onClick={handleClose}>ביטול</button>
            ) : step === 2 ? (
              <>
                <button className="btn btn-outline" onClick={handleClose}>ביטול</button>
                <button
                  className="btn btn-primary"
                  onClick={runImport}
                  disabled={!validRows.length}
                >
                  <Upload size={16} /> ייבא {validRows.length} נציגויות
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-outline" onClick={handleClose}>ביטול</button>
                <button
                  className="btn btn-primary"
                  onClick={() => setStep(s => s + 1)}
                  disabled={step === 1 && !headers.some((h) => mapping[h] === 'organizationName')}
                >
                  המשך <ChevronLeft size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Pill({ color, label }) {
  return (
    <span style={{
      padding: '6px 14px', background: color,
      border: '2px solid var(--ink)', borderRadius: 999,
      fontWeight: 700, fontSize: '0.88rem',
      boxShadow: '2px 2px 0 var(--ink)',
    }}>{label}</span>
  );
}
