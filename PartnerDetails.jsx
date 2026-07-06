/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Edit, Trash2, Send, User, Plus, X, Link, FolderOpen, Wallet } from 'lucide-react';
import confetti from 'canvas-confetti';
import PartnerModal from '../components/PartnerModal';
import MergeModal from '../components/MergeModal';
import InlineEdit from '../components/InlineEdit';
import StatusBadge from '../components/StatusBadge';
import ShareMenu from '../components/ShareMenu';
import { SettingsContext } from '../App';
import { apiJson, formatDate } from '../api';

const LIST_STATE_KEY = 'partnersListState';

const STATUS_OPTIONS = [
  { value: 'active',   label: 'פעיל' },
  { value: 'forming',  label: 'בהתהוות' },
  { value: 'inactive', label: 'לא פעיל' },
  { value: 'archived', label: 'ארכיון' },
];

const LOG_TYPES = [
  { value: 'note',    icon: '📝', label: 'הערה' },
  { value: 'call',    icon: '📞', label: 'שיחה' },
  { value: 'meeting', icon: '🤝', label: 'פגישה' },
  { value: 'email',   icon: '✉️', label: 'מייל' },
];

const logTypeIcon = (type) => (LOG_TYPES.find((l) => l.value === type)?.icon) || '📝';

export default function PartnerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [newLogMsg, setNewLogMsg] = useState('');
  const [newLogType, setNewLogType] = useState('note');
  const [regionOptions, setRegionOptions] = useState([]);
  const [editingContactId, setEditingContactId] = useState(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState(null);
  const [confirmDeleteContactId, setConfirmDeleteContactId] = useState(null);
  const [subPartners, setSubPartners] = useState([]);
  const [linkedProjects, setLinkedProjects] = useState([]);
  const [financeEntries, setFinanceEntries] = useState([]);

  const { settings } = useContext(SettingsContext);
  const priorityEmojiChar = settings?.priorityEmoji || '🔥';

  const fetchPartner = () => {
    setLoading(true);
    setError('');
    apiJson(`/partners/${id}`)
      .then((data) => {
        setPartner(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('לא הצלחתי לטעון את כרטיס השותף. ודא שהשרת המקומי פועל ונסה שוב.');
        setLoading(false);
      });
  };

  const fetchSubPartners = () => {
    apiJson('/partners')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setSubPartners(list.filter((p) => p.parentPartnerId === id));
      })
      .catch(() => setSubPartners([]));
  };

  const fetchLinkedProjects = () => {
    apiJson(`/partners/${id}/projects`)
      .then((data) => setLinkedProjects(Array.isArray(data) ? data : []))
      .catch(() => setLinkedProjects([]));
  };

  const fetchFinance = () => {
    apiJson(`/finance/entries?partnerId=${encodeURIComponent(id)}`)
      .then((data) => setFinanceEntries(Array.isArray(data) ? data : []))
      .catch(() => setFinanceEntries([]));
  };

  useEffect(() => {
    fetchPartner();
    fetchSubPartners();
    fetchLinkedProjects();
    fetchFinance();
    apiJson('/options/partner_region').then((data) => setRegionOptions(Array.isArray(data) ? data : [])).catch(() => setRegionOptions([]));
  }, [id]);

  const navigateBackToList = () => {
    let savedState;
    try {
      savedState = JSON.parse(sessionStorage.getItem(LIST_STATE_KEY) || '{}');
    } catch {
      savedState = {};
    }
    navigate(location.state?.from || savedState.from || '/partners');
  };

  const getPriorityEmoji = (priority) => {
    if (priority === 'high') return priorityEmojiChar.repeat(3);
    if (priority === 'medium') return priorityEmojiChar.repeat(2);
    if (priority === 'low') return priorityEmojiChar;
    return '-';
  };

  const handleFieldUpdate = async (field, value) => {
    const previous = partner;
    const username = localStorage.getItem('username') || 'לא ידוע';
    setPartner((current) => ({ ...current, [field]: value }));
    setNotice('');

    try {
      const updated = await apiJson(`/partners/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value, updatedBy: username }),
      });

      if (field === 'status' && value === 'active' && previous.status !== 'active') {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!reduced) confetti({ particleCount: 120, spread: 70, origin: { x: 0.5, y: 0.5 } });
      }

      setPartner(updated);
      setNotice('השינוי נשמר.');
    } catch (err) {
      console.error(err);
      setPartner(previous);
      setError('השמירה נכשלה. בדוק שהשרת המקומי פועל ונסה שוב.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('האם למחוק את הארגון ואת כל אנשי הקשר שלו?')) return;
    try {
      await apiJson(`/partners/${id}`, { method: 'DELETE' });
      navigateBackToList();
    } catch (err) {
      console.error(err);
      setError('המחיקה נכשלה. נסה שוב.');
    }
  };

  const handleMerge = async (targetId) => {
    const username = localStorage.getItem('username') || 'לא ידוע';
    try {
      const updatedTarget = await apiJson(`/partners/${id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetId, updatedBy: username }),
      });
      setIsMergeModalOpen(false);
      navigate(`/partners/${updatedTarget.id}`, { replace: true, state: location.state });
    } catch (err) {
      console.error(err);
      setError('המיזוג נכשל. נסה שוב.');
    }
  };

  const handleAddLog = async (event) => {
    event.preventDefault();
    const message = newLogMsg.trim();
    if (!message) return;

    const currentUser = localStorage.getItem('username') || 'לא ידוע';
    try {
      await apiJson(`/partners/${id}/logs`, {
        method: 'POST',
        body: JSON.stringify({ message, type: newLogType, updaterName: currentUser }),
      });
      setNewLogMsg('');
      setNotice('העדכון נוסף ליומן.');
      fetchPartner();
    } catch (err) {
      console.error(err);
      setError('לא הצלחתי להוסיף את העדכון ליומן.');
    }
  };

  const startEditContact = (contact) => {
    setIsAddingContact(false);
    setConfirmDeleteContactId(null);
    setEditingContactId(contact.id);
    setContactDraft({
      id: contact.id,
      name: contact.name || '',
      role: contact.role || '',
      phone: contact.phone || '',
      email: contact.email || '',
      dataSource: contact.dataSource || '',
    });
  };

  const startAddContact = () => {
    setEditingContactId(null);
    setConfirmDeleteContactId(null);
    setIsAddingContact(true);
    setContactDraft({
      id: `new-${Date.now()}`,
      name: '',
      role: '',
      phone: '',
      email: '',
      dataSource: 'ידני',
    });
  };

  const cancelContactEdit = () => {
    setEditingContactId(null);
    setIsAddingContact(false);
    setContactDraft(null);
  };

  const saveContactDraft = async () => {
    if (!contactDraft) return;
    const draft = {
      ...contactDraft,
      name: (contactDraft.name || '').trim(),
      role: (contactDraft.role || '').trim(),
      phone: (contactDraft.phone || '').trim(),
      email: (contactDraft.email || '').trim(),
      dataSource: (contactDraft.dataSource || '').trim(),
    };
    if (!draft.name) {
      setError('שם איש הקשר הוא שדה חובה.');
      return;
    }
    setError('');
    const username = localStorage.getItem('username') || 'לא ידוע';
    const existing = Array.isArray(partner.contacts) ? partner.contacts : [];
    let nextContacts;
    if (isAddingContact) {
      nextContacts = [...existing, draft];
    } else {
      nextContacts = existing.map((contact) => contact.id === editingContactId ? { ...contact, ...draft } : contact);
    }
    try {
      const updated = await apiJson(`/partners/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ contacts: nextContacts, updatedBy: username }),
      });
      setPartner(updated);
      setNotice(isAddingContact ? 'איש הקשר נוסף.' : 'איש הקשר עודכן.');
      cancelContactEdit();
    } catch (err) {
      console.error(err);
      setError(err.message || 'שמירת איש הקשר נכשלה.');
    }
  };

  const deleteContact = async (contactId) => {
    const username = localStorage.getItem('username') || 'לא ידוע';
    const existing = Array.isArray(partner.contacts) ? partner.contacts : [];
    const nextContacts = existing.filter((contact) => contact.id !== contactId);
    try {
      const updated = await apiJson(`/partners/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ contacts: nextContacts, updatedBy: username }),
      });
      setPartner(updated);
      setNotice('איש הקשר נמחק.');
      setConfirmDeleteContactId(null);
    } catch (err) {
      console.error(err);
      setError(err.message || 'מחיקת איש הקשר נכשלה.');
    }
  };

  if (loading) return <div className="empty-state">טוען כרטיס שותף...</div>;
  if (error && !partner) return <div className="notice notice-error">{error}</div>;
  if (!partner) return <div className="empty-state">שותף לא נמצא.</div>;

  const tags = Array.isArray(partner.tags) ? partner.tags : [];

  return (
    <div>
      <div className="header-flex">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button onClick={navigateBackToList} title="חזרה לרשימה" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowRight size={24} color="var(--text-secondary)" />
          </button>

          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <InlineEdit value={partner.organizationName} onSave={(val) => handleFieldUpdate('organizationName', val)} />
          </h2>

          <InlineEdit
            type="select"
            value={partner.status}
            options={STATUS_OPTIONS}
            onSave={(val) => handleFieldUpdate('status', val)}
            renderValue={(val) => <StatusBadge status={val} />}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => setIsMergeModalOpen(true)}>מיזוג</button>
          <button className="btn btn-outline" onClick={() => setIsEditModalOpen(true)}>
            <Edit size={18} />
            עריכה מלאה
          </button>
          <button className="btn btn-outline" style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }} onClick={handleDelete}>
            <Trash2 size={18} />
            מחיקה
          </button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-success">{notice}</div>}

      <div className="grid grid-cols-3">
        <div style={{ gridColumn: 'span 2' }}>
          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>פרטי הארגון</h3>

            {/* Tags */}
            {tags.length > 0 && (
              <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tags.map((tag) => (
                  <span
                    key={tag.id || tag.label}
                    className="tag-chip"
                    style={{ background: tag.color || 'var(--accent-mint)', fontSize: '0.8rem', padding: '3px 10px' }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2">
              <Field label="תחום עיסוק">
                <InlineEdit value={partner.domain} onSave={(val) => handleFieldUpdate('domain', val)} placeholder="הוסף תחום עיסוק..." />
              </Field>
              <Field label="אחראי קשר מצדנו">
                <InlineEdit value={partner.pic} onSave={(val) => handleFieldUpdate('pic', val)} placeholder="הוסף אחראי קשר..." />
              </Field>
              <Field label="סוג שותף">
                <span className="badge" style={{ background: 'var(--neutral-bg)', color: 'var(--text-primary)' }}>
                  {partner.partnerType || '—'}
                </span>
              </Field>
              <Field label="קטגוריית שותף">
                <span className="badge" style={{ background: 'var(--neutral-bg)', color: 'var(--text-primary)' }}>
                  {partner.partnerCategory || '—'}
                </span>
              </Field>
              <Field label="עדיפות">
                <InlineEdit
                  type="select"
                  value={partner.priority}
                  options={[
                    { value: '',       label: 'לא נבחר' },
                    { value: 'high',   label: `גבוה ${priorityEmojiChar.repeat(3)}` },
                    { value: 'medium', label: `בינוני ${priorityEmojiChar.repeat(2)}` },
                    { value: 'low',    label: `נמוך ${priorityEmojiChar}` },
                  ]}
                  onSave={(val) => handleFieldUpdate('priority', val)}
                  renderValue={(val) => {
                    if (!val) return <span className="priority-chip priority-chip-empty">לא נבחר</span>;
                    const titles = { high: 'עדיפות גבוהה', medium: 'עדיפות בינונית', low: 'עדיפות נמוכה' };
                    return <span className="priority-chip" title={titles[val]}>{getPriorityEmoji(val)}</span>;
                  }}
                />
              </Field>
              <Field label="אזור">
                <InlineEdit
                  type="select"
                  value={partner.region || ''}
                  options={[{ value: '', label: 'לא מוגדר' }, ...regionOptions.map((o) => ({ value: o.label, label: o.label }))]}
                  onSave={(val) => handleFieldUpdate('region', val)}
                  placeholder="הוסף אזור..."
                />
              </Field>
              <Field label="תחילת שיתוף פעולה">
                <InlineEdit
                  type="date"
                  value={partner.collaborationStartDate || ''}
                  onSave={(val) => handleFieldUpdate('collaborationStartDate', val || '')}
                  renderValue={(val) => val ? formatDate(val) : <span style={{ color: 'var(--text-secondary)' }}>לא הוגדר</span>}
                />
              </Field>
              <Field label="מקור הנתונים">
                {(partner.sourceFiles || []).join(', ') || '—'}
              </Field>
              {partner.parentPartnerId && (
                <Field label="שותף אב">
                  <button
                    type="button"
                    className="btn-link"
                    style={{ color: 'var(--primary-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => navigate(`/partners/${partner.parentPartnerId}`)}
                  >
                    <Link size={14} />
                    {partner.parentPartnerName || partner.parentPartnerId}
                  </button>
                </Field>
              )}
              <Field label="עודכן לאחרונה">
                {formatDate(partner.lastModifiedAt || partner.lastUpdated)}
                {(partner.lastModifiedBy || partner.lastUpdatedBy) && (
                  <span className="muted-text" style={{ marginRight: '6px' }}>
                    ע"י {partner.lastModifiedBy || partner.lastUpdatedBy}
                  </span>
                )}
              </Field>
            </div>

            <TextBlock label="הצעה / תיאור החבילה">
              <InlineEdit type="textarea" value={partner.packageDescription} onSave={(val) => handleFieldUpdate('packageDescription', val)} placeholder="הוסף תיאור..." />
            </TextBlock>
            <TextBlock label="הערות כלליות">
              <InlineEdit type="textarea" value={partner.generalNotes} onSave={(val) => handleFieldUpdate('generalNotes', val)} placeholder="הוסף הערות..." />
            </TextBlock>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FolderOpen size={18} color="var(--primary-color)" />
              פרויקטים ({linkedProjects.length})
            </h3>
            {linkedProjects.length === 0 ? (
              <div className="muted-text">השותף עדיין לא משויך לפרויקט</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {linkedProjects.map((proj) => {
                  const contact = (partner.contacts || []).find((c) => c.id === proj.linked_contact_id);
                  return (
                    <div
                      key={proj.id}
                      className="partner-row-card clickable-card-light"
                      onClick={() => navigate(`/projects/${proj.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '4px' }}>{proj.title}</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {proj.stage && <span className="stage-chip">{proj.stage}</span>}
                          {proj.owner && <span>אחראי: {proj.owner}</span>}
                          {proj.due_date && <span>יעד: {formatDate(proj.due_date)}</span>}
                          {contact && <span>איש קשר: {contact.name}</span>}
                        </div>
                      </div>
                      <StatusBadge status={proj.status === 'archived' ? 'archived' : 'active'} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {false && (() => {
            const sum = (arr) => arr.reduce((a, e) => a + Number(e.amount || 0), 0);
            const actuals = financeEntries.filter((e) => e.kind === 'actual');
            const pledges = financeEntries.filter((e) => e.kind === 'pledge');
            const received = sum(actuals.filter((e) => e.direction === 'incoming' && e.status === 'paid'));
            const sent     = sum(actuals.filter((e) => e.direction === 'outgoing' && e.status === 'paid'));
            const pledgedIn = sum(pledges.filter((e) => e.direction === 'incoming' && e.status !== 'cancelled' && e.status !== 'paid'));
            const fmtMoney = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
            const fmtDate = (d) => d ? new Date(d).toLocaleDateString('he-IL') : '—';
            const upcoming = pledges.filter((e) => e.status !== 'cancelled' && e.status !== 'paid').slice(0, 4);
            return (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <Wallet size={18} color="var(--brand-magenta)" />
                    כספים ({financeEntries.length})
                  </h3>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate('/finance')}>פתח לוח כספים</button>
                </div>
                {financeEntries.length === 0 ? (
                  <div className="muted-text">טרם נרשמו תנועות כספיות מול השותף</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                      <div style={{ padding: 10, background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--success-color)' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--success-text)' }}>התקבל</div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--success-text)' }}>{fmtMoney(received)}</div>
                      </div>
                      <div style={{ padding: 10, background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger-color)' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--danger-text)' }}>שולם</div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--danger-text)' }}>{fmtMoney(sent)}</div>
                      </div>
                      <div style={{ padding: 10, background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning-color)' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--warning-text)' }}>צפוי להיכנס</div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--warning-text)' }}>{fmtMoney(pledgedIn)}</div>
                      </div>
                    </div>
                    {upcoming.length > 0 && (
                      <>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>התחייבויות פתוחות</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {upcoming.map((e) => (
                            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: 'var(--radius-md)' }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{e.description || e.category || (e.direction === 'incoming' ? 'התחייבות נכנסת' : 'התחייבות יוצאת')}</div>
                                <div style={{ fontSize: '0.76rem', color: e.status === 'overdue' ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                                  יעד {fmtDate(e.dueOn)} {e.status === 'overdue' && '· באיחור'}
                                </div>
                              </div>
                              <div style={{ fontWeight: 800, color: e.direction === 'incoming' ? 'var(--success-text)' : 'var(--danger-text)' }}>
                                {e.direction === 'incoming' ? '+' : '−'}{fmtMoney(e.amount)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {subPartners.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: '12px' }}>תת-שותפים ({subPartners.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {subPartners.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    className="btn btn-outline"
                    style={{ textAlign: 'right', justifyContent: 'flex-start', gap: '8px' }}
                    onClick={() => navigate(`/partners/${sp.id}`)}
                  >
                    <StatusBadge status={sp.status} />
                    {sp.organizationName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>אנשי קשר ({partner.contacts?.length || 0})</h3>
            <div className="grid grid-cols-2">
              {(partner.contacts || []).map((contact) => {
                const isEditing = editingContactId === contact.id && contactDraft;
                if (isEditing) {
                  return (
                    <ContactInlineForm
                      key={contact.id}
                      draft={contactDraft}
                      setDraft={setContactDraft}
                      onSave={saveContactDraft}
                      onCancel={cancelContactEdit}
                    />
                  );
                }
                return (
                  <div key={contact.id} className="contact-card" data-testid="contact-card">
                    <div className="contact-avatar"><User size={20} color="var(--primary-color)" /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {contact.name || 'ללא שם'}
                        {contact.isPrimary && <span title="איש קשר ראשי" style={{ color: 'var(--warning-color)' }}>★</span>}
                      </div>
                      <div className="muted-text">{contact.role || 'תפקיד לא מוגדר'}</div>
                      {contact.dataSource && (
                        <div className="contact-source-tag" data-testid="contact-source">
                          📂 מקור: {contact.dataSource}
                        </div>
                      )}
                      {contact.phone && <div>{contact.phone}</div>}
                      {contact.email && <div style={{ wordBreak: 'break-all' }}>{contact.email}</div>}

                      {confirmDeleteContactId === contact.id ? (
                        <div className="contact-confirm-delete" data-testid="contact-delete-confirm">
                          <span>האם למחוק את {contact.name || 'איש הקשר'}?</span>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmDeleteContactId(null)}>ביטול</button>
                          <button type="button" className="btn btn-primary btn-sm" style={{ background: 'var(--danger-color)' }} onClick={() => deleteContact(contact.id)} data-testid="contact-delete-confirm-yes">מחק</button>
                        </div>
                      ) : (
                        <div className="contact-actions">
                          <button type="button" className="btn-icon" title="ערוך" aria-label="ערוך איש קשר" onClick={() => startEditContact(contact)} data-testid="contact-edit-btn">
                            <Edit size={14} /> ערוך
                          </button>
                          <ShareMenu contact={contact} organizationName={partner.organizationName} />
                          <button type="button" className="btn-icon contact-delete-btn" title="מחק" aria-label="מחק איש קשר" onClick={() => setConfirmDeleteContactId(contact.id)} data-testid="contact-delete-btn">
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isAddingContact && contactDraft && (
                <ContactInlineForm
                  draft={contactDraft}
                  setDraft={setContactDraft}
                  onSave={saveContactDraft}
                  onCancel={cancelContactEdit}
                />
              )}
              {(!partner.contacts || partner.contacts.length === 0) && !isAddingContact && (
                <div className="muted-text">לא נמצאו אנשי קשר.</div>
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              {!isAddingContact && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={startAddContact}
                  data-testid="add-contact-btn"
                >
                  <Plus size={16} /> הוסף איש קשר +
                </button>
              )}
            </div>
          </div>

          <LastModifiedLine partner={partner} />
        </div>

        <div>
          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>יומן תקשורת</h3>
            <form onSubmit={handleAddLog} style={{ marginBottom: '24px', background: 'var(--neutral-bg)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {LOG_TYPES.map((lt) => (
                  <button
                    key={lt.value}
                    type="button"
                    onClick={() => setNewLogType(lt.value)}
                    className={`log-type-btn ${newLogType === lt.value ? 'active' : ''}`}
                    title={lt.label}
                  >
                    {lt.icon} {lt.label}
                  </button>
                ))}
              </div>
              <div className="form-group" style={{ position: 'relative', marginBottom: 0 }}>
                <textarea className="form-control" rows="2" placeholder="הוסף עדכון שיחה..." value={newLogMsg} onChange={(event) => setNewLogMsg(event.target.value)} required style={{ paddingRight: '40px' }} />
                <button type="submit" className="round-submit"><Send size={16} /></button>
              </div>
            </form>

            <div className="timeline">
              {(partner.communicationLog || []).slice().reverse().map((log) => (
                <div key={log.id} className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <div className="timeline-meta">
                      <strong>{logTypeIcon(log.type)} {log.updaterName}</strong>
                      <span>{new Date(log.date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <div>{log.message}</div>
                  </div>
                </div>
              ))}
              {(!partner.communicationLog || partner.communicationLog.length === 0) && <div className="muted-text">אין תיעוד שיחות.</div>}
            </div>
          </div>
        </div>
      </div>

      <PartnerModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSave={() => { setIsEditModalOpen(false); fetchPartner(); }} partner={partner} />
      <MergeModal isOpen={isMergeModalOpen} onClose={() => setIsMergeModalOpen(false)} onMerge={handleMerge} currentPartnerId={partner.id} currentPartnerName={partner.organizationName} />
    </div>
  );
}

function ContactInlineForm({ draft, setDraft, onSave, onCancel }) {
  const update = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const handleKey = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSave();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <div className="contact-inline-form" data-testid="contact-inline-form" onKeyDown={handleKey}>
      <div className="form-group">
        <label>שם מלא *</label>
        <input className="form-control" value={draft.name} onChange={update('name')} autoFocus data-testid="contact-input-name" />
      </div>
      <div className="form-group">
        <label>תפקיד</label>
        <input className="form-control" value={draft.role} onChange={update('role')} data-testid="contact-input-role" />
      </div>
      <div className="form-group">
        <label>טלפון</label>
        <input className="form-control" value={draft.phone} onChange={update('phone')} data-testid="contact-input-phone" />
      </div>
      <div className="form-group">
        <label>אימייל</label>
        <input className="form-control" type="email" value={draft.email} onChange={update('email')} data-testid="contact-input-email" />
      </div>
      <div className="form-group">
        <label>מקור הנתונים</label>
        <input className="form-control" value={draft.dataSource} onChange={update('dataSource')} placeholder="ידני" data-testid="contact-input-source" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} data-testid="contact-cancel-btn">ביטול</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave} data-testid="contact-save-btn">שמור</button>
      </div>
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

function TextBlock({ label, children }) {
  return (
    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

function formatHM(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function LastModifiedLine({ partner }) {
  const at = partner.lastModifiedAt || partner.lastUpdated;
  const by = partner.lastModifiedBy || partner.lastUpdatedBy;
  const history = Array.isArray(partner.changeHistory) ? partner.changeHistory : [];
  const lastThree = history.slice(-3).reverse();

  if (!at && !by) {
    return (
      <div className="last-modified-line" data-testid="last-modified-line">
        טרם בוצע עדכון מתועד
      </div>
    );
  }

  return (
    <div className="last-modified-line" data-testid="last-modified-line">
      עודכן לאחרונה: {formatDate(at)} בשעה {formatHM(at)} · על ידי: {by || 'לא ידוע'}
      {lastThree.length > 0 && (
        <div className="history-tooltip" data-testid="history-tooltip">
          {lastThree.map((entry) => (
            <div key={entry.id || `${entry.at}-${entry.action}`}>
              {(entry.byDisplay || entry.by || 'לא ידוע')} {entry.summary || entry.action} / {formatDate(entry.at)} / {formatHM(entry.at)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
