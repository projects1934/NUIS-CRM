/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { X, Trash2, Users, Building2, Link2, Calendar, Paperclip, Plus, ExternalLink, Flag, User as UserIcon, Clock } from 'lucide-react';
import { apiJson, normalizeUrl } from './api';

export default function ProjectModal({ isOpen, onClose, onSave, project = null }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [leadingDept, setLeadingDept] = useState('');
  const [activityYear, setActivityYear] = useState('');
  const [driveLink, setDriveLink] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [goal, setGoal] = useState('');
  const [stage, setStage] = useState('');
  const [priority, setPriority] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [stageOptions, setStageOptions] = useState([]);
  const [newAttachName, setNewAttachName] = useState('');
  const [newAttachUrl, setNewAttachUrl] = useState('');
  const [showAttachForm, setShowAttachForm] = useState(false);
  const [linkedPartners, setLinkedPartners] = useState([]);
  const [originalPartners, setOriginalPartners] = useState([]);
  const [allPartners, setAllPartners] = useState([]);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerSearch, setShowPartnerSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSaving(false);
    setPartnerSearch('');
    setShowPartnerSearch(false);
    setShowAttachForm(false);

    apiJson('/options/project_stage').then((data) => setStageOptions(Array.isArray(data) ? data : [])).catch(() => setStageOptions([]));

    apiJson('/partners')
      .then((partners) => {
        const list = Array.isArray(partners) ? partners : [];
        setAllPartners(list);
        if (project) {
          setTitle(project.title || '');
          setDescription(project.description || '');
          setLeadingDept(project.leading_department || '');
          setActivityYear(project.activity_year || '');
          setDriveLink(project.drive_link || '');
          setAttachments(Array.isArray(project.attachments) ? project.attachments : []);
          setGoal(project.goal || '');
          setStage(project.stage || '');
          setPriority(project.priority || '');
          setOwner(project.owner || '');
          setDueDate(project.due_date || '');
          apiJson(`/projects/${project.id}`)
            .then((detail) => {
              const linked = (detail.partners || []).map((p) => {
                const ap = list.find((x) => x.id === p.partner_id);
                return { partner_id: p.partner_id, partner_name: ap?.organizationName || '(שותף לא ידוע)', contact_id: p.contact_id || null };
              });
              setLinkedPartners(linked);
              setOriginalPartners(JSON.parse(JSON.stringify(linked)));
            })
            .catch(() => { setLinkedPartners([]); setOriginalPartners([]); });
        } else {
          setTitle(''); setDescription(''); setLeadingDept('');
          setActivityYear(''); setDriveLink(''); setAttachments([]);
          setGoal('');
          setStage(''); setPriority(''); setOwner(''); setDueDate('');
          setLinkedPartners([]); setOriginalPartners([]);
        }
      })
      .catch(() => {});
  }, [isOpen, project?.id]);

  if (!isOpen) return null;

  const addPartner = (partner) => {
    if (linkedPartners.some((lp) => lp.partner_id === partner.id)) return;
    setLinkedPartners((prev) => [...prev, { partner_id: partner.id, partner_name: partner.organizationName, contact_id: null }]);
    setPartnerSearch('');
    setShowPartnerSearch(false);
  };

  const removePartner = (partnerId) => setLinkedPartners((prev) => prev.filter((lp) => lp.partner_id !== partnerId));

  const setContactForPartner = (partnerId, contactId) =>
    setLinkedPartners((prev) => prev.map((lp) => lp.partner_id === partnerId ? { ...lp, contact_id: contactId || null } : lp));

  const getPartnerContacts = (partnerId) => allPartners.find((p) => p.id === partnerId)?.contacts || [];

  const filteredPartners = allPartners.filter(
    (p) => p.organizationName.toLowerCase().includes(partnerSearch.toLowerCase()) &&
      !linkedPartners.some((lp) => lp.partner_id === p.id)
  );

  const addAttachment = () => {
    if (!newAttachName.trim() || !newAttachUrl.trim()) return;
    setAttachments((prev) => [...prev, { name: newAttachName.trim(), url: normalizeUrl(newAttachUrl) }]);
    setNewAttachName(''); setNewAttachUrl(''); setShowAttachForm(false);
  };

  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!title.trim()) { setError('חובה להזין כותרת לפרויקט'); return; }
    setSaving(true); setError('');
    try {
      let saved;
      const normalizedDrive = driveLink ? normalizeUrl(driveLink) : null;
      const normalizedAttachments = attachments.map((a) => ({ ...a, url: normalizeUrl(a.url) }));
      const body = {
        title: title.trim(),
        description,
        goal: goal || '',
        leading_department: leadingDept,
        activity_year: activityYear || null,
        drive_link: normalizedDrive,
        attachments: normalizedAttachments,
        stage: stage || '',
        priority: priority || '',
        owner: owner || '',
        due_date: dueDate || null,
      };
      if (project) {
        saved = await apiJson(`/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(body) });
        const origIds = new Set(originalPartners.map((p) => p.partner_id));
        const currIds = new Set(linkedPartners.map((p) => p.partner_id));
        for (const op of originalPartners) {
          if (!currIds.has(op.partner_id))
            await apiJson(`/projects/${project.id}/partners/${op.partner_id}`, { method: 'DELETE' }).catch(() => {});
        }
        for (const lp of linkedPartners) {
          if (!origIds.has(lp.partner_id)) {
            await apiJson(`/projects/${project.id}/partners`, { method: 'POST', body: JSON.stringify({ partnerId: lp.partner_id, contactId: lp.contact_id }) }).catch(() => {});
          } else {
            const orig = originalPartners.find((op) => op.partner_id === lp.partner_id);
            if (orig && orig.contact_id !== lp.contact_id) {
              await apiJson(`/projects/${project.id}/partners/${lp.partner_id}`, { method: 'DELETE' }).catch(() => {});
              await apiJson(`/projects/${project.id}/partners`, { method: 'POST', body: JSON.stringify({ partnerId: lp.partner_id, contactId: lp.contact_id }) }).catch(() => {});
            }
          }
        }
      } else {
        saved = await apiJson('/projects', { method: 'POST', body: JSON.stringify(body) });
        for (const lp of linkedPartners)
          await apiJson(`/projects/${saved.id}/partners`, { method: 'POST', body: JSON.stringify({ partnerId: lp.partner_id, contactId: lp.contact_id }) }).catch(() => {});
      }
      onSave(saved);
    } catch (err) {
      setError(err.message || 'שמירה נכשלה');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {project ? 'עריכת פרויקט' : 'פרויקט חדש'}
          </h2>
          <button onClick={onClose} className="btn-icon" aria-label="סגור"><X size={22} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {error && <div className="notice notice-error" style={{ marginBottom: '16px' }}>{error}</div>}

          {/* Section: Details */}
          <div style={{ marginBottom: '24px' }}>
            <div className="drawer-section-title" style={{ marginBottom: '14px' }}>פרטי פרויקט</div>
            <div className="form-group">
              <label>כותרת הפרויקט *</label>
              <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="הזן כותרת..." />
            </div>
            <div className="project-drawer-grid-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label><Building2 size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />מחלקה מובילה</label>
                <input className="form-control" value={leadingDept} onChange={(e) => setLeadingDept(e.target.value)} placeholder="מחלקת שיווק..." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label><Calendar size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />שנת פעילות</label>
                <input className="form-control" type="number" min="2000" max="2100" value={activityYear} onChange={(e) => setActivityYear(e.target.value)} placeholder="2024" />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>מטרה</label>
            <textarea className="form-control" rows="2" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="מה הפרויקט אמור להשיג?" />
          </div>

          <div className="form-group">
            <label>תיאור</label>
            <textarea className="form-control" rows="3" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור קצר..." />
          </div>

          <div className="project-drawer-grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label><Flag size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />שלב</label>
              <select className="form-control" value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">ללא שלב</option>
                {stageOptions.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>עדיפות</label>
              <select className="form-control" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">לא נבחר</option>
                <option value="high">גבוה</option>
                <option value="medium">בינוני</option>
                <option value="low">נמוך</option>
              </select>
            </div>
          </div>

          <div className="project-drawer-grid-2" style={{ marginTop: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label><UserIcon size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />אחראי</label>
              <input className="form-control" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="שם האחראי..." />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label><Clock size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />מועד יעד</label>
              <input className="form-control" type="date" value={dueDate || ''} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div style={{ height: '16px' }} />

          {/* Drive link */}
          <div className="form-group">
            <label><Link2 size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />קישור Drive / תיקייה</label>
            <input className="form-control" type="url" value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." />
            {driveLink.trim() && (
              <a
                href={normalizeUrl(driveLink)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--primary-color)', marginTop: '6px', textDecoration: 'none' }}
              >
                <ExternalLink size={12} /> פתח קישור
              </a>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              ללא https:// נוסיף אוטומטית
            </div>
          </div>

          {/* Attachments */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div className="drawer-section-title" style={{ margin: 0 }}>
                <Paperclip size={14} /> קבצים וקישורים
                {attachments.length > 0 && <span className="drawer-count">{attachments.length}</span>}
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowAttachForm((v) => !v)}>
                <Plus size={14} /> הוסף קישור
              </button>
            </div>
            {showAttachForm && (
              <div className="project-drawer-attach-form">
                <input className="form-control" placeholder="שם הקובץ..." value={newAttachName} onChange={(e) => setNewAttachName(e.target.value)} />
                <input className="form-control" placeholder="URL..." type="url" value={newAttachUrl} onChange={(e) => setNewAttachUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAttachment()} />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '8px 12px' }}
                  onClick={addAttachment}
                  disabled={!newAttachName.trim() || !newAttachUrl.trim()}
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {attachments.map((att, idx) => (
                  <div key={idx} className="project-drawer-attach-row">
                    <Link2 size={14} color="var(--primary-color)" />
                    <a href={normalizeUrl(att.url)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: 'var(--primary-color)', fontSize: '0.9rem', textDecoration: 'none' }}>
                      {att.name}
                    </a>
                    <button type="button" className="btn-icon" style={{ color: 'var(--danger-color)' }} onClick={() => removeAttachment(idx)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            {attachments.length === 0 && !showAttachForm && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>אין קישורים מצורפים</div>
            )}
          </div>

          {/* Partners */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div className="drawer-section-title" style={{ margin: 0 }}>
                <Users size={14} /> שותפים מקושרים
                {linkedPartners.length > 0 && <span className="drawer-count">{linkedPartners.length}</span>}
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setShowPartnerSearch((v) => !v); setPartnerSearch(''); }}>
                + קשר שותף
              </button>
            </div>

            {showPartnerSearch && (
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input className="form-control" type="text" placeholder="חיפוש שותף..." value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} autoFocus />
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

            {linkedPartners.length === 0 ? (
              <div className="drawer-empty-partners">
                <Users size={20} style={{ opacity: 0.35, marginBottom: '4px' }} />
                <div>טרם קושרו שותפים לפרויקט</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {linkedPartners.map((lp) => {
                  const contacts = getPartnerContacts(lp.partner_id);
                  return (
                    <div key={lp.partner_id} className="partner-row-card">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: contacts.length > 0 ? '6px' : 0 }}>{lp.partner_name}</div>
                        {contacts.length > 0 && (
                          <select className="form-control" style={{ fontSize: '0.82rem', padding: '5px 8px' }} value={lp.contact_id || ''} onChange={(e) => setContactForPartner(lp.partner_id, e.target.value)}>
                            <option value="">— בחר איש קשר —</option>
                            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>)}
                          </select>
                        )}
                        {contacts.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>אין אנשי קשר</span>}
                      </div>
                      <button type="button" className="btn-icon" style={{ color: 'var(--danger-color)', flexShrink: 0 }} onClick={() => removePartner(lp.partner_id)} title="הסר שותף"><Trash2 size={16} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'שומר...' : project ? 'שמור שינויים' : 'צור פרויקט'}
          </button>
        </div>
      </div>
    </div>
  );
}
