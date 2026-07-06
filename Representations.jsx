/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { Plus, Trash2, Briefcase, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { apiJson } from './api';
import { useCan } from './UserContext.jsx';
import { showToast } from './Toast';
import InlineEdit from './InlineEdit';

const STATUS_OPTIONS = [
  { value: 'filled',  label: 'מאויש' },
  { value: 'partial', label: 'חלקי' },
  { value: 'missing', label: 'חסר' },
];

function StatusChip({ status }) {
  const def = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
  const Icon = status === 'filled' ? CheckCircle2 : status === 'partial' ? Circle : AlertTriangle;
  const color = status === 'filled' ? 'var(--success-color)' : status === 'partial' ? 'var(--warning-color)' : 'var(--danger-color)';
  const bg    = status === 'filled' ? 'var(--success-bg)'    : status === 'partial' ? 'var(--warning-bg)'    : 'var(--danger-bg)';
  const text  = status === 'filled' ? 'var(--success-text)'  : status === 'partial' ? 'var(--warning-text)'  : 'var(--danger-text)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
      background: bg, color: text,
    }}>
      <Icon size={13} color={color} /> {def.label}
    </span>
  );
}

export default function Representations() {
  const canWrite = useCan('write');
  const canDelete = useCan('delete');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    apiJson('/representations')
      .then((data) => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError('לא הצלחתי לטעון נציגויות.'); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const addNew = async () => {
    try {
      const created = await apiJson('/representations', {
        method: 'POST',
        body: JSON.stringify({ organization: '', seatDescription: '', representativeName: '', status: 'missing', sortOrder: items.length }),
      });
      setItems((prev) => [...prev, created]);
      showToast('נציגות חדשה נוספה', 'success');
    } catch {
      showToast('לא הצלחתי להוסיף נציגות', 'error');
    }
  };

  const patch = async (id, body) => {
    try {
      const updated = await apiJson(`/representations/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      setItems((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      showToast('השמירה נכשלה', 'error');
      load();
    }
  };

  const remove = async (id) => {
    if (!window.confirm('למחוק את הנציגות?')) return;
    try {
      await apiJson(`/representations/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch {
      showToast('המחיקה נכשלה', 'error');
    }
  };

  const filledCount  = items.filter((r) => r.status === 'filled').length;
  const partialCount = items.filter((r) => r.status === 'partial').length;
  const missingCount = items.filter((r) => r.status === 'missing').length;

  if (loading) return <div className="empty-state">טוען נציגויות...</div>;
  if (error) return <div className="notice notice-error">{error}</div>;

  return (
    <div>
      <div className="header-flex">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Briefcase size={22} color="var(--primary-color)" /> נציגויות ההתאחדות
          </h2>
          <div className="muted-text" style={{ marginTop: 4 }}>טבלת המושבים שלנו בארגונים ופורומים חיצוניים</div>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={addNew}>
            <Plus size={18} /> הוסף נציגות
          </button>
        )}
      </div>

      <div className="dashboard-kpi-grid">
        <KpiTile icon={<CheckCircle2 size={20} />} value={filledCount} label="מאוישות" color="#34C759" bg="#E6F7EB" />
        <KpiTile icon={<Circle size={20} />}        value={partialCount} label="חלקיות"  color="#FF9F0A" bg="#FFF3E0" />
        <KpiTile icon={<AlertTriangle size={20} />} value={missingCount} label="חסרות"   color="#FF3B30" bg="#FFE8E6" />
        <KpiTile icon={<Briefcase size={20} />}     value={items.length} label="סה״כ"    color="#0071E3" bg="#E8F1FE" />
      </div>

      {items.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: 32 }}>
            עדיין לא הוספת נציגויות.
            {canWrite && (
              <>
                {' '}
                <button className="btn btn-primary btn-sm" style={{ marginInlineStart: 8 }} onClick={addNew}>
                  <Plus size={14} /> הוסף ראשונה
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="partners-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th>ארגון</th>
                <th>חברות בבורד / פורום</th>
                <th>נציג</th>
                <th>סטטוס</th>
                <th>הערות</th>
                {canDelete && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} style={{ cursor: 'default' }}>
                  <td style={{ minWidth: 180 }}>
                    {canWrite ? (
                      <InlineEdit
                        value={row.organization}
                        onSave={(val) => patch(row.id, { organization: val })}
                        placeholder="שם הארגון"
                      />
                    ) : row.organization || '—'}
                  </td>
                  <td style={{ minWidth: 220 }}>
                    {canWrite ? (
                      <InlineEdit
                        value={row.seatDescription}
                        onSave={(val) => patch(row.id, { seatDescription: val })}
                        placeholder="חברות בועדה / מושב קבוע..."
                      />
                    ) : row.seatDescription || '—'}
                  </td>
                  <td style={{ minWidth: 120 }}>
                    {canWrite ? (
                      <InlineEdit
                        value={row.representativeName}
                        onSave={(val) => patch(row.id, { representativeName: val, status: val ? (row.status === 'missing' ? 'filled' : row.status) : 'missing' })}
                        placeholder="שם הנציג"
                      />
                    ) : row.representativeName || <span className="muted-text">לא משויך</span>}
                  </td>
                  <td>
                    {canWrite ? (
                      <InlineEdit
                        type="select"
                        value={row.status}
                        options={STATUS_OPTIONS}
                        onSave={(val) => patch(row.id, { status: val })}
                        renderValue={(val) => <StatusChip status={val || 'filled'} />}
                      />
                    ) : <StatusChip status={row.status} />}
                  </td>
                  <td style={{ minWidth: 160 }}>
                    {canWrite ? (
                      <InlineEdit
                        type="textarea"
                        value={row.notes}
                        onSave={(val) => patch(row.id, { notes: val })}
                        placeholder="הערות..."
                      />
                    ) : row.notes || '—'}
                  </td>
                  {canDelete && (
                    <td>
                      <button className="btn-icon" style={{ color: 'var(--danger-color)' }} title="מחק" onClick={() => remove(row.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiTile({ icon, value, label, color, bg }) {
  return (
    <div className="kpi-card-modern" style={{ '--kpi-color': color, '--kpi-bg': bg }}>
      <div className="kpi-card-icon">{icon}</div>
      <div className="kpi-card-value">{Number(value || 0).toLocaleString()}</div>
      <div className="kpi-card-label">{label}</div>
    </div>
  );
}
