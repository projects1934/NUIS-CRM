/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Wallet, TrendingUp, TrendingDown, Clock, AlertTriangle,
  ArrowDownToLine, ArrowUpFromLine, Search, X, CheckCircle2,
} from 'lucide-react';
import { apiJson } from '../api';
import { useCan } from '../context/UserContext.jsx';
import { showToast } from '../components/Toast';

const DIRECTION_OPTIONS = [
  { value: 'incoming', label: 'נכנס (מהשותף אלינו)' },
  { value: 'outgoing', label: 'יוצא (מאיתנו לשותף)' },
];
const KIND_OPTIONS = [
  { value: 'actual',  label: 'תנועה שהתבצעה' },
  { value: 'pledge',  label: 'התחייבות עתידית' },
];
const STATUS_OPTIONS = [
  { value: 'paid',      label: 'שולם' },
  { value: 'pending',   label: 'ממתין' },
  { value: 'overdue',   label: 'באיחור' },
  { value: 'cancelled', label: 'בוטל' },
];

const fmt = (n) => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
const fmtMoney = (n, currency = 'ILS') => {
  const symbol = currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '';
  return `${symbol}${fmt(n)}`;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

function StatusChip({ status }) {
  const map = {
    paid:      { label: 'שולם',    color: 'var(--success-color)', bg: 'var(--success-bg)', text: 'var(--success-text)' },
    pending:   { label: 'ממתין',   color: 'var(--warning-color)', bg: 'var(--warning-bg)', text: 'var(--warning-text)' },
    overdue:   { label: 'באיחור',  color: 'var(--danger-color)',  bg: 'var(--danger-bg)',  text: 'var(--danger-text)' },
    cancelled: { label: 'בוטל',    color: 'var(--neutral-color)', bg: 'var(--neutral-bg)', text: 'var(--neutral-text)' },
  };
  const m = map[status] || map.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700,
      background: m.bg, color: m.text, border: `1px solid ${m.color}`,
    }}>{m.label}</span>
  );
}

function DirectionChip({ direction }) {
  const isIn = direction === 'incoming';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700,
      background: isIn ? 'rgba(45,157,95,0.12)' : 'rgba(242,5,93,0.10)',
      color: isIn ? 'var(--success-text)' : 'var(--danger-text)',
    }}>
      {isIn ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
      {isIn ? 'נכנס' : 'יוצא'}
    </span>
  );
}

function KpiTile({ icon, value, label, sub, color, bg }) {
  return (
    <div className="kpi-card-modern" style={{ '--kpi-color': color, '--kpi-bg': bg }}>
      <div className="kpi-card-icon">{icon}</div>
      <div className="kpi-card-value">{fmtMoney(value)}</div>
      <div className="kpi-card-label">{label}</div>
      {sub && <div className="kpi-card-sub">{sub}</div>}
    </div>
  );
}

export default function Finance() {
  const navigate = useNavigate();
  const canWrite = useCan('write');
  const canDelete = useCan('delete');
  const [entries, setEntries] = useState([]);
  const [partners, setPartners] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      apiJson('/finance/entries'),
      apiJson('/partners'),
      apiJson('/projects'),
    ]).then(([e, p, pr]) => {
      setEntries(Array.isArray(e) ? e : []);
      setPartners(Array.isArray(p) ? p : []);
      setProjects(Array.isArray(pr) ? pr : []);
      setLoading(false);
    }).catch(() => { setError('לא הצלחתי לטעון נתוני כספים.'); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const partnerMap = useMemo(() => {
    const m = {};
    for (const p of partners) m[p.id] = p.organizationName || '';
    return m;
  }, [partners]);
  const projectMap = useMemo(() => {
    const m = {};
    for (const p of projects) m[p.id] = p.title || '';
    return m;
  }, [projects]);

  // Mark overdue dynamically (server doesn't auto-flip statuses)
  const enriched = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return entries.map((e) => {
      if (e.status === 'pending' && e.dueOn && new Date(e.dueOn).getTime() < today.getTime()) {
        return { ...e, status: 'overdue' };
      }
      return e;
    });
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((e) => {
      if (filterPartner && e.partnerId !== filterPartner) return false;
      if (filterKind && e.kind !== filterKind) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      if (q) {
        const haystack = [
          partnerMap[e.partnerId] || '',
          projectMap[e.projectId] || '',
          e.category, e.reference, e.description,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, search, filterPartner, filterKind, filterStatus, partnerMap, projectMap]);

  const summary = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const sum = (arr) => arr.reduce((a, e) => a + Number(e.amount || 0), 0);
    const actuals = filtered.filter((e) => e.kind === 'actual');
    const pledges = filtered.filter((e) => e.kind === 'pledge');
    const received = sum(actuals.filter((e) => e.direction === 'incoming' && e.status === 'paid'));
    const sent     = sum(actuals.filter((e) => e.direction === 'outgoing' && e.status === 'paid'));
    const pledgedIn  = sum(pledges.filter((e) => e.direction === 'incoming' && (e.status === 'pending' || e.status === 'overdue')));
    const pledgedOut = sum(pledges.filter((e) => e.direction === 'outgoing' && (e.status === 'pending' || e.status === 'overdue')));
    const overdueList = filtered.filter((e) => e.status === 'overdue');
    return {
      received, sent, net: received - sent,
      pledgedIncoming: pledgedIn, pledgedOutgoing: pledgedOut,
      overdueAmount: sum(overdueList), overdueCount: overdueList.length,
    };
  }, [filtered]);

  const perPartnerRows = useMemo(() => {
    const groups = {};
    for (const e of enriched) {
      if (!groups[e.partnerId]) groups[e.partnerId] = [];
      groups[e.partnerId].push(e);
    }
    return Object.entries(groups).map(([pid, list]) => {
      const sum = (arr) => arr.reduce((a, e) => a + Number(e.amount || 0), 0);
      const received = sum(list.filter((e) => e.kind === 'actual' && e.direction === 'incoming' && e.status === 'paid'));
      const sent     = sum(list.filter((e) => e.kind === 'actual' && e.direction === 'outgoing' && e.status === 'paid'));
      const pledgedIn  = sum(list.filter((e) => e.kind === 'pledge' && e.direction === 'incoming' && (e.status === 'pending' || e.status === 'overdue')));
      const pledgedOut = sum(list.filter((e) => e.kind === 'pledge' && e.direction === 'outgoing' && (e.status === 'pending' || e.status === 'overdue')));
      const overdue  = list.filter((e) => e.status === 'overdue').length;
      return {
        partnerId: pid,
        name: partnerMap[pid] || '(שותף שנמחק)',
        received, sent, net: received - sent,
        pledgedIncoming: pledgedIn, pledgedOutgoing: pledgedOut,
        overdueCount: overdue, total: list.length,
      };
    }).sort((a, b) => (b.received + b.pledgedIncoming) - (a.received + a.pledgedIncoming));
  }, [enriched, partnerMap]);

  const upcomingObligations = useMemo(() => {
    return enriched
      .filter((e) => e.kind === 'pledge' && (e.status === 'pending' || e.status === 'overdue'))
      .sort((a, b) => {
        const ax = a.dueOn ? new Date(a.dueOn).getTime() : Infinity;
        const bx = b.dueOn ? new Date(b.dueOn).getTime() : Infinity;
        return ax - bx;
      });
  }, [enriched]);

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (entry) => { setEditing(entry); setShowForm(true); };

  const remove = async (id) => {
    if (!window.confirm('למחוק את התנועה?')) return;
    try {
      await apiJson(`/finance/entries/${id}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      showToast('התנועה נמחקה', 'success');
    } catch { showToast('המחיקה נכשלה', 'error'); }
  };

  const markPaid = async (entry) => {
    try {
      const updated = await apiJson(`/finance/entries/${entry.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'paid', occurredOn: entry.occurredOn || new Date().toISOString().split('T')[0] }),
      });
      setEntries((prev) => prev.map((e) => e.id === entry.id ? updated : e));
      showToast('סומן כשולם', 'success');
    } catch { showToast('העדכון נכשל', 'error'); }
  };

  if (loading) return <div className="empty-state">טוען נתוני כספים...</div>;
  if (error) return <div className="notice notice-error">{error}</div>;

  return (
    <div>
      <div className="header-flex">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={22} color="var(--brand-magenta)" /> ניהול כספים
          </h2>
          <div className="muted-text" style={{ marginTop: 4 }}>תנועות שהתבצעו והתחייבויות עתידיות מול שותפים</div>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={18} /> תנועה חדשה
          </button>
        )}
      </div>

      <div className="dashboard-kpi-grid">
        <KpiTile icon={<TrendingUp size={20} />}    value={summary.received}        label="התקבל"               sub="בפועל" color="#2D9D5F" bg="#E0F2E7" />
        <KpiTile icon={<TrendingDown size={20} />}  value={summary.sent}            label="שולם החוצה"         sub="בפועל" color="#F2055D" bg="#FCE6EF" />
        <KpiTile icon={<Wallet size={20} />}        value={summary.net}             label="נטו"                 sub="התקבל − שולם" color="#052941" bg="#E6EBF0" />
        <KpiTile icon={<Clock size={20} />}         value={summary.pledgedIncoming} label="צפוי להיכנס"        sub="התחייבויות פתוחות" color="#FFCA02" bg="#FFF4C7" />
        <KpiTile icon={<AlertTriangle size={20} />} value={summary.overdueAmount}   label="באיחור"             sub={`${summary.overdueCount} תנועות`} color="#F2055D" bg="#FCE6EF" />
      </div>

      {upcomingObligations.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} color="var(--brand-yellow)" /> התחייבויות עתידיות ({upcomingObligations.length})
          </h3>
          <div className="finance-pledges">
            {upcomingObligations.slice(0, 6).map((e) => (
              <div key={e.id} className="finance-pledge-row" onClick={() => navigate(`/partners/${e.partnerId}`)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{partnerMap[e.partnerId] || '(שותף שנמחק)'}</div>
                  <div className="muted-text" style={{ fontSize: '0.82rem' }}>
                    {e.description || e.category || (e.direction === 'incoming' ? 'התחייבות נכנסת' : 'התחייבות יוצאת')}
                  </div>
                </div>
                <div style={{ textAlign: 'end' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: e.direction === 'incoming' ? 'var(--success-text)' : 'var(--danger-text)' }}>
                    {e.direction === 'incoming' ? '+' : '−'} {fmtMoney(e.amount, e.currency)}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: e.status === 'overdue' ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                    יעד {fmtDate(e.dueOn)} {e.status === 'overdue' && '· באיחור'}
                  </div>
                </div>
                {canWrite && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={(ev) => { ev.stopPropagation(); markPaid(e); }}
                    title="סמן כשולם"
                  ><CheckCircle2 size={14} /> בוצע</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>סיכום לפי שותף</h3>
        {perPartnerRows.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>טרם הוזנו תנועות.</div>
        ) : (
          <div className="finance-partner-grid">
            <div className="finance-partner-head">
              <div>שותף</div>
              <div>התקבל</div>
              <div>שולם</div>
              <div>נטו</div>
              <div>צפוי</div>
            </div>
            {perPartnerRows.map((row) => (
              <div key={row.partnerId} className="finance-partner-row" onClick={() => navigate(`/partners/${row.partnerId}`)}>
                <div className="finance-partner-name">
                  {row.name}
                  {row.overdueCount > 0 && (
                    <span className="stale-chip" style={{ marginInlineStart: 6 }}>{row.overdueCount} באיחור</span>
                  )}
                </div>
                <div style={{ color: 'var(--success-text)', fontWeight: 700 }}>{fmtMoney(row.received)}</div>
                <div style={{ color: 'var(--danger-text)', fontWeight: 700 }}>{fmtMoney(row.sent)}</div>
                <div style={{ fontWeight: 800 }}>{fmtMoney(row.net)}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{fmtMoney(row.pledgedIncoming)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              className="form-control"
              placeholder="חיפוש (תיאור, קטגוריה, אסמכתא)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingInlineStart: 36 }}
            />
            {search && (
              <button className="btn-icon" style={{ position: 'absolute', insetInlineEnd: 6, top: '50%', transform: 'translateY(-50%)' }} onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <select className="form-control" style={{ width: 200 }} value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}>
            <option value="">כל השותפים</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.organizationName}</option>)}
          </select>
          <select className="form-control" style={{ width: 170 }} value={filterKind} onChange={(e) => setFilterKind(e.target.value)}>
            <option value="">כל הסוגים</option>
            {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <select className="form-control" style={{ width: 140 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>לא נמצאו תנועות.</div>
        ) : (
          <div className="finance-entries">
            {filtered.map((e) => (
              <div key={e.id} className="finance-entry-row" onClick={() => canWrite && openEdit(e)}>
                <div className="finance-entry-main">
                  <div className="finance-entry-amount" style={{ color: e.direction === 'incoming' ? 'var(--success-text)' : 'var(--danger-text)' }}>
                    {e.direction === 'incoming' ? '+' : '−'} {fmtMoney(e.amount, e.currency)}
                  </div>
                  <div className="finance-entry-info">
                    <div className="finance-entry-title">
                      <span style={{ fontWeight: 700 }}>{partnerMap[e.partnerId] || '(שותף שנמחק)'}</span>
                      <DirectionChip direction={e.direction} />
                      {e.kind === 'pledge' && <span style={{ fontSize: '0.74rem', padding: '2px 8px', borderRadius: 999, background: 'var(--brand-gray-light)', fontWeight: 700 }}>התחייבות</span>}
                      <StatusChip status={e.status} />
                    </div>
                    <div className="finance-entry-meta">
                      {e.category && <span>{e.category}</span>}
                      {e.projectId && projectMap[e.projectId] && <span>· פרויקט: {projectMap[e.projectId]}</span>}
                      {e.description && <span>· {e.description}</span>}
                      {e.reference && <span>· אסמכתא {e.reference}</span>}
                    </div>
                  </div>
                </div>
                <div className="finance-entry-side">
                  <div style={{ fontSize: '0.85rem' }}>
                    {e.kind === 'pledge' && e.status !== 'paid'
                      ? <>יעד <strong>{fmtDate(e.dueOn)}</strong></>
                      : <>בוצע <strong>{fmtDate(e.occurredOn)}</strong></>}
                  </div>
                  {canWrite && e.kind === 'pledge' && e.status !== 'paid' && (
                    <button className="btn btn-outline btn-sm" onClick={(ev) => { ev.stopPropagation(); markPaid(e); }} title="סמן כבוצע">
                      <CheckCircle2 size={14} /> סמן כבוצע
                    </button>
                  )}
                  {canDelete && (
                    <button className="btn-icon" style={{ color: 'var(--danger-color)' }} onClick={(ev) => { ev.stopPropagation(); remove(e.id); }} title="מחק">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <FinanceFormModal
          entry={editing}
          partners={partners}
          projects={projects}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={(saved, mode) => {
            if (mode === 'create') setEntries((prev) => [saved, ...prev]);
            else setEntries((prev) => prev.map((e) => e.id === saved.id ? saved : e));
            setShowForm(false); setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function FinanceFormModal({ entry, partners, projects, onClose, onSaved }) {
  const isEdit = Boolean(entry);
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState(entry ? {
    partnerId: entry.partnerId || '',
    projectId: entry.projectId || '',
    direction: entry.direction || 'incoming',
    kind: entry.kind || 'actual',
    amount: entry.amount || 0,
    currency: entry.currency || 'ILS',
    occurredOn: entry.occurredOn || '',
    dueOn: entry.dueOn || '',
    status: entry.status || 'paid',
    category: entry.category || '',
    reference: entry.reference || '',
    description: entry.description || '',
  } : {
    partnerId: '', projectId: '', direction: 'incoming', kind: 'actual',
    amount: '', currency: 'ILS', occurredOn: today, dueOn: '',
    status: 'paid', category: '', reference: '', description: '',
  });
  const [busy, setBusy] = useState(false);

  const update = (k, v) => setForm((prev) => {
    const next = { ...prev, [k]: v };
    // when switching to pledge default to pending+future date
    if (k === 'kind' && v === 'pledge') {
      if (next.status === 'paid') next.status = 'pending';
    }
    if (k === 'kind' && v === 'actual' && next.status === 'pending') {
      next.status = 'paid';
    }
    return next;
  });

  const save = async () => {
    if (!form.partnerId) { showToast('בחר שותף', 'error'); return; }
    if (!Number(form.amount)) { showToast('הזן סכום', 'error'); return; }
    setBusy(true);
    try {
      if (isEdit) {
        const updated = await apiJson(`/finance/entries/${entry.id}`, { method: 'PUT', body: JSON.stringify(form) });
        onSaved(updated, 'edit');
        showToast('התנועה עודכנה', 'success');
      } else {
        const created = await apiJson('/finance/entries', { method: 'POST', body: JSON.stringify(form) });
        onSaved(created, 'create');
        showToast('התנועה נוספה', 'success');
      }
    } catch (err) {
      showToast(err.message || 'השמירה נכשלה', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h2>{isEdit ? 'עריכת תנועה' : 'תנועה כספית חדשה'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>שותף *</label>
            <select className="form-control" value={form.partnerId} onChange={(e) => update('partnerId', e.target.value)}>
              <option value="">בחר שותף...</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.organizationName}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>כיוון *</label>
            <select className="form-control" value={form.direction} onChange={(e) => update('direction', e.target.value)}>
              {DIRECTION_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>סוג *</label>
            <select className="form-control" value={form.kind} onChange={(e) => update('kind', e.target.value)}>
              {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>סכום *</label>
            <input className="form-control" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => update('amount', e.target.value)} />
          </div>
          <div className="form-group">
            <label>מטבע</label>
            <select className="form-control" value={form.currency} onChange={(e) => update('currency', e.target.value)}>
              <option value="ILS">₪ שקל</option>
              <option value="USD">$ דולר</option>
              <option value="EUR">€ יורו</option>
            </select>
          </div>
          {form.kind === 'actual' ? (
            <div className="form-group">
              <label>תאריך ביצוע</label>
              <input className="form-control" type="date" value={form.occurredOn || ''} onChange={(e) => update('occurredOn', e.target.value)} />
            </div>
          ) : (
            <div className="form-group">
              <label>תאריך יעד</label>
              <input className="form-control" type="date" value={form.dueOn || ''} onChange={(e) => update('dueOn', e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label>סטטוס</label>
            <select className="form-control" value={form.status} onChange={(e) => update('status', e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>פרויקט (אופציונלי)</label>
            <select className="form-control" value={form.projectId} onChange={(e) => update('projectId', e.target.value)}>
              <option value="">ללא</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>קטגוריה</label>
            <input className="form-control" placeholder="תרומה, מענק, שירות..." value={form.category} onChange={(e) => update('category', e.target.value)} />
          </div>
          <div className="form-group">
            <label>אסמכתא</label>
            <input className="form-control" placeholder="מס׳ חשבונית/קבלה" value={form.reference} onChange={(e) => update('reference', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>תיאור</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'שומר...' : 'שמור'}</button>
        </div>
      </div>
    </div>
  );
}
