/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/purity */
import { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FolderOpen, RefreshCw, Activity, User, AlertTriangle, Clock, CheckSquare, ChevronLeft, Plus, Target, BarChart3, PieChart, TrendingUp, Wallet } from 'lucide-react';
import { SettingsContext } from '../App';
import { apiJson, formatDate } from '../api';
import KanbanBoard from '../components/KanbanBoard';
import { PartnerStatusDonut, ProjectsByStageBar, TaskCompletionLine, ImpactByTypeBar } from '../components/DashboardCharts';

const PRIORITY_REPS = { high: 3, medium: 2, low: 1 };

export default function Dashboard() {
  const [partners, setPartners] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stageOptions, setStageOptions] = useState([]);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('general');
  const { settings } = useContext(SettingsContext);
  const navigate = useNavigate();
  const currentUser = (typeof localStorage !== 'undefined' && localStorage.getItem('username')) || '';
  const priorityEmoji = settings?.priorityEmoji || '🔥';

  const fetchData = () => {
    setLoading(true);
    setError('');
    Promise.all([
      apiJson('/partners'),
      apiJson('/projects'),
      apiJson('/options/project_stage').catch(() => []),
      apiJson('/finance/summary').catch(() => null),
    ])
      .then(([p, proj, stages, fin]) => {
        setPartners(Array.isArray(p) ? p : []);
        setProjects(Array.isArray(proj) ? proj : []);
        setStageOptions(Array.isArray(stages) ? stages : []);
        setFinanceSummary(fin && typeof fin === 'object' ? fin : null);
        setLoading(false);
      })
      .catch((err) => { console.error(err); setError('לא הצלחתי לטעון נתונים.'); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, []);

  const activeProjects = useMemo(() => projects.filter((p) => p.status !== 'archived'), [projects]);

  const projectStats = useMemo(() => {
    const today = Date.now();
    const inSeven = today + 7 * 86400000;
    let overdue = 0;
    let dueSoon = 0;
    for (const p of activeProjects) {
      if (!p.due_date) continue;
      const ts = new Date(p.due_date).getTime();
      if (Number.isNaN(ts)) continue;
      if (ts < today) overdue++;
      else if (ts <= inSeven) dueSoon++;
    }
    return { overdue, dueSoon };
  }, [activeProjects]);

  const stalePartners = useMemo(() => {
    const STALE_DAYS = 30;
    return partners
      .filter((p) => p.status === 'active')
      .map((p) => {
        const ts = new Date(p.lastContactAt || p.createdAt || 0).getTime();
        const days = ts ? Math.floor((Date.now() - ts) / 86400000) : 9999;
        return { partner: p, days };
      })
      .filter((x) => x.days >= STALE_DAYS)
      .sort((a, b) => b.days - a.days)
      .slice(0, 6);
  }, [partners]);

  const myProjects = useMemo(() => {
    if (!currentUser) return [];
    return activeProjects.filter((p) => p.owner === currentUser);
  }, [activeProjects, currentUser]);

  const myOpenTaskCount = useMemo(() => {
    let count = 0;
    for (const p of activeProjects) {
      for (const t of (p.tasks || [])) {
        if (!t.completed) count++;
      }
    }
    return count;
  }, [activeProjects]);

  const upcomingItems = useMemo(() => {
    const items = [];
    const today = Date.now();
    for (const p of activeProjects) {
      if (p.due_date) {
        const ts = new Date(p.due_date).getTime();
        if (!Number.isNaN(ts)) items.push({ kind: 'project', id: p.id, title: p.title, when: ts, due: p.due_date, owner: p.owner });
      }
      for (const t of (p.tasks || [])) {
        if (t.due_date && !t.completed) {
          const ts = new Date(t.due_date).getTime();
          if (!Number.isNaN(ts)) items.push({ kind: 'task', id: `${p.id}-${t.id}`, projectId: p.id, title: `${t.title} · ${p.title}`, when: ts, due: t.due_date, owner: t.assignee });
        }
      }
    }
    return items
      .filter((i) => i.when >= today - 86400000) // include overdue last day
      .sort((a, b) => a.when - b.when)
      .slice(0, 8);
  }, [activeProjects]);

  const allEvents = useMemo(() => {
    const partnerEvents = partners.flatMap((p) =>
      (Array.isArray(p.changeHistory) ? p.changeHistory : []).map((e) => ({ ...e, source: 'partner', entityName: p.organizationName, entityId: p.id, link: `/partners/${p.id}` }))
    );
    const projectEvents = projects.flatMap((p) =>
      (Array.isArray(p.change_history) ? p.change_history : []).map((e) => ({ ...e, source: 'project', entityName: p.title, entityId: p.id, link: `/projects/${p.id}` }))
    );
    return partnerEvents.concat(projectEvents).sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [partners, projects]);

  const feedEvents = useMemo(() => (view === 'personal'
    ? allEvents.filter((e) => e.by === currentUser || e.byDisplay === currentUser)
    : allEvents
  ).slice(0, 10), [allEvents, view, currentUser]);

  if (loading) return <div className="empty-state">טוען נתונים...</div>;
  if (error) return (
    <div className="notice notice-error">
      <div>{error}</div>
      <button className="btn btn-outline" onClick={fetchData} style={{ marginInlineStart: '12px' }}><RefreshCw size={16} /> נסה שוב</button>
    </div>
  );

  const activePartners = partners.filter((p) => p.status === 'active').length;

  const kpis = [
    { icon: <Users size={20} />, value: activePartners, label: 'שותפים פעילים', sub: `${partners.length} סה"כ`, onClick: () => navigate('/partners') },
    { icon: <FolderOpen size={20} />, value: activeProjects.length, label: 'פרויקטים בעבודה', sub: `${projects.filter(p => p.status === 'archived').length} בארכיון`, onClick: () => navigate('/projects') },
    { icon: <CheckSquare size={20} />, value: myOpenTaskCount, label: 'משימות פתוחות', sub: 'בכל הפרויקטים', onClick: () => navigate('/projects') },
    { icon: <Clock size={20} />, value: projectStats.dueSoon, label: 'מועדים השבוע', sub: 'ב-7 ימים הקרובים', onClick: () => navigate('/projects') },
    { icon: <AlertTriangle size={20} />, value: projectStats.overdue, label: 'באיחור', sub: 'דורש תשומת לב', onClick: () => navigate('/projects') },
  ];

  return (
    <div>
      <div className="header-flex" style={{ marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '4px' }}>דאשבורד</h2>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>סקירת מצב ופעילות עדכנית</div>
        </div>
        <div className="dashboard-toggle">
          <button className={view === 'general' ? 'active' : ''} onClick={() => setView('general')}>כללי</button>
          <button className={view === 'personal' ? 'active' : ''} onClick={() => setView('personal')}><User size={14} /> אישי</button>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        {kpis.map((k, i) => (
          <KpiCard key={i} {...k} />
        ))}
      </div>

      {false && financeSummary && financeSummary.entryCount > 0 && (() => {
        const fmtMoney = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
        return (
          <div className="card clickable-card" style={{ marginBottom: 22 }} onClick={() => navigate('/finance')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Wallet size={20} color="var(--brand-magenta)" />
              <h3 style={{ margin: 0 }}>סקירת כספים</h3>
              <span className="muted-text" style={{ fontSize: '0.82rem', marginInlineStart: 'auto' }}>פתח לוח כספים ←</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--success-bg)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--success-text)' }}>התקבל</div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--success-text)' }}>{fmtMoney(financeSummary.received)}</div>
              </div>
              <div style={{ padding: 12, background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--danger-text)' }}>שולם</div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--danger-text)' }}>{fmtMoney(financeSummary.sent)}</div>
              </div>
              <div style={{ padding: 12, background: 'var(--primary-light)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--brand-navy)' }}>נטו</div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--brand-navy)' }}>{fmtMoney(financeSummary.netActual)}</div>
              </div>
              <div style={{ padding: 12, background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--warning-text)' }}>צפוי להיכנס</div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--warning-text)' }}>{fmtMoney(financeSummary.pledgedIncoming)}</div>
              </div>
              {financeSummary.overdueCount > 0 && (
                <div style={{ padding: 12, background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', border: '2px solid var(--danger-color)' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--danger-text)' }}>באיחור</div>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--danger-text)' }}>
                    {fmtMoney(financeSummary.overdueAmount)} <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>· {financeSummary.overdueCount}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="dashboard-main-grid">
        {/* Charts row */}
        <div className="card">
          <div className="card-header">
            <h3><PieChart size={18} color="var(--primary-color)" /> חלוקת שותפים לפי סטטוס</h3>
          </div>
          <PartnerStatusDonut partners={partners} />
        </div>
        <div className="card">
          <div className="card-header">
            <h3><BarChart3 size={18} color="var(--success-color)" /> פרויקטים לפי שלב</h3>
          </div>
          <ProjectsByStageBar projects={activeProjects} stageOptions={stageOptions} />
        </div>
        <div className="card">
          <div className="card-header">
            <h3><TrendingUp size={18} color="var(--warning-color)" /> השלמת משימות (30 ימים)</h3>
          </div>
          <TaskCompletionLine projects={projects} />
        </div>
        <div className="card">
          <div className="card-header">
            <h3><Target size={18} color="var(--color-violet)" /> אימפקט לפי סוג מדד</h3>
          </div>
          <ImpactByTypeBar projects={activeProjects} />
        </div>

        {/* Mini Kanban */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <FolderOpen size={18} color="var(--primary-color)" /> מצב הפרויקטים
            </h3>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/projects')}>
              לכל הפרויקטים <ChevronLeft size={14} />
            </button>
          </div>
          {activeProjects.length === 0 ? (
            <div className="empty-state">אין פרויקטים פעילים. <button className="btn btn-primary btn-sm" style={{ marginInlineStart: '8px' }} onClick={() => navigate('/projects')}><Plus size={14} /> צור פרויקט</button></div>
          ) : (
            <KanbanBoard
              projects={activeProjects}
              stageOptions={stageOptions}
              allPartners={partners}
              readOnly
              priorityEmoji={priorityEmoji}
            />
          )}
        </div>

        {/* Upcoming deadlines */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} color="var(--primary-color)" /> מועדים קרובים
          </h3>
          {upcomingItems.length === 0 ? (
            <div className="muted-text">אין מועדים קרובים</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {upcomingItems.map((it) => {
                const overdue = it.when < Date.now() - 86400000 ? false : it.when < Date.now();
                return (
                  <div
                    key={it.id}
                    className="upcoming-row clickable-card-light"
                    onClick={() => navigate(it.kind === 'task' ? `/projects/${it.projectId}` : `/projects/${it.id}`)}
                  >
                    <span className={`due-chip ${overdue ? 'due-chip-overdue' : 'due-chip-soon'}`} style={{ minWidth: '64px', textAlign: 'center' }}>
                      {formatDate(it.due)}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.88rem' }}>{it.title}</span>
                    {it.owner && <span className="owner-bubble" title={it.owner}>{it.owner.slice(0, 2)}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* My projects */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} color="var(--primary-color)" /> הפרויקטים שלי
          </h3>
          {myProjects.length === 0 ? (
            <div className="muted-text">אינך מסומן כאחראי על פרויקט פעיל.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {myProjects.slice(0, 8).map((p) => (
                <div
                  key={p.id}
                  className="upcoming-row clickable-card-light"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{p.title}</span>
                  {p.priority && <span className="priority-chip">{priorityEmoji.repeat(PRIORITY_REPS[p.priority] || 0)}</span>}
                  {p.due_date && <span className="muted-text" style={{ fontSize: '0.78rem' }}>{formatDate(p.due_date)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stale partners */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} color="var(--warning-color)" /> שותפים בקשר רדום
          </h3>
          {stalePartners.length === 0 ? (
            <div className="muted-text">כל הפעילים עודכנו ב-30 הימים האחרונים 👌</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {stalePartners.map(({ partner, days }) => (
                <div key={partner.id} className="upcoming-row clickable-card-light" onClick={() => navigate(`/partners/${partner.id}`)}>
                  <span className="stale-chip" style={{ marginTop: 0 }}>{days} ימים</span>
                  <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500 }}>{partner.organizationName}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 600 }}>
            <Activity size={18} color="var(--primary-color)" />
            פעילות אחרונה
            {view === 'personal' && <span className="muted-text" style={{ fontSize: '0.85rem', fontWeight: 400 }}>(שלי בלבד)</span>}
          </h3>
          {feedEvents.length === 0 ? (
            <div className="muted-text">אין פעילות מתועדת{view === 'personal' ? ' עבורך' : ''}.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {feedEvents.map((event, i) => (
                <div
                  key={`${event.source}-${event.id || i}`}
                  className="activity-row clickable-card-light"
                  onClick={() => navigate(event.link)}
                >
                  <span className="muted-text" style={{ minWidth: '64px', fontSize: '0.8rem' }}>{formatDate(event.at)}</span>
                  <span style={{ minWidth: '80px', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.85rem' }}>{event.byDisplay || event.by || 'לא ידוע'}</span>
                  <span style={{ flex: 1, fontSize: '0.88rem' }}>{event.summary || event.action || 'עדכון'}</span>
                  <span className={`badge ${event.source === 'project' ? 'badge-project' : 'badge-partner'}`}>
                    {event.source === 'project' ? 'פרויקט' : 'שותף'}
                  </span>
                  <span className="muted-text" style={{ minWidth: '120px', textAlign: 'left', fontSize: '0.82rem' }}>{event.entityName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, value, label, sub, onClick }) {
  return (
    <div className="kpi-card-modern clickable-card" onClick={onClick}>
      <div className="kpi-card-icon">{icon}</div>
      <div className="kpi-card-value">{Number(value || 0).toLocaleString()}</div>
      <div className="kpi-card-label">{label}</div>
      <div className="kpi-card-sub">{sub}</div>
    </div>
  );
}
