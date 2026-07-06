/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { Plus, Trash2, Target, ChevronLeft, ChevronDown } from 'lucide-react';
import { apiJson, formatDate } from '../api';
import { showToast } from './Toast';

const METRIC_TYPES = [
  { value: 'input',     label: 'תשומות',   description: 'משאבים שהושקעו' },
  { value: 'activity',  label: 'פעילויות', description: 'פעולות שבוצעו' },
  { value: 'output',    label: 'תפוקות',   description: 'תוצרים מדידים' },
  { value: 'outcome',   label: 'תוצאות',   description: 'שינוי קצר-טווח' },
  { value: 'long_term', label: 'אימפקט',   description: 'השפעה ארוכת-טווח' },
];

const TYPE_LABEL = Object.fromEntries(METRIC_TYPES.map((t) => [t.value, t.label]));

function metricCurrentValue(metric) {
  const points = metric.data_points || [];
  if (points.length === 0) return metric.baseline ?? null;
  return points[points.length - 1].value;
}

function progressPct(metric) {
  const current = metricCurrentValue(metric);
  const baseline = metric.baseline ?? 0;
  const target = metric.target;
  if (current == null || target == null) return null;
  if (target === baseline) return current >= target ? 100 : 0;
  const pct = ((current - baseline) / (target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export default function ProjectMetrics({ projectId, metrics, onChange }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState({ name: '', type: 'output', unit: '', target: '', baseline: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [dpDraft, setDpDraft] = useState({ value: '', note: '' });
  const [activeMetricForDp, setActiveMetricForDp] = useState(null);
  const list = Array.isArray(metrics) ? metrics : [];

  const grouped = METRIC_TYPES.map((t) => ({ ...t, items: list.filter((m) => m.type === t.value) }));

  const addMetric = async (e) => {
    e?.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    try {
      const updated = await apiJson(`/projects/${projectId}/metrics`, {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      onChange(updated);
      setDraft({ name: '', type: 'output', unit: '', target: '', baseline: '' });
      setShowAddForm(false);
      showToast('המדד נוסף', 'success');
    } catch {
      showToast('הוספת המדד נכשלה', 'error');
    }
  };

  const deleteMetric = async (metricId) => {
    if (!window.confirm('האם למחוק את המדד וכל הנתונים שלו?')) return;
    try {
      const updated = await apiJson(`/projects/${projectId}/metrics/${metricId}`, { method: 'DELETE' });
      onChange(updated);
    } catch {
      showToast('המחיקה נכשלה', 'error');
    }
  };

  const addDataPoint = async (metricId) => {
    const value = Number(dpDraft.value);
    if (Number.isNaN(value) || dpDraft.value === '') return;
    try {
      const updated = await apiJson(`/projects/${projectId}/metrics/${metricId}/datapoints`, {
        method: 'POST',
        body: JSON.stringify(dpDraft),
      });
      onChange(updated);
      setDpDraft({ value: '', note: '' });
      setActiveMetricForDp(null);
    } catch {
      showToast('שמירת המדידה נכשלה', 'error');
    }
  };

  const deleteDataPoint = async (metricId, dataPointId) => {
    try {
      const updated = await apiJson(`/projects/${projectId}/metrics/${metricId}/datapoints/${dataPointId}`, { method: 'DELETE' });
      onChange(updated);
    } catch {
      showToast('המחיקה נכשלה', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Target size={18} color="var(--primary-color)" />
          מדדי אימפקט
          {list.length > 0 && <span className="drawer-count">{list.length}</span>}
        </h3>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowAddForm((v) => !v)}>
          <Plus size={14} /> הוסף מדד
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={addMetric} style={{ background: 'var(--neutral-bg)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
          <div className="project-drawer-grid-2" style={{ marginBottom: '8px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>שם המדד *</label>
              <input className="form-control" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>סוג</label>
              <select className="form-control" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                {METRIC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label} · {t.description}</option>)}
              </select>
            </div>
          </div>
          <div className="project-drawer-grid-2" style={{ marginBottom: '8px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>יחידה (אופציונלי)</label>
              <input className="form-control" placeholder="שעות / משתתפים / %" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>בסיס</label>
              <input className="form-control" type="number" value={draft.baseline} onChange={(e) => setDraft({ ...draft, baseline: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label>יעד</label>
            <input className="form-control" type="number" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setShowAddForm(false); setDraft({ name: '', type: 'output', unit: '', target: '', baseline: '' }); }}>ביטול</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.name.trim()}>שמור מדד</button>
          </div>
        </form>
      )}

      {list.length === 0 && !showAddForm ? (
        <div className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>טרם הוגדרו מדדי אימפקט לפרויקט</div>
      ) : (
        grouped.map((group) => group.items.length > 0 && (
          <div key={group.value}>
            <div className="metric-group-title">{group.label}</div>
            {group.items.map((metric) => {
              const current = metricCurrentValue(metric);
              const pct = progressPct(metric);
              const isExpanded = expandedId === metric.id;
              const points = metric.data_points || [];
              return (
                <div key={metric.id}>
                  <div className={`metric-row metric-type-${metric.type}`} onClick={() => setExpandedId(isExpanded ? null : metric.id)}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                    <div className="metric-row-name">{metric.name}</div>
                    {pct != null && (
                      <div className="metric-progress">
                        <div className="metric-progress-bar" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="metric-row-value">
                      {current != null ? `${Number(current).toLocaleString()}` : '—'}
                      {metric.target != null && ` / ${Number(metric.target).toLocaleString()}`}
                      {metric.unit && ` ${metric.unit}`}
                    </div>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={(e) => { e.stopPropagation(); setActiveMetricForDp(metric.id); setExpandedId(metric.id); }}
                      title="הוסף מדידה"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ color: 'var(--danger-color)' }}
                      onClick={(e) => { e.stopPropagation(); deleteMetric(metric.id); }}
                      title="מחק מדד"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="metric-data-list">
                      {activeMetricForDp === metric.id && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 0' }}>
                          <input
                            className="form-control"
                            type="number"
                            placeholder="ערך"
                            value={dpDraft.value}
                            onChange={(e) => setDpDraft({ ...dpDraft, value: e.target.value })}
                            autoFocus
                            style={{ width: '100px' }}
                          />
                          <input
                            className="form-control"
                            placeholder="הערה (אופציונלי)"
                            value={dpDraft.note}
                            onChange={(e) => setDpDraft({ ...dpDraft, note: e.target.value })}
                            style={{ flex: 1 }}
                          />
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => addDataPoint(metric.id)}>שמור</button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setActiveMetricForDp(null); setDpDraft({ value: '', note: '' }); }}>ביטול</button>
                        </div>
                      )}
                      {points.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)' }}>אין מדידות עדיין</div>
                      ) : (
                        points.slice().reverse().map((dp) => (
                          <div key={dp.id}>
                            <span style={{ minWidth: '64px' }}>{formatDate(dp.at)}</span>
                            <span style={{ minWidth: '60px', fontWeight: 600 }}>{Number(dp.value).toLocaleString()}</span>
                            <span style={{ flex: 1 }}>{dp.note}</span>
                            <span style={{ minWidth: '60px', textAlign: 'end' }}>{dp.byDisplay}</span>
                            <button type="button" className="btn-icon" style={{ color: 'var(--danger-color)' }} onClick={() => deleteDataPoint(metric.id, dp.id)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

export { TYPE_LABEL, METRIC_TYPES, metricCurrentValue, progressPct };
