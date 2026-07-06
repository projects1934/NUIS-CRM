import { useState, useRef, useEffect } from 'react';
import { Share2, Copy, MessageCircle, Mail } from 'lucide-react';
import { showToast } from './Toast';

export default function ShareMenu({ contact, organizationName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const buildText = () => [
    `שם: ${contact.name || ''}`,
    contact.role ? `תפקיד: ${contact.role}` : null,
    `ארגון: ${organizationName || ''}`,
    contact.phone ? `טלפון: ${contact.phone}` : null,
    contact.email ? `מייל: ${contact.email}` : null,
  ].filter(Boolean).join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      showToast('הפרטים הועתקו ללוח', 'success');
    } catch {
      showToast('לא הצלחתי להעתיק', 'error');
    }
    setOpen(false);
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildText())}`, '_blank');
    setOpen(false);
  };

  const handleEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(`פרטי קשר – ${contact.name}`)}&body=${encodeURIComponent(buildText())}`;
    setOpen(false);
  };

  return (
    <div className="share-menu-wrapper" ref={ref}>
      <button
        type="button"
        className="btn btn-outline"
        style={{ padding: '4px 8px', fontSize: '0.8rem' }}
        onClick={() => setOpen((v) => !v)}
        aria-label="שתף פרטי קשר"
        title="שתף"
      >
        <Share2 size={14} />
      </button>
      {open && (
        <div className="share-dropdown">
          <button type="button" onClick={handleCopy}>
            <Copy size={15} /> העתקה ללוח
          </button>
          <button type="button" onClick={handleWhatsApp}>
            <MessageCircle size={15} /> שליחה בוואטסאפ
          </button>
          <button type="button" onClick={handleEmail}>
            <Mail size={15} /> שליחה במייל
          </button>
        </div>
      )}
    </div>
  );
}
