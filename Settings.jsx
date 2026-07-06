/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useContext, useState, useEffect } from 'react';
import { SettingsContext } from './App';
import { Palette, Smile, Tag, Building2, Layers, Trash2, Plus, Users, Shield, Eye, EyeOff, FileText, Copy } from 'lucide-react';
import { useNavigate as useNav } from 'react-router-dom';
import { apiJson } from './api';
import { showToast } from './Toast';
import { useRole } from './UserContext.jsx';

const COLORS = [
  { name: 'כחול עמוק',    value: '#1a56db' },
  { name: 'ירוק יער',     value: '#057a55' },
  { name: 'אדום-כרמין',   value: '#c81e1e' },
  { name: 'אינדיגו',      value: '#5521b5' },
  { name: 'כתום',         value: '#b45309' },
  { name: 'ים-תיכוני',    value: '#0694a2' },
  { name: 'אפור כהה',     value: '#374151' },
];

const EMOJIS = ['🔥', '⭐', '🚀', '💎', '⚡', '🏆', '🎯', '✨', '🟢'];

export default function Settings() {
  const { settings, updateSettings } = useContext(SettingsContext);
  const [economicBg, setEconomicBg] = useState(settings.economicBg);
  const [socialBg, setSocialBg] = useState(settings.socialBg);
  const [priorityEmoji, setPriorityEmoji] = useState(settings.priorityEmoji);
  const [orgName, setOrgName] = useState(settings.orgName || '');
  const [orgTagline, setOrgTagline] = useState(settings.orgTagline || '');
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState('appearance');

  useEffect(() => {
    setEconomicBg(settings.economicBg);
    setSocialBg(settings.socialBg);
    setPriorityEmoji(settings.priorityEmoji);
    setOrgName(settings.orgName || '');
    setOrgTagline(settings.orgTagline || '');
  }, [settings]);

  const handleSave = () => {
    updateSettings({ economicBg, socialBg, priorityEmoji, orgName, orgTagline });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const role = useRole();
  const sections = [
    { id: 'appearance', label: 'מראה', icon: <Palette size={16} /> },
    { id: 'org', label: 'פרטי ארגון', icon: <Building2 size={16} /> },
    ...(role === 'admin' ? [{ id: 'users', label: 'משתמשים', icon: <Users size={16} /> }] : []),
    { id: 'templates', label: 'תבניות פרויקט', icon: <FileText size={16} /> },
    { id: 'categories', label: 'קטגוריות', icon: <Layers size={16} /> },
    { id: 'tags', label: 'תגיות', icon: <Tag size={16} /> },
  ];

  return (
    <div>
      <div className="header-flex" style={{ marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '4px' }}>הגדרות</h2>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>נהל את הגדרות המערכת</div>
        </div>
      </div>

      {saved && <div className="notice notice-success" style={{ marginBottom: '20px' }}>ההגדרות נשמרו בהצלחה.</div>}

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Sidebar nav */}
        <div style={{ width: '200px', flexShrink: 0 }}>
          <div style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                  borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.9rem', fontWeight: 500, transition: 'all 0.15s', textAlign: 'right', width: '100%',
                  background: activeSection === s.id ? 'var(--primary-color)' : 'transparent',
                  color: activeSection === s.id ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {activeSection === 'appearance' && (
            <div>
              <div className="card" style={{ marginBottom: '20px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '1rem' }}>
                  <Palette size={18} color="var(--primary-color)" /> צבעי שורות
                </h3>
                <ColorPicker label="צבע עבור סוג כלכלי" value={economicBg} onChange={setEconomicBg} />
                <ColorPicker label="צבע עבור סוג חברתי" value={socialBg} onChange={setSocialBg} />
              </div>
              <div className="card" style={{ marginBottom: '20px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '1rem' }}>
                  <Smile size={18} color="var(--primary-color)" /> אימוג׳י עדיפות
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  {EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => setPriorityEmoji(emoji)}
                      className={`emoji-choice ${priorityEmoji === emoji ? 'active' : ''}`} aria-label={`בחר ${emoji}`}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}>
                  גבוה: {priorityEmoji.repeat(3)} · בינוני: {priorityEmoji.repeat(2)} · נמוך: {priorityEmoji}
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleSave}>שמור הגדרות</button>
            </div>
          )}

          {activeSection === 'org' && (
            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '1rem' }}>
                <Building2 size={18} color="var(--primary-color)" /> פרטי הארגון
              </h3>
              <div className="form-group">
                <label>שם הארגון</label>
                <input className="form-control" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="הזן שם ארגון..." />
              </div>
              <div className="form-group">
                <label>תיאור / תגית</label>
                <input className="form-control" value={orgTagline} onChange={(e) => setOrgTagline(e.target.value)} placeholder="תיאור קצר של הארגון..." />
              </div>
              <button className="btn btn-primary" onClick={handleSave}>שמור</button>
            </div>
          )}

          {activeSection === 'users' && <UsersManager />}

          {activeSection === 'templates' && <TemplatesManager />}

          {activeSection === 'categories' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <OptionsManager title="סוגי שותף" icon={<Building2 size={18} color="var(--primary-color)" />} optionType="partner_type" placeholder="למשל: שותף כלכלי" />
              <OptionsManager title="קטגוריות שותף" icon={<Layers size={18} color="var(--primary-color)" />} optionType="partner_category" placeholder='למשל: תרומה, נדל"ן' />
              <OptionsManager title="אזורים גיאוגרפיים" icon={<Layers size={18} color="var(--primary-color)" />} optionType="partner_region" placeholder="למשל: מרכז, ירושלים, צפון" />
              <OptionsManager title="שלבי פרויקט" icon={<Layers size={18} color="var(--primary-color)" />} optionType="project_stage" placeholder="למשל: בעבודה, לקראת סיום" />
              <OptionsManager title="תגיות פרויקט" icon={<Layers size={18} color="var(--primary-color)" />} optionType="project_label" placeholder="למשל: דחוף, אסטרטגי" />
            </div>
          )}

          {activeSection === 'tags' && (
            <div className="card">
              <TagsManager />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UsersManager() {
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const currentUser = localStorage.getItem('username') || '';

  const fetch = () => apiJson('/users').then(setUsers).catch(() => {});
  useEffect(() => { fetch(); }, []);

  const add = async () => {
    if (!newUsername.trim() || !newPin.trim()) { showToast('חובה למלא שם משתמש ו-PIN', 'error'); return; }
    try {
      await apiJson('/users', { method: 'POST', body: JSON.stringify({ username: newUsername.trim(), displayName: newDisplay.trim() || newUsername.trim(), pin: newPin.trim() }) });
      setNewUsername(''); setNewDisplay(''); setNewPin(''); setShowForm(false);
      fetch();
      showToast('משתמש נוסף בהצלחה', 'success');
    } catch (err) { showToast(err.message || 'שגיאה בהוספת משתמש', 'error'); }
  };

  const remove = async (username) => {
    try {
      await apiJson(`/users/${username}`, { method: 'DELETE' });
      setConfirmDelete(null);
      fetch();
      showToast('משתמש נמחק', 'info');
    } catch (err) { showToast(err.message || 'שגיאה במחיקה', 'error'); }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
          <Users size={18} color="var(--primary-color)" /> ניהול משתמשים
        </h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> משתמש חדש
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--neutral-bg)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>שם משתמש (לוגין) *</label>
              <input className="form-control" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="username" dir="ltr" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>שם תצוגה</label>
              <input className="form-control" value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)} placeholder="ישראל ישראלי" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>קוד PIN (4+ ספרות) *</label>
            <div style={{ position: 'relative' }}>
              <input className="form-control" type={showPin ? 'text' : 'password'} value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="1234" dir="ltr" style={{ paddingLeft: '40px' }} />
              <button type="button" onClick={() => setShowPin((v) => !v)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={add}>הוסף משתמש</button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>ביטול</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {users.map((u) => (
          <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--surface-color)' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
              {(u.displayName || u.username || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.displayName || u.username}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', direction: 'ltr', textAlign: 'right' }}>{u.username}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {u.username === currentUser && (
                <span style={{ fontSize: '0.75rem', background: 'var(--primary-light)', color: 'var(--primary-hover)', padding: '2px 8px', borderRadius: '99px', fontWeight: 600 }}>אתה</span>
              )}
              <select
                className="form-control"
                style={{ width: '110px', padding: '4px 8px', fontSize: '0.8rem' }}
                value={u.role || 'viewer'}
                onChange={async (e) => {
                  const newRole = e.target.value;
                  try {
                    await apiJson(`/users/${u.username}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
                    fetch();
                  } catch (err) {
                    alert(err.message || 'שינוי תפקיד נכשל');
                    fetch();
                  }
                }}
                disabled={u.username === currentUser}
                title={u.username === currentUser ? 'אי אפשר לשנות תפקיד של עצמך' : 'שנה תפקיד'}
              >
                <option value="admin">מנהל</option>
                <option value="manager">עורך</option>
                <option value="viewer">צופה</option>
              </select>
              <Shield size={14} color={u.active ? 'var(--success-color)' : 'var(--text-secondary)'} title={u.active ? 'פעיל' : 'לא פעיל'} />
            </div>
            {u.username !== currentUser && (
              confirmDelete === u.username ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => remove(u.username)}>מחק</button>
                  <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setConfirmDelete(null)}>ביטול</button>
                </div>
              ) : (
                <button className="btn-icon" style={{ color: 'var(--danger-color)' }} onClick={() => setConfirmDelete(u.username)} title="מחק משתמש"><Trash2 size={16} /></button>
              )
            )}
          </div>
        ))}
        {users.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>אין משתמשים.</p>}
      </div>
    </div>
  );
}

function OptionsManager({ title, icon, optionType, placeholder }) {
  const [options, setOptions] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#1a56db');

  const fetch = () => apiJson(`/options/${optionType}`).then(setOptions).catch(() => {});
  useEffect(() => { fetch(); }, [optionType]);

  const add = async () => {
    if (!newLabel.trim()) return;
    try {
      await apiJson(`/options/${optionType}`, { method: 'POST', body: JSON.stringify({ label: newLabel.trim(), color: newColor }) });
      setNewLabel('');
      fetch();
      showToast('נוסף בהצלחה', 'success');
    } catch { showToast('שגיאה בשמירה', 'error'); }
  };

  const remove = async (id) => {
    try {
      await apiJson(`/options/${optionType}/${id}`, { method: 'DELETE' });
      fetch();
    } catch { showToast('שגיאה במחיקה', 'error'); }
  };

  return (
    <div className="card">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '1rem' }}>{icon} {title}</h3>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input className="form-control" placeholder={placeholder} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {COLORS.slice(0, 5).map((c) => (
            <button key={c.value} type="button" onClick={() => setNewColor(c.value)}
              style={{ width: '22px', height: '22px', borderRadius: '50%', background: c.value, border: newColor === c.value ? '2px solid #333' : '2px solid transparent', cursor: 'pointer' }}
              title={c.name} />
          ))}
        </div>
        <button className="btn btn-primary" style={{ padding: '8px 12px' }} onClick={add}><Plus size={16} /></button>
      </div>
      <div className="options-list">
        {options.map((opt) => (
          <div key={opt.id} className="option-row">
            <span className="option-color-swatch" style={{ background: opt.color || '#1a56db' }} />
            <span className="option-row-label">{opt.label}</span>
            <button className="option-delete-btn" onClick={() => remove(opt.id)} aria-label="מחק"><Trash2 size={14} /></button>
          </div>
        ))}
        {options.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>אין אפשרויות עדיין.</p>}
      </div>
    </div>
  );
}

function TagsManager() {
  const [tags, setTags] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#1a56db');

  const fetch = () => apiJson('/tags').then(setTags).catch(() => {});
  useEffect(() => { fetch(); }, []);

  const add = async () => {
    if (!newLabel.trim()) return;
    try {
      await apiJson('/tags', { method: 'POST', body: JSON.stringify({ label: newLabel.trim(), color: newColor }) });
      setNewLabel(''); fetch(); showToast('תגית נוספה', 'success');
    } catch { showToast('שגיאה', 'error'); }
  };

  const remove = async (id) => {
    try { await apiJson(`/tags/${id}`, { method: 'DELETE' }); fetch(); }
    catch { showToast('שגיאה במחיקה', 'error'); }
  };

  return (
    <>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '1rem' }}>
        <Tag size={18} color="var(--primary-color)" /> ניהול תגיות
      </h3>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input className="form-control" placeholder="שם תגית חדשה..." value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} style={{ flex: 1, minWidth: '180px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {COLORS.map((c) => (
            <button key={c.value} type="button" onClick={() => setNewColor(c.value)}
              style={{ width: '22px', height: '22px', borderRadius: '50%', background: c.value, border: newColor === c.value ? '2px solid #333' : '2px solid transparent', cursor: 'pointer' }}
              title={c.name} />
          ))}
        </div>
        <button className="btn btn-primary" style={{ padding: '8px 14px' }} onClick={add}><Plus size={16} /> הוסף</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {tags.map((tag) => (
          <span key={tag.id} className="tag-chip" style={{ background: tag.color || '#1a56db', fontSize: '0.85rem', padding: '5px 12px' }}>
            {tag.label}
            <button type="button" className="tag-chip-remove" onClick={() => remove(tag.id)} aria-label={`מחק תגית ${tag.label}`}>×</button>
          </span>
        ))}
        {tags.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>אין תגיות עדיין.</p>}
      </div>
    </>
  );
}

function TemplatesManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNav();

  const refresh = () => {
    setLoading(true);
    apiJson('/projects/templates')
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const cloneAndOpen = async (templateId) => {
    try {
      const project = await apiJson(`/projects/from-template/${templateId}`, { method: 'POST', body: JSON.stringify({}) });
      navigate(`/projects/${project.id}`);
    } catch {
      alert('יצירת פרויקט מתבנית נכשלה');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3><FileText size={18} color="var(--primary-color)" /> תבניות פרויקט</h3>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '12px' }}>
        תבניות נשמרות מפרויקטים קיימים. בעמוד פרויקט, לחץ על "שמור כתבנית" כדי לשמור את המבנה (משימות, מדדים, מטרה) לשימוש חוזר.
      </p>
      {loading ? (
        <div className="muted-text">טוען...</div>
      ) : templates.length === 0 ? (
        <div className="muted-text">אין תבניות עדיין.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templates.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--surface-color)' }}>
              <FileText size={20} color="var(--primary-color)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {(t.tasks || []).length} משימות · {(t.metrics || []).length} מדדים
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => cloneAndOpen(t.id)}>
                <Copy size={14} /> צור פרויקט מהתבנית
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorPicker({ label, value, onChange }) {
  return (
    <div className="form-group" style={{ marginBottom: '24px' }}>
      <label style={{ fontSize: '1rem', marginBottom: '12px' }}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        {COLORS.map((color) => (
          <button key={color.value} type="button" onClick={() => onChange(color.value)}
            className={`color-choice ${value === color.value ? 'active' : ''}`}
            style={{ background: color.value }} title={color.name} aria-label={color.name} />
        ))}
      </div>
    </div>
  );
}
