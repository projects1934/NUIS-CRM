/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, FolderOpen, Archive, Trash2, RefreshCw, RotateCcw, Users, List, LayoutGrid, Download, Search, X } from 'lucide-react';
import ProjectDrawer from './ProjectDrawer';
import StatusBadge from './StatusBadge';
import { downloadProjectsXlsx } from './exportProjects';
import KanbanBoard, { PriorityChip, DueChip } from './KanbanBoard';
import { SettingsContext } from './App';
import { apiJson, formatDate } from './api';
import { showToast } from './Toast';

const VIEW_KEY = 'projectsView';
const SEARCH_KEY = 'projectsSearchQuery';

export default function Projects() {
  const navigate = useNavigate();
  const { settings } = useContext(SettingsContext);
  const priorityEmoji = settings?.priorityEmoji || '🔥';

  const [projects, setProjects] = useState([]);
  const [allPartners, setAllPartners] = useState([]);
  const [stageOptions, setStageOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('active');
  const [view, setView] = useState(() => sessionStorage.getItem(VIEW_KEY) || 'list');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem(SEARCH_KEY) || '');

  const fetchProjects = () => {
    setLoading(true);
    Promise.all([
      apiJson('/projects'),
      apiJson('/partners'),
      apiJson('/options/project_stage').catch(() => []),
    ])
      .then(([proj, partners, stages]) => {
        setProjects(Array.isArray(proj) ? proj : []);
        setAllPartners(Array.isArray(partners) ? partners : []);
        setStageOptions(Array.isArray(stages) ? stages : []);
        setLoading(false);
      })
      .catch(() => { setError('לא הצלחתי לטעון פרויקטים.'); setLoading(false); });
  };

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => { sessionStorage.setItem(VIEW_KEY, view); }, [view]);
  useEffect(() => {
    if (searchQuery) sessionStorage.setItem(SEARCH_KEY, searchQuery);
    else sessionStorage.removeItem(SEARCH_KEY);
  }, [searchQuery]);

  const filtered = projects.filter((p) =>
    tab === 'active' ? p.status !== 'archived' : p.status === 'archived'
  );

  const partnerNameMap = useMemo(() => {
    const m = {};
    for (const p of allPartners) m[p.id] = p.organizationName || '';
    return m;
  }, [allPartners]);

  const searchableText = (project) => {
    const partnerNames = (project.partners || [])
      .map((lp) => partnerNameMap[lp.partner_id])
      .filter(Boolean)
      .join(' ');
    const labels = (project.labels || []).map((l) => l.label || '').join(' ');
    return [
      project.title,
      project.goal,
      project.description,
      project.owner,
      project.leading_department,
      project.stage,
      partnerNames,
      labels,
    ].filter(Boolean).join(' ').toLowerCase();
  };

  const processed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((p) => searchableText(p).includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, searchQuery, partnerNameMap]);

  const openNew = () => { setDrawerOpen(true); };

  const handleExport = () => {
    try {
      downloadProjectsXlsx({ projects: processed, partners: allPartners });
    } catch {
      showToast('הייצוא נכשל', 'error');
    }
  };

  const handleSave = () => {
    setDrawerOpen(false);
    fetchProjects();
    showToast('הפרויקט נשמר בהצלחה', 'success');
  };

  const toggleArchive = async (e, project) => {
    e.stopPropagation();
    const newStatus = project.status === 'archived' ? 'active' : 'archived';
    try {
      await apiJson(`/projects/${project.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
      fetchProjects();
      showToast(newStatus === 'archived' ? 'הפרויקט הועבר לארכיון' : 'הפרויקט שוחזר', 'success');
    } catch {
      showToast('הפעולה נכשלה', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiJson(`/projects/${id}`, { method: 'DELETE' });
      fetchProjects();
      setConfirmDeleteId(null);
      showToast('הפרויקט נמחק', 'info');
    } catch {
      showToast('המחיקה נכשלה', 'error');
    }
  };

  const getPartnerRefs = (partners) => {
    if (!partners || partners.length === 0) return [];
    return partners
      .map((p) => {
        const ap = allPartners.find((x) => x.id === p.partner_id);
        return ap ? { id: ap.id, name: ap.organizationName } : null;
      })
      .filter(Boolean);
  };

  if (loading) return <div className="empty-state">טוען פרויקטים...</div>;
  if (error) return (
    <div className="notice notice-error">
      {error}
      <button className="btn btn-outline" style={{ marginInlineStart: '12px' }} onClick={fetchProjects}>
        <RefreshCw size={16} /> נסה שוב
      </button>
    </div>
  );

  return (
    <div>
      <div className="header-flex">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderOpen size={22} color="var(--primary-color)" /> פרוייקטים
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" onClick={handleExport} title="ייצוא לאקסל">
            <Download size={16} /> ייצוא לאקסל
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={18} /> פרויקט חדש
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="view-toggle">
          <button className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
            <List size={16} /> רשת
          </button>
          <button className={`view-toggle-btn ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>
            <LayoutGrid size={16} /> Kanban
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${tab === 'active' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab('active')}
          >
            פעילים ({projects.filter((p) => p.status !== 'archived').length})
          </button>
          <button
            className={`btn ${tab === 'archived' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab('archived')}
          >
            <Archive size={16} /> ארכיון ({projects.filter((p) => p.status === 'archived').length})
          </button>
        </div>
      </div>

      <div className="projects-search-bar">
        <div className="projects-search-input-wrap">
          <Search size={16} className="projects-search-icon" />
          <input
            className="form-control projects-search-input"
            type="search"
            placeholder="חיפוש לפי שם פרויקט, שותף, אחראי, תיאור..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-icon projects-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="נקה חיפוש"
              title="נקה חיפוש"
            >
              <X size={16} />
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="projects-search-meta">
            מציג {processed.length} מתוך {filtered.length} פרויקטים תואמים ל-«{searchQuery}»
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          {tab === 'active' ? 'אין פרויקטים פעילים. לחץ על "פרויקט חדש" להתחלה.' : 'אין פרויקטים בארכיון.'}
        </div>
      ) : processed.length === 0 ? (
        <div className="empty-state">
          לא נמצאו פרויקטים תואמים ל-«{searchQuery}».
          {' '}
          <button type="button" className="btn btn-outline btn-sm" style={{ marginInlineStart: '8px' }} onClick={() => setSearchQuery('')}>
            נקה חיפוש
          </button>
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard
          projects={processed}
          stageOptions={stageOptions}
          allPartners={allPartners}
          onMutated={fetchProjects}
          priorityEmoji={priorityEmoji}
        />
      ) : (
        <div className="project-grid">
          {processed.map((project) => {
            const partnerRefs = getPartnerRefs(project.partners);
            const extraCount = partnerRefs.length > 3 ? partnerRefs.length - 3 : 0;
            const visibleRefs = partnerRefs.slice(0, 3);
            const taskCount = (project.tasks || []).length;
            const taskDone = (project.tasks || []).filter((t) => t.completed).length;
            const stage = stageOptions.find((s) => s.label === project.stage);

            return (
              <div
                key={project.id}
                className="project-card clickable-card"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div className="project-card-title">{project.title}</div>
                  <StatusBadge status={project.status === 'archived' ? 'archived' : 'active'} />
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {stage && (
                    <span className="stage-chip" style={{ background: stage.color || 'var(--neutral-bg)' }}>{stage.label}</span>
                  )}
                  <PriorityChip value={project.priority} emojiChar={priorityEmoji} />
                  <DueChip value={project.due_date} />
                  {project.owner && <span className="owner-bubble" title={project.owner}>{project.owner.slice(0, 2)}</span>}
                </div>

                {project.leading_department && (
                  <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 500 }}>מחלקה:</span> {project.leading_department}
                  </div>
                )}

                {project.description && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {project.description.slice(0, 110)}{project.description.length > 110 ? '...' : ''}
                  </p>
                )}

                {partnerRefs.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '2px' }} onClick={(e) => e.stopPropagation()}>
                    {visibleRefs.map((ref) => (
                      <Link key={ref.id} to={`/partners/${ref.id}`} className="partner-chip clickable-chip" style={{ textDecoration: 'none' }}>{ref.name}</Link>
                    ))}
                    {extraCount > 0 && (
                      <span className="partner-chip partner-chip-more">+{extraCount}</span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Users size={13} /> אין שותפים מקושרים
                  </div>
                )}

                {taskCount > 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    משימות: {taskDone}/{taskCount}
                  </div>
                )}

                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 'auto' }}>
                  נוצר: {formatDate(project.created_at)}
                </div>

                {confirmDeleteId === project.id ? (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--danger-color)', flex: 1 }}>למחוק לצמיתות?</span>
                    <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => handleDelete(project.id)}>מחק</button>
                    <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setConfirmDeleteId(null)}>ביטול</button>
                  </div>
                ) : (
                  <div className="project-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-outline" style={{ flex: 1, padding: '6px', fontSize: '0.8rem' }} onClick={(e) => toggleArchive(e, project)}>
                      {project.status === 'archived'
                        ? <><RotateCcw size={14} /> שחזור</>
                        : <><Archive size={14} /> ארכיון</>}
                    </button>
                    <button className="btn btn-outline" style={{ padding: '6px', color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }} onClick={() => setConfirmDeleteId(project.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ProjectDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        project={null}
      />
    </div>
  );
}
