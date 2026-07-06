import { useState, useEffect } from 'react';
import { Send, MessageSquare, Trash2 } from 'lucide-react';
import { apiJson } from './api';
import { showToast } from './Toast';
import { renderBodyWithMentions } from './mentions.jsx';

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ProjectComments({ projectId, comments, onChange }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState([]);
  const list = Array.isArray(comments) ? comments.slice().reverse() : [];
  const currentUser = (typeof localStorage !== 'undefined' && localStorage.getItem('username')) || '';

  useEffect(() => {
    apiJson('/users').then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => setUsers([]));
  }, []);

  const usernames = users.map((u) => u.username);

  const post = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const updated = await apiJson(`/projects/${projectId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      });
      onChange(updated);
      setBody('');
    } catch {
      showToast('שליחת התגובה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (commentId) => {
    try {
      const updated = await apiJson(`/projects/${projectId}/comments/${commentId}`, { method: 'DELETE' });
      onChange(updated);
    } catch (err) {
      showToast(err?.message || 'המחיקה נכשלה', 'error');
    }
  };

  return (
    <div>
      <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <MessageSquare size={18} color="var(--primary-color)" />
        תגובות
        {list.length > 0 && <span className="drawer-count">{list.length}</span>}
      </h3>

      <form onSubmit={post} style={{ marginBottom: '16px', background: 'var(--neutral-bg)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            className="form-control"
            rows="2"
            placeholder="הוסף תגובה..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ paddingRight: '40px' }}
          />
          <button type="submit" className="round-submit" disabled={!body.trim() || busy}>
            <Send size={16} />
          </button>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          תייג עם @ + שם משתמש
        </div>
      </form>

      {list.length === 0 ? (
        <div className="muted-text" style={{ textAlign: 'center', padding: '8px' }}>אין תגובות עדיין</div>
      ) : (
        <div className="timeline">
          {list.map((c) => (
            <div key={c.id} className="timeline-item">
              <div className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-meta">
                  <strong>{c.author}</strong>
                  <span>{formatRelative(c.created_at)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{renderBodyWithMentions(c.body, usernames)}</div>
                {c.authorUsername && c.authorUsername === currentUser && (
                  <button type="button" className="btn-icon" style={{ color: 'var(--danger-color)', marginTop: '4px' }} onClick={() => remove(c.id)} title="מחק">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
