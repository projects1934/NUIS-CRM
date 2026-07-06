import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { apiJson } from './api';

export default function ProjectModal({ isOpen, onClose, onSave, project = null }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [leadingDept, setLeadingDept] = useState('');
  const [linkedPartners, setLinkedPartners] = useState([]);
  const [allPartners, setAllPartners] = useState([]);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    apiJson('/partners').then((data) => setAllPartners(Array.isArray(data) ? data : [])).catch(() => {});
    if (project) {
      setTitle(project.title || '');
      setDescription(project.description || '');
      setLeadingDept(project.leading_department || '');
      setLinkedPartners(project.partners || []);
    } else {
      setTitle('');
      setDescription('');
      setLeadingDept('');
      setLinkedPartners([]);
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  const addPartner = (partner) => {
    if (linkedPartners.some((lp) => lp.partner_id === partner.id)) return;
    setLinkedPartners((prev) => [...prev, { partner_id: partner.id, partner_name: partner.organizationName, contact_id: null }]);
    setPartnerSearch('');
  };

  const removePartner = (partnerId) => setLinkedPartners((prev) => prev.filter((lp) => lp.partner_id !== partnerId));

  const setContactForPartner = (partnerId, contactId) => {
    setLinkedPartners((prev) => prev.map((lp) => lp.partner_id === partnerId ? { ...lp, contact_id: contactId } : lp));
  };

  const getPartnerContacts = (partnerId) => allPartners.find((p) => p.id === partnerId)?.contacts || [];

  const filteredPartners = allPartners.filter(
    (p) => p.organizationName.includes(partnerSearch) && !linkedPartners.some((lp) => lp.partner_id === p.id)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('חובה להזין כותרת לפרויקט'); return; }
    try {
      let saved;
      if (project) {
        saved = await apiJson(`/projects/${project.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title: title.trim(), description, leading_department: leadingDept }),
        });
      } else {
        saved = await apiJson('/projects', {
          method: 'POST',
          body: JSON.stringify({ title: title.trim(), description, leading_department: leadingDept }),
        });
      }
      for (const lp of linkedPartners) {
        await apiJson(`/projects/${saved.id}/partners`, {
          method: 'POST',
          body: JSON.stringify({ partnerId: lp.partner_id, contactId: lp.contact_id }),
        }).catch(() => {});
      }
      onSave(saved);
    } catch (err) {
      setError(err.message || 'שמירה נכשלה');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h2>{project ? 'עריכת פרויקט' : 'פרויקט חדש'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="סגור">
            <X size={24} color="var(--text-secondary)" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="notice notice-error">{error}</div>}
            <div className="form-group">
              <label>כותרת הפרויקט *</label>
              <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="הזן כותרת..." required />
            </div>
            <div className="form-group">
              <label>מחלקה מובילה</label>
              <input className="form-control" value={leadingDept} onChange={(e) => setLeadingDept(e.target.value)} placeholder="למשל: מחלקת שיווק" />
            </div>
            <div className="form-group">
              <label>תיאור</label>
              <textarea className="form-control" rows="3" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור קצר של הפרויקט..." />
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
              <h4 style={{ marginBottom: '10px', color: 'var(--primary-color)' }}>שותפים מקושרים</h4>
              <input
                className="form-control"
                type="text"
                placeholder="חפש וקשר שותף..."
                value={partnerSearch}
                onChange={(e) => setPartnerSearch(e.target.value)}
                style={{ marginBottom: '8px' }}
              />
              {partnerSearch && (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', maxHeight: '140px', overflowY: 'auto', marginBottom: '12px' }}>
                  {filteredPartners.slice(0, 8).map((p) => (
                    <div
                      key={p.id}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.9rem' }}
                      className="tag-autocomplete-item"
                      onMouseDown={() => addPartner(p)}
                    >
                      {p.organizationName}
                    </div>
                  ))}
                  {filteredPartners.length === 0 && <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>לא נמצאו תוצאות</div>}
                </div>
              )}
              {linkedPartners.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {linkedPartners.map((lp) => {
                    const contacts = getPartnerContacts(lp.partner_id);
                    return (
                      <div key={lp.partner_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--neutral-bg)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{lp.partner_name}</span>
                        {contacts.length > 0 && (
                          <select
                            className="form-control"
                            style={{ width: 'auto', flex: 2 }}
                            value={lp.contact_id || ''}
                            onChange={(e) => setContactForPartner(lp.partner_id, e.target.value || null)}
                          >
                            <option value="">— איש קשר —</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>{c.name} {c.role ? `(${c.role})` : ''}</option>
                            ))}
                          </select>
                        )}
                        <button type="button" onClick={() => removePartner(lp.partner_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-color)' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {linkedPartners.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>טרם קושרו שותפים לפרויקט זה</p>}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>ביטול</button>
            <button type="submit" className="btn btn-primary">שמור</button>
          </div>
        </form>
      </div>
    </div>
  );
}
