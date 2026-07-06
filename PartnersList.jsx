/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/purity */
import { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Search, Download, ArrowUpDown, RefreshCw, ExternalLink, Archive, Upload } from 'lucide-react';
import confetti from 'canvas-confetti';
import PartnerModal from './PartnerModal';
import ExportModal from './ExportModal';
import ImportPartnersModal from './ImportPartnersModal';
import BulkActionBar from './BulkActionBar';
import { SettingsContext } from './App';
import { useCan } from './UserContext.jsx';
import { apiJson, formatDate } from './api';
import { showToast } from './Toast';

const LIST_STATE_KEY = 'partnersListState';
const LAST_VIEWED_KEY = 'lastViewedPartnerId';

const readSavedState = () => {
  try { return JSON.parse(sessionStorage.getItem(LIST_STATE_KEY) || '{}'); }
  catch { return {}; }
};

const CELEBRATION_MESSAGES = [
  'אתה תותח 🔥', 'אלופה שאת! ⭐', 'למה מי יכול עלייך 💪',
  'יש! סגרנו את זה 🎉', 'כל הכבוד, קדימה! 🚀',
];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function PartnersList() {
  const savedState = useMemo(() => readSavedState(), []);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const canWrite = useCan('write');
  const [searchTerm, setSearchTerm] = useState(savedState.searchTerm || '');
  const [filterStatus, setFilterStatus] = useState(savedState.filterStatus || '');
  const [filterTag, setFilterTag] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState(savedState.sortBy || '');
  const [sortDesc, setSortDesc] = useState(Boolean(savedState.sortDesc));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [pendingStatusIds, setPendingStatusIds] = useState({});
  const [lastViewedId, setLastViewedId] = useState(() => sessionStorage.getItem(LAST_VIEWED_KEY) || '');
  const [allTags, setAllTags] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [projectsByPartner, setProjectsByPartner] = useState({});
  const rowRefs = useRef({});
  const highlightTimer = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useContext(SettingsContext);
  const priorityEmojiChar = settings?.priorityEmoji || '🔥';

  const saveListState = (extra = {}) => {
    sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify({
      searchTerm, filterStatus, sortBy, sortDesc,
      scrollY: window.scrollY,
      from: `${location.pathname}${location.search}`,
      ...extra,
    }));
  };

  const fetchPartners = () => {
    setLoading(true);
    setError('');
    apiJson('/partners')
      .then((data) => { setPartners(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError('לא הצלחתי להתחבר לשרת הנתונים.'); setLoading(false); });
  };

  useEffect(() => {
    fetchPartners();
    apiJson('/tags').then(setAllTags).catch(() => {});
    apiJson('/options/partner_type').then(setTypeOptions).catch(() => {});
    apiJson('/options/partner_category').then(setCategoryOptions).catch(() => {});
    apiJson('/projects').then((projs) => {
      const map = {};
      for (const p of (Array.isArray(projs) ? projs : [])) {
        for (const lp of (p.partners || [])) {
          if (!map[lp.partner_id]) map[lp.partner_id] = [];
          map[lp.partner_id].push(p.title || '');
        }
      }
      setProjectsByPartner(map);
    }).catch(() => setProjectsByPartner({}));
  }, []);

  useEffect(() => { saveListState(); }, [searchTerm, filterStatus, sortBy, sortDesc]);

  useEffect(() => {
    if (!loading && savedState.scrollY != null) {
      window.requestAnimationFrame(() => window.scrollTo(0, Number(savedState.scrollY) || 0));
    }
  }, [loading]);

  useEffect(() => {
    if (!lastViewedId || loading) return;
    const node = rowRefs.current[lastViewedId];
    if (node) {
      const rect = node.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setLastViewedId('');
      sessionStorage.removeItem(LAST_VIEWED_KEY);
    }, 30000);
    return () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); };
  }, [lastViewedId, loading]);

  const handleSave = () => { setIsModalOpen(false); fetchPartners(); };

  const getPriorityEmoji = (priority) => {
    if (priority === 'high') return priorityEmojiChar.repeat(3);
    if (priority === 'medium') return priorityEmojiChar.repeat(2);
    if (priority === 'low') return priorityEmojiChar;
    return '-';
  };

  const processedPartners = useMemo(() => {
    let result = [...partners];

    if (!showArchived) result = result.filter((p) => p.status !== 'archived');

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((p) =>
        (p.organizationName || '').toLowerCase().includes(lower) ||
        (p.contacts || []).some((c) => (c.name || '').toLowerCase().includes(lower)) ||
        (p.partnerType || '').toLowerCase().includes(lower) ||
        (p.tags || []).some((t) => (t.label || '').toLowerCase().includes(lower)) ||
        (projectsByPartner[p.id] || []).some((title) => title.toLowerCase().includes(lower))
      );
    }

    if (filterStatus) result = result.filter((p) => p.status === filterStatus);
    if (filterType) result = result.filter((p) => p.partnerType === filterType);
    if (filterCategory) result = result.filter((p) => p.partnerCategory === filterCategory);
    if (filterTag) result = result.filter((p) => (p.tags || []).some((t) => t.label === filterTag));

    if (sortBy === 'alpha') {
      result.sort((a, b) => {
        const res = (a.organizationName || '').localeCompare(b.organizationName || '', 'he');
        return sortDesc ? -res : res;
      });
    } else if (sortBy === 'date') {
      result.sort((a, b) => {
        const da = new Date(a.lastModifiedAt || a.createdAt).getTime();
        const db = new Date(b.lastModifiedAt || b.createdAt).getTime();
        return sortDesc ? db - da : da - db;
      });
    }

    return result;
  }, [partners, showArchived, searchTerm, filterStatus, filterType, filterCategory, filterTag, sortBy, sortDesc, projectsByPartner]);

  const handleSort = (type) => {
    if (sortBy === type) setSortDesc(!sortDesc);
    else { setSortBy(type); setSortDesc(false); }
  };

  const rememberPartner = (id) => {
    setLastViewedId(id);
    sessionStorage.setItem(LAST_VIEWED_KEY, id);
  };

  const openPartner = (id) => {
    const from = `${location.pathname}${location.search}`;
    saveListState({ scrollY: window.scrollY, from });
    rememberPartner(id);
    navigate(`/partners/${id}`, { state: { from } });
  };

  const openPartnerInNewTab = (e, id) => {
    e.stopPropagation();
    rememberPartner(id);
    window.open(`/partners/${id}`, '_blank', 'noopener');
  };

  const handleStatusChange = async (partner, newStatus) => {
    if (!newStatus || newStatus === partner.status || pendingStatusIds[partner.id]) return;
    const prev = partner.status;
    setPartners((ps) => ps.map((p) => p.id === partner.id ? { ...p, status: newStatus } : p));
    setPendingStatusIds((prev) => ({ ...prev, [partner.id]: true }));
    try {
      const updated = await apiJson(`/partners/${partner.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
      setPartners((ps) => ps.map((p) => p.id === partner.id ? { ...p, ...updated, status: newStatus } : p));
      if (newStatus === 'active' && prev !== 'active' && !prefersReducedMotion()) {
        confetti({ particleCount: 120, spread: 80, origin: { x: 0.5, y: 0.5 } });
        showToast(CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)], 'success');
      }
    } catch {
      setPartners((ps) => ps.map((p) => p.id === partner.id ? { ...p, status: prev } : p));
      showToast('השינוי לא נשמר, נסה שוב', 'error');
    } finally {
      setPendingStatusIds((prev) => { const n = { ...prev }; delete n[partner.id]; return n; });
    }
  };

  const parentMap = useMemo(() => {
    const map = {};
    for (const p of partners) map[p.id] = p.organizationName;
    return map;
  }, [partners]);

  return (
    <div>
      <div className="header-flex">
        <div>
          <h2>כל השותפים</h2>
          {!loading && !error && (
            <div className="muted-text">{processedPartners.length} מתוך {partners.filter((p) => showArchived || p.status !== 'archived').length} שותפים מוצגים</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => setIsImportOpen(true)}>
            <Upload size={18} /> ייבוא מ-Excel
          </button>
          <button className="btn btn-outline" onClick={() => setIsExportOpen(true)} disabled={!partners.length}>
            <Download size={18} /> ייצוא לאקסל
          </button>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> ארגון שותף חדש
          </button>
        </div>
      </div>

      <div className="search-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', right: '12px', top: '12px' }} />
          <input
            type="text"
            className="form-control"
            placeholder="חיפוש לפי שם ארגון, איש קשר, פרויקט, תגית, סוג..."
            style={{ paddingRight: '40px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select className="form-control" style={{ width: '150px' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          <option value="active">פעיל 🟢</option>
          <option value="forming">בהתהוות 🟡</option>
          <option value="inactive">לא פעיל 🔴</option>
        </select>

        {typeOptions.length > 0 && (
          <select className="form-control" style={{ width: '150px' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">כל הסוגים</option>
            {typeOptions.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
          </select>
        )}

        {categoryOptions.length > 0 && (
          <select className="form-control" style={{ width: '150px' }} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">כל הקטגוריות</option>
            {categoryOptions.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
          </select>
        )}

        {allTags.length > 0 && (
          <select className="form-control" style={{ width: '150px' }} value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            <option value="">כל התגיות</option>
            {allTags.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
          </select>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn ${sortBy === 'alpha' ? 'btn-primary' : 'btn-outline'}`} onClick={() => handleSort('alpha')}>
            <ArrowUpDown size={18} /> א-ב
          </button>
          <button className={`btn ${sortBy === 'date' ? 'btn-primary' : 'btn-outline'}`} onClick={() => handleSort('date')}>
            עדכון
          </button>
          <button
            className={`btn ${showArchived ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? 'הסתר ארכיון' : 'הצג ארכיון'}
          >
            <Archive size={18} /> ארכיון
          </button>
          <button className="btn btn-outline" onClick={fetchPartners} title="רענן">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="notice notice-error">
          <div>{error}</div>
          <button className="btn btn-outline" onClick={fetchPartners}><RefreshCw size={16} /> נסה שוב</button>
        </div>
      )}

      <div className="partner-list">
        {loading ? <div className="empty-state">טוען שותפים...</div> : (
          <>
            {processedPartners.length > 0 && (
              <div className="partner-list-tools">
                <label className="partner-select-all">
                  <input
                    type="checkbox"
                    className="bulk-checkbox"
                    checked={selectedIds.length === processedPartners.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? processedPartners.map((p) => p.id) : [])}
                  />
                  בחר הכל
                </label>
                <span className="muted-text" style={{ fontSize: '0.85rem' }}>{processedPartners.length} שותפים</span>
              </div>
            )}

            {processedPartners.map((partner) => {
              const isLastViewed = partner.id === lastViewedId;
              const isPending = Boolean(pendingStatusIds[partner.id]);
              const isSubPartner = Boolean(partner.parentPartnerId);
              const lastContactTs = new Date(partner.lastContactAt || partner.createdAt || 0).getTime();
              const staleDays = lastContactTs ? Math.floor((Date.now() - lastContactTs) / 86400000) : 0;
              const isStale = partner.status === 'active' && lastContactTs > 0 && staleDays >= 30;
              const isSelected = selectedIds.includes(partner.id);
              const cardClass = [
                'partner-card',
                isSelected ? 'partner-card-selected' : '',
                isSubPartner ? 'partner-card-sub' : '',
                isLastViewed ? 'partner-card-viewed' : '',
                isStale ? 'partner-card-stale' : '',
              ].filter(Boolean).join(' ');
              return (
                <div
                  key={partner.id}
                  ref={(el) => { rowRefs.current[partner.id] = el; }}
                  className={cardClass}
                  onClick={() => openPartner(partner.id)}
                  data-testid="partner-row"
                >
                  <div className="partner-card-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="bulk-checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelectedIds((prev) =>
                          e.target.checked ? [...prev, partner.id] : prev.filter((id) => id !== partner.id)
                        );
                      }}
                    />
                  </div>

                  <div className="partner-card-main">
                    <div className="partner-card-title-row">
                      <span className="partner-card-name">{partner.organizationName}</span>
                      {partner.priority && <span className="partner-card-priority">{getPriorityEmoji(partner.priority)}</span>}
                      <button
                        type="button"
                        className="open-tab-btn"
                        onClick={(e) => openPartnerInNewTab(e, partner.id)}
                        title="פתח בכרטיסייה חדשה"
                      >
                        <ExternalLink size={13} />
                      </button>
                      {isSubPartner && parentMap[partner.parentPartnerId] && (
                        <span className="parent-name-label">↳ {parentMap[partner.parentPartnerId]}</span>
                      )}
                    </div>

                    <div className="partner-card-meta">
                      {partner.contacts?.length ? (
                        <span className="partner-meta-item">
                          👤 {partner.contacts[0].name}
                          {partner.contacts.length > 1 && <span className="partner-meta-more"> +{partner.contacts.length - 1}</span>}
                        </span>
                      ) : (
                        <span className="partner-meta-item muted-text">אין איש קשר</span>
                      )}

                      {(partner.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag.id} className="tag-chip" style={{ background: tag.color || 'var(--accent-mint)' }}>
                          {tag.label}
                        </span>
                      ))}
                      {(partner.tags || []).length > 3 && (
                        <span className="partner-meta-more">+{partner.tags.length - 3}</span>
                      )}

                      <span className="partner-meta-item muted-text">· עודכן {formatDate(partner.lastModifiedAt)}</span>
                      {isStale && <span className="stale-chip">🕒 לא בקשר {staleDays} ימים</span>}
                    </div>
                  </div>

                  <div className="partner-card-status" onClick={(e) => e.stopPropagation()}>
                    <select
                      className={`status-select status-${partner.status || 'active'}`}
                      value={partner.status || 'active'}
                      onChange={(e) => handleStatusChange(partner, e.target.value)}
                      disabled={isPending}
                      data-testid="status-select"
                    >
                      <option value="active">פעיל 🟢</option>
                      <option value="forming">בהתהוות 🟡</option>
                      <option value="inactive">לא פעיל 🔴</option>
                      <option value="archived">ארכיון</option>
                    </select>
                  </div>
                </div>
              );
            })}
            {!error && processedPartners.length === 0 && (
              <div className="empty-state">לא נמצאו שותפים שתואמים לחיפוש.</div>
            )}
          </>
        )}
      </div>

      <PartnerModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} />
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} partners={processedPartners} />
      <ImportPartnersModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onDone={fetchPartners} />
      {canWrite && (
        <BulkActionBar
          kind="partner"
          selectedIds={selectedIds}
          onClear={() => setSelectedIds([])}
          onComplete={() => { setSelectedIds([]); fetchPartners(); }}
        />
      )}
    </div>
  );
}
