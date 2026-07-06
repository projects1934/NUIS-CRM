/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/purity, no-unused-vars */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowRight, Edit, Trash2, Users, Building2, Calendar, Link2, FolderOpen, Plus, X, ExternalLink, Tag, Printer, Target, FileText } from 'lucide-react';
import { useCan } from '../context/UserContext.jsx';
import StatusBadge from '../components/StatusBadge';
import InlineEdit from '../components/InlineEdit';
import ProjectDrawer from '../components/ProjectDrawer';
import ProjectTasks from '../components/ProjectTasks';
import ProjectComments from '../components/ProjectComments';
import ProjectActivity from '../components/ProjectActivity';
import ProjectMetrics from '../components/ProjectMetrics';
import TagInput from '../components/TagInput';
import { apiJson, formatDate, normalizeUrl } from '../api';
import { showToast } from '../components/Toast';

const PRIORITY_OPTIONS = [
  { value: '',       label: 'לא נבחר' },
  { value: 'high',   label: 'גבוה' },
  { value: 'medium', label: 'בינוני' },
  { value: 'low',    label: 'נמוך' },
];

const PRIORITY_LABEL = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' };

function priorityChip(value, emojiChar = '🔥') {
  if (!value) return <span className="priority-chip priority-chip-empty">לא נבחר</span>;
  const reps = value === 'high' ? 3 : value === 'medium' ? 2 : 1;
  return <span className="priority-chip" title={`עדיפות ${PRIORITY_LABEL[value]}`}>{emojiChar.repeat(reps)}</span>;
}

function dueDateChip(value) {
  if (!value) return <span className="muted-text">—</span>;
  const dueTs = new Date(value).getTime();
  if (Number.isNaN(dueTs)) return <span className="muted-text">—</span>;
  const daysFromNow = Math.ceil((dueTs - Date.now()) / 86400000);
  let cls = 'due-chip';
  if (daysFromNow < 0) cls += ' due-chip-overdue';
  else if (daysFromNow <= 7) cls += ' due-chip-soon';
  return <span className={cls}>{formatDate(value)}</span>;
}

export default function ProjectDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stageOptions, setStageOptions] = useState([]);
  const [labelOptions, setLabelOptions] = useState([]);
  const [allPartners, setAllPartners] = useState([]);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerSearch, setShowPartnerSearch] = useState(false);

  const fetchProject = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson(`/projects/${id}`);
      setProject(data);
    } catch (err) {
      console.error(err);
      setError('לא הצלחתי לטעון את הפרויקט.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [stages, labels, partners] = await Promise.all([
        apiJson('/options/project_stage').catch(() => []),
        apiJson('/options/project_label').catch(() => []),
        apiJson('/partners').catch(() => []),
      ]);
      setStageOptions(Array.isArray(stages) ? stages : []);
      setLabelOptions(Array.isArray(labels) ? labels : []);
      setAllPartners(Array.isArray(partners) ? partners : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchProject(); fetchOptions(); }, [id]);

  const stageMap = useMemo(() => {
    const m = {};
    for (const s of stageOptions) m[s.label] = s;
    return m;
  }, [stageOptions]);

  const handleFieldUpdate = async (field, value) => {
    const previous = project;
    setProject((p) => ({ ...p, [field]: value }));
    try {
      const updated = await apiJson(`/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value }),
      });
      setProject(updated);
      showToast('השינוי נשמר', 'success');
    } catch (err) {
      console.error(err);
      setProject(previous);
      showToast('השמירה נכשלה', 'error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('האם למחוק את הפרויקט?')) return;
    try {
      await apiJson(`/projects/${id}`, { method: 'DELETE' });
      navigate('/projects');
    } catch {
      showToast('המחיקה נכשלה', 'error');
    }
  };

  const addPartner = async (partner) => {
    try {
      await apiJson(`/projects/${id}/partners`, {
        method: 'POST',
        body: JSON.stringify({ partnerId: partner.id, contactId: null }),
      });
      setPartnerSearch('');
      setShowPartnerSearch(false);
      fetchProject();
      showToast('השותף נוסף', 'success');
    } catch {
      showToast('ההוספה נכשלה', 'error');
    }
  };

  const removePartner = async (partnerId) => {
    try {
      await apiJson(`/projects/${id}/partners/${partnerId}`, { method: 'DELETE' });
      fetchProject();
    } catch {
      showToast('ההסרה נכשלה', 'error');
    }
  };

  const setPartnerContact = async (partnerId, contactId) => {
    try {
      await apiJson(`/projects/${id}/partners/${partnerId}`, { method: 'DELETE' });
      await apiJson(`/projects/${id}/partners`, {
        method: 'POST',
        body: JSON.stringify({ partnerId, contactId: contactId || null }),
      });
      fetchProject();
    } catch {
      showToast('השינוי נכשל', 'error');
    }
  };

  const handleLabelsChange = (labels) => handleFieldUpdate('labels', labels);

  if (loading) return <div className="empty-state">טוען פרויקט...</div>;
  if (error && !project) return <div className="notice notice-error">{error}</div>;
  if (!project) return <div className="empty-state">פרויקט לא נמצא.</div>;

  const linkedPartnersDetailed = (project.partners || []).map((lp) => {
    const ap = allPartners.find((x) => x.id === lp.partner_id);
    return {
      partner_id: lp.partner_id,
      partner_name: ap?.organizationName || '(שותף לא ידוע)',
      contact_id: lp.contact_id || null,
      contacts: ap?.contacts || [],
    };
  });

  const filteredPartners = allPartners.filter(
    (p) => p.organizationName.toLowerCase().includes(partnerSearch.toLowerCase()) &&
      !(project.partners || []).some((lp) => lp.partner_id === p.id)
  );

  const stageOption = stageMap[project.stage];

  return (
    <div>
      <div className="header-flex">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate(location.state?.from || '/projects')} title="חזרה" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowRight size={22} color="var(--text-secondary)" />
          </button>
          <FolderOpen size={20} color="var(--primary-color)" />
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <InlineEdit value={project.title} onSave={(val) => handleFieldUpdate('title', val)} />
          </h2>
          <StatusBadge status={project.status === 'archived' ? 'archived' : 'active'} />
          {stageOption && (
            <span className="stage-chip" style={{ background: stageOption.color || 'var(--neutral-bg)' }}>
              {stageOption.label}
            </span>
          )}
        </div>

        <HeaderActions
          isTemplate={project.is_template}
          onPrint={() => window.print()}
          onEdit={() => setIsQuickEditOpen(true)}
          onSaveAsTemplate={async () => {
            try {
              const updated = await apiJson(`/projects/${id}`, { method: 'PUT', body: JSON.stringify({ is_template: !project.is_template }) });
              setProject(updated);
            } catch { /* ignore */ }
          }}
          onDelete={handleDelete}
        />
      </div>

      <div className="grid grid-cols-3">
        <div style={{ gridColumn: 'span 2' }}>
          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>פרטי הפרויקט</h3>

            <div className="project-goal-block">
              <div className="field-label"><Target size={12} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />מטרה</div>
              <InlineEdit
                type="textarea"
                value={project.goal}
                onSave={(val) => handleFieldUpdate('goal', val)}
                placeholder="מה הפרויקט הזה אמור להשיג?"
              />
            </div>

            <div className="grid grid-cols-2">
              <Field label="שלב">
                <InlineEdit
                  type="select"
                  value={project.stage}
                  options={[{ value: '', label: 'ללא שלב' }, ...stageOptions.map((s) => ({ value: s.label, label: s.label }))]}
                  onSave={(val) => handleFieldUpdate('stage', val)}
                  renderValue={(val) => {
                    const opt = stageMap[val];
                    if (!opt) return <span className="muted-text">ללא שלב</span>;
                    return <span className="stage-chip" style={{ background: opt.color || 'var(--neutral-bg)' }}>{opt.label}</span>;
                  }}
                />
              </Field>
              <Field label="עדיפות">
                <InlineEdit
                  type="select"
                  value={project.priority}
                  options={PRIORITY_OPTIONS}
                  onSave={(val) => handleFieldUpdate('priority', val)}
                  renderValue={(val) => priorityChip(val)}
                />
              </Field>
              <Field label="אחראי">
                <InlineEdit
                  value={project.owner}
                  onSave={(val) => handleFieldUpdate('owner', val)}
                  placeholder="הוסף אחראי..."
                />
              </Field>
              <Field label="מועד יעד">
                <InlineEdit
                  type="date"
                  value={project.due_date || ''}
                  onSave={(val) => handleFieldUpdate('due_date', val || null)}
                  renderValue={(val) => dueDateChip(val)}
                />
              </Field>
              <Field label={<><Building2 size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />מחלקה מובילה</>}>
                <InlineEdit
                  value={project.leading_department}
                  onSave={(val) => handleFieldUpdate('leading_department', val)}
                  placeholder="הוסף מחלקה..."
                />
              </Field>
              <Field label={<><Calendar size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />שנת פעילות</>}>
                <InlineEdit
                  value={project.activity_year}
                  onSave={(val) => handleFieldUpdate('activity_year', val)}
                  placeholder="2026..."
                />
              </Field>
              <Field label={<><Link2 size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />קישור Drive</>}>
                {project.drive_link ? (
                  <a href={normalizeUrl(project.drive_link)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <ExternalLink size={12} /> פתח קישור
                  </a>
                ) : <span className="muted-text">—</span>}
              </Field>
              <Field label="עודכן לאחרונה">
                {formatDate(project.updated_at)}
              </Field>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div className="field-label"><Tag size={12} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />תגיות פרויקט</div>
              <TagInput
                value={project.labels || []}
                onChange={handleLabelsChange}
              />
            </div>

            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div className="field-label">תיאור</div>
              <InlineEdit
                type="textarea"
                value={project.description}
                onSave={(val) => handleFieldUpdate('description', val)}
                placeholder="הוסף תיאור לפרויקט..."
              />
            </div>
          </div>

          {/* Linked Partners */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={18} color="var(--primary-color)" />
                שותפים מקושרים
                {linkedPartnersDetailed.length > 0 && <span className="drawer-count">{linkedPartnersDetailed.length}</span>}
              </h3>
              <button className="btn btn-outline btn-sm" onClick={() => { setShowPartnerSearch((v) => !v); setPartnerSearch(''); }}>
                <Plus size={14} /> קשר שותף
              </button>
            </div>
            {showPartnerSearch && (
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input className="form-control" placeholder="חיפוש שותף..." value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} autoFocus />
                {partnerSearch && (
                  <div className="tag-autocomplete">
                    {filteredPartners.slice(0, 8).map((p) => (
                      <div key={p.id} className="tag-autocomplete-item" onMouseDown={() => addPartner(p)}>{p.organizationName}</div>
                    ))}
                    {filteredPartners.length === 0 && <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>לא נמצאו תוצאות</div>}
                  </div>
                )}
              </div>
            )}
            {linkedPartnersDetailed.length === 0 ? (
              <div className="drawer-empty-partners">
                <Users size={20} style={{ opacity: 0.35, marginBottom: '4px' }} />
                <div>טרם קושרו שותפים לפרויקט</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {linkedPartnersDetailed.map((lp) => (
                  <div key={lp.partner_id} className="partner-row-card clickable-card-light">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link to={`/partners/${lp.partner_id}`} style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', textDecoration: 'none', display: 'block', marginBottom: lp.contacts.length > 0 ? '6px' : 0 }}>
                        {lp.partner_name}
                      </Link>
                      {lp.contacts.length > 0 ? (
                        <select className="form-control" style={{ fontSize: '0.82rem', padding: '5px 8px' }} value={lp.contact_id || ''} onChange={(e) => setPartnerContact(lp.partner_id, e.target.value)}>
                          <option value="">— בחר איש קשר —</option>
                          {lp.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>)}
                        </select>
                      ) : <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>אין אנשי קשר</span>}
                    </div>
                    <button type="button" className="btn-icon" style={{ color: 'var(--danger-color)', flexShrink: 0 }} onClick={() => removePartner(lp.partner_id)} title="הסר שותף"><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Impact metrics */}
          <div className="card">
            <ProjectMetrics projectId={id} metrics={project.metrics || []} onChange={(updated) => setProject(updated)} />
          </div>

          {/* Tasks */}
          <div className="card">
            <ProjectTasks projectId={id} tasks={project.tasks || []} onChange={(updated) => setProject(updated)} />
          </div>
        </div>

        <div>
          <div className="card">
            <ProjectComments projectId={id} comments={project.comments || []} onChange={(updated) => setProject(updated)} />
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>פעילות</h3>
            <ProjectActivity history={project.change_history || []} />
          </div>
        </div>
      </div>

      <ProjectDrawer
        isOpen={isQuickEditOpen}
        onClose={() => setIsQuickEditOpen(false)}
        onSave={() => { setIsQuickEditOpen(false); fetchProject(); }}
        project={project}
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div style={{ fontWeight: 500, marginBottom: '16px' }}>{children}</div>
    </div>
  );
}

function HeaderActions({ isTemplate, onPrint, onEdit, onSaveAsTemplate, onDelete }) {
  const canWrite = useCan('write');
  const canDelete = useCan('delete');
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button className="btn btn-outline" onClick={onPrint} title="הדפסה / שמור כ-PDF">
        <Printer size={16} /> הדפסה
      </button>
      {canWrite && (
        <>
          <button className="btn btn-outline" onClick={onEdit}>
            <Edit size={16} /> עריכה מהירה
          </button>
          <button className="btn btn-outline" onClick={onSaveAsTemplate} title="שמור את המבנה כתבנית">
            <FileText size={16} /> {isTemplate ? 'בטל תבנית' : 'שמור כתבנית'}
          </button>
        </>
      )}
      {canDelete && (
        <button className="btn btn-outline" style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }} onClick={onDelete}>
          <Trash2 size={16} /> מחיקה
        </button>
      )}
    </div>
  );
}
