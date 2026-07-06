import { X, Download, Users, Building2, FolderOpen } from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiJson, formatDate } from '../api';
import { showToast } from './Toast';
import { downloadProjectsXlsx } from '../utils/exportProjects';

const STATUS_LABELS = { active: 'פעיל', forming: 'בהתהוות', inactive: 'לא פעיל', archived: 'ארכיון' };

export default function ExportModal({ isOpen, onClose, partners }) {
  if (!isOpen) return null;

  const exportProjects = async () => {
    try {
      const projects = await apiJson('/projects');
      downloadProjectsXlsx({ projects: Array.isArray(projects) ? projects : [], partners });
      onClose();
    } catch {
      showToast('הייצוא נכשל', 'error');
    }
  };

  const exportByContact = () => {
    const rows = [];
    for (const p of partners) {
      const contacts = p.contacts?.length ? p.contacts : [{}];
      for (const c of contacts) {
        rows.push({
          'שם ארגון': p.organizationName || '',
          'תגיות': (p.tags || []).map((t) => t.label).join(', '),
          'סוג שותף': p.partnerType || '',
          'קטגוריה': p.partnerCategory || '',
          'סטטוס': STATUS_LABELS[p.status] || p.status || '',
          'עודכן לאחרונה': formatDate(p.lastModifiedAt),
          'עודכן על ידי': p.lastModifiedBy || '',
          'שם איש קשר': c.name || '',
          'תפקיד': c.role || '',
          'טלפון': c.phone || '',
          'מייל': c.email || '',
        });
      }
    }
    downloadXlsx(rows, 'שותפים_לפי_איש_קשר');
    onClose();
  };

  const exportByOrg = () => {
    const rows = partners.map((p) => ({
      'שם ארגון': p.organizationName || '',
      'תגיות': (p.tags || []).map((t) => t.label).join(', '),
      'סוג שותף': p.partnerType || '',
      'קטגוריה': p.partnerCategory || '',
      'סטטוס': STATUS_LABELS[p.status] || p.status || '',
      'עודכן לאחרונה': formatDate(p.lastModifiedAt),
      'עודכן על ידי': p.lastModifiedBy || '',
      'אנשי קשר': (p.contacts || [])
        .map((c) => [c.name, c.role && `(${c.role})`, c.phone].filter(Boolean).join(' '))
        .join('\n'),
    }));
    downloadXlsx(rows, 'שותפים_לפי_ארגון');
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2><Download size={20} style={{ marginInlineEnd: '8px' }} />ייצוא לאקסל</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="סגור">
            <X size={24} color="var(--text-secondary)" />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            מייצא <strong>{partners.length}</strong> שותפים (לפי הסינון הפעיל). בחר פורמט:
          </p>
          <button className="btn btn-primary" style={{ justifyContent: 'flex-start', gap: '12px', padding: '14px 20px' }} onClick={exportByContact}>
            <Users size={20} />
            <span>
              <strong>ייצוא לפי איש קשר</strong>
              <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 400, opacity: 0.85 }}>שורה לכל איש קשר</span>
            </span>
          </button>
          <button className="btn btn-outline" style={{ justifyContent: 'flex-start', gap: '12px', padding: '14px 20px' }} onClick={exportByOrg}>
            <Building2 size={20} />
            <span>
              <strong>ייצוא לפי ארגון</strong>
              <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 400, opacity: 0.85 }}>שורה לכל ארגון, כל אנשי הקשר בתא אחד</span>
            </span>
          </button>
          <button className="btn btn-outline" style={{ justifyContent: 'flex-start', gap: '12px', padding: '14px 20px' }} onClick={exportProjects}>
            <FolderOpen size={20} />
            <span>
              <strong>ייצוא פרויקטים</strong>
              <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 400, opacity: 0.85 }}>שורה לכל פרויקט עם משימות, מדדים ושותפים</span>
            </span>
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

function downloadXlsx(rows, filename, sheetName = 'שותפים') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
