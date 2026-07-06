/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Star } from 'lucide-react';
import { apiJson } from '../api';
import TagInput from './TagInput';

const emptyContact = () => ({ id: Date.now().toString(), name: '', role: '', phone: '', email: '', dataSource: '' });

const DEFAULT_DATA_SOURCES = ['2024', '2025', '2026', 'ידני'];

const buildDataSourceOptions = (partner) => {
  const fromPartner = partner?.sourceFiles || [];
  const fromContacts = (partner?.contacts || []).map((c) => c.dataSource).filter(Boolean);
  const set = new Set([...DEFAULT_DATA_SOURCES, ...fromPartner, ...fromContacts]);
  return Array.from(set);
};

const emptyPartner = {
  organizationName: '',
  domain: '',
  status: 'active',
  priority: '',
  packageDescription: '',
  pic: '',
  generalNotes: '',
  partnerType: '',
  partnerCategory: '',
  region: '',
  collaborationStartDate: '',
  tags: [],
  parentPartnerId: null,
  contacts: [emptyContact()],
};

export default function PartnerModal({ isOpen, onClose, onSave, partner = null }) {
  const [formData, setFormData] = useState(emptyPartner);
  const [error, setError] = useState('');
  const [typeOptions, setTypeOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [regionOptions, setRegionOptions] = useState([]);
  const [allPartners, setAllPartners] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    apiJson('/options/partner_type').then(setTypeOptions).catch(() => {});
    apiJson('/options/partner_category').then(setCategoryOptions).catch(() => {});
    apiJson('/options/partner_region').then(setRegionOptions).catch(() => setRegionOptions([]));
    apiJson('/partners').then((data) => setAllPartners(Array.isArray(data) ? data : [])).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (partner) {
      setFormData({
        ...emptyPartner,
        ...partner,
        contacts: partner.contacts?.length ? partner.contacts : [emptyContact()],
        partnerType: partner.partnerType || '',
        partnerCategory: partner.partnerCategory || '',
        tags: partner.tags || [],
        parentPartnerId: partner.parentPartnerId || null,
      });
    } else {
      setFormData({ ...emptyPartner, contacts: [emptyContact()] });
    }
    setError('');
  }, [partner, isOpen]);

  if (!isOpen) return null;

  const dataSourceOptions = buildDataSourceOptions(partner || formData);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleContactChange = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact) => contact.id === id ? { ...contact, [field]: value } : contact),
    }));
  };

  const addContactRow = () => {
    setFormData((prev) => ({ ...prev, contacts: [...prev.contacts, emptyContact()] }));
  };

  const removeContactRow = (id) => {
    setFormData((prev) => ({ ...prev, contacts: prev.contacts.filter((contact) => contact.id !== id) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const organizationName = formData.organizationName.trim();
    if (!organizationName) {
      setError('חובה להזין שם ארגון.');
      return;
    }

    const username = localStorage.getItem('username') || 'לא ידוע';
    const dataToSubmit = {
      ...formData,
      organizationName,
      contacts: formData.contacts.filter((contact) => contact.name.trim() !== ''),
      updatedBy: username,
    };

    const url = partner ? `/partners/${partner.id}` : '/partners';
    const method = partner ? 'PUT' : 'POST';

    try {
      const savedPartner = await apiJson(url, {
        method,
        body: JSON.stringify(dataToSubmit),
      });
      onSave(savedPartner);
    } catch (err) {
      setError(err.message || 'לא הצלחתי להתחבר לשרת.');
    }
  };

  const parentOptions = allPartners.filter((p) => p.id !== partner?.id && !p.parentPartnerId);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2>{partner ? 'עריכת ארגון' : 'הוספת ארגון חדש'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="סגור">
            <X size={24} color="var(--text-secondary)" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="notice notice-error">{error}</div>}

            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--primary-color)' }}>פרטי הארגון</h3>
            <div className="grid grid-cols-2">
              <Input label="שם הארגון *" name="organizationName" value={formData.organizationName} onChange={handleChange} required />
              <Input label="תחום עיסוק" name="domain" value={formData.domain} onChange={handleChange} />
              <Input label="אחראי קשר מצדנו" name="pic" value={formData.pic} onChange={handleChange} />
              <div className="form-group">
                <label>סטטוס</label>
                <select className="form-control" name="status" value={formData.status} onChange={handleChange}>
                  <option value="active">פעיל 🟢</option>
                  <option value="forming">בהתהוות 🟡</option>
                  <option value="inactive">לא פעיל 🔴</option>
                  <option value="archived">ארכיון</option>
                </select>
              </div>
              <Select
                label="סוג שותף"
                name="partnerType"
                value={formData.partnerType}
                onChange={handleChange}
                options={[['', 'לא מוגדר'], ...typeOptions.map((o) => [o.label, o.label])]}
              />
              <Select
                label="קטגוריית שותף"
                name="partnerCategory"
                value={formData.partnerCategory}
                onChange={handleChange}
                options={[['', 'לא מוגדרת'], ...categoryOptions.map((o) => [o.label, o.label])]}
              />
              <Select label="עדיפות" name="priority" value={formData.priority} onChange={handleChange} options={[
                ['', 'לא נבחר'],
                ['high', 'גבוה'],
                ['medium', 'בינוני'],
                ['low', 'נמוך'],
              ]} />
              <Select
                label="אזור"
                name="region"
                value={formData.region || ''}
                onChange={handleChange}
                options={[['', 'לא מוגדר'], ...regionOptions.map((o) => [o.label, o.label])]}
              />
              <Input
                label="תחילת שיתוף פעולה"
                name="collaborationStartDate"
                type="date"
                value={formData.collaborationStartDate || ''}
                onChange={handleChange}
              />
              <div className="form-group">
                <label>שותף אב</label>
                <select
                  className="form-control"
                  name="parentPartnerId"
                  value={formData.parentPartnerId || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, parentPartnerId: e.target.value || null }))}
                >
                  <option value="">— ללא שותף אב —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.organizationName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '8px' }}>
              <label>תגיות</label>
              <TagInput value={formData.tags} onChange={(tags) => setFormData((prev) => ({ ...prev, tags }))} />
            </div>

            <Textarea label="תיאור חבילה / הצעה" name="packageDescription" value={formData.packageDescription} onChange={handleChange} />
            <Textarea label="הערות כלליות" name="generalNotes" value={formData.generalNotes} onChange={handleChange} />

            <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--primary-color)' }}>אנשי קשר</h3>
                <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={addContactRow}>
                  <Plus size={16} /> הוסף איש קשר
                </button>
              </div>

              {formData.contacts.map((contact) => (
                <div key={contact.id} style={{ background: 'var(--neutral-bg)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '12px', position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, contacts: prev.contacts.map((c) => ({ ...c, isPrimary: c.id === contact.id })) }))}
                    style={{ position: 'absolute', left: formData.contacts.length > 1 ? '48px' : '16px', top: '16px', background: 'none', border: 'none', color: contact.isPrimary ? 'var(--warning-color)' : 'var(--text-secondary)', cursor: 'pointer' }}
                    title={contact.isPrimary ? 'איש קשר ראשי' : 'סמן כראשי'}
                    aria-label={contact.isPrimary ? 'איש קשר ראשי' : 'סמן כראשי'}
                  >
                    <Star size={18} fill={contact.isPrimary ? 'currentColor' : 'none'} />
                  </button>
                  {formData.contacts.length > 1 && (
                    <button type="button" onClick={() => removeContactRow(contact.id)} style={{ position: 'absolute', left: '16px', top: '16px', background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' }} aria-label="מחק איש קשר">
                      <Trash2 size={18} />
                    </button>
                  )}
                  <div className="grid grid-cols-2" style={{ gap: '12px', paddingLeft: '56px' }}>
                    <ContactInput label="שם מלא" value={contact.name} onChange={(value) => handleContactChange(contact.id, 'name', value)} />
                    <ContactInput label="תפקיד" value={contact.role} onChange={(value) => handleContactChange(contact.id, 'role', value)} />
                    <ContactInput label="טלפון" value={contact.phone} onChange={(value) => handleContactChange(contact.id, 'phone', value)} />
                    <ContactInput label="אימייל" type="email" value={contact.email} onChange={(value) => handleContactChange(contact.id, 'email', value)} />
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>מקור הנתונים</label>
                      <select
                        className="form-control"
                        value={contact.dataSource || ''}
                        onChange={(event) => handleContactChange(contact.id, 'dataSource', event.target.value)}
                      >
                        <option value="">לא ידוע</option>
                        {dataSourceOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>ביטול</button>
            <button type="submit" className="btn btn-primary">שמירה</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input className="form-control" type={props.type || 'text'} {...props} />
    </div>
  );
}

function Select({ label, options, ...props }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <select className="form-control" {...props}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div className="form-group" style={{ marginTop: '16px' }}>
      <label>{label}</label>
      <textarea className="form-control" rows="2" {...props} />
    </div>
  );
}

function ContactInput({ label, value, onChange, type = 'text' }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <input type={type} className="form-control" value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
