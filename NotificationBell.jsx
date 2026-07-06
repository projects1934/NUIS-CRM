/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useRef } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from './api';

function relative(ts) {
  const d = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'הרגע';
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'short' });
}

const TYPE_ICON = { mention: '@', task_assigned: '✓', sub_partner: '🔗' };

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const navigate = useNavigate();
  const wrapRef = useRef(null);

  const load = async () => {
    try {
      const data = await apiJson('/notifications');
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  const handleClick = async (n) => {
    setOpen(false);
    if (!n.read) {
      try { await apiJson(`/notifications/${n.id}/read`, { method: 'PUT' }); } catch { /* ignore */ }
    }
    if (n.link) navigate(n.link);
    load();
  };

  const markAll = async () => {
    try { await apiJson('/notifications/mark-all-read', { method: 'POST' }); } catch { /* ignore */ }
    load();
  };

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button type="button" className="bell-btn" onClick={() => setOpen((v) => !v)} aria-label={unread > 0 ? `${unread} התראות חדשות` : 'התראות'} title={unread > 0 ? `${unread} חדשות` : 'אין התראות חדשות'}>
        <Bell size={18} strokeWidth={1.75} />
        {unread > 0 && <span className="bell-dot" />}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-panel-header">
            <strong>התראות</strong>
            {unread > 0 && (
              <button type="button" className="bell-mark-all" onClick={markAll}>
                <CheckCheck size={14} /> סמן הכול כנקרא
              </button>
            )}
          </div>
          <div className="bell-list">
            {items.length === 0 ? (
              <div className="bell-empty">אין התראות חדשות</div>
            ) : items.slice(0, 10).map((n) => (
              <button
                key={n.id}
                type="button"
                className={`bell-item ${n.read ? '' : 'unread'}`}
                onClick={() => handleClick(n)}
              >
                <span className="bell-item-icon">{TYPE_ICON[n.type] || '•'}</span>
                <span className="bell-item-body">
                  <span className="bell-item-text">{n.body}</span>
                  <span className="bell-item-time">{relative(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
