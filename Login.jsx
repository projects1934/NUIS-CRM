import { useMemo, useState } from 'react';
import { LAST_USER_KEY, saveSession } from '../api';
import BrandLogo from '../components/BrandLogo';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

export default function Login({ onLogin }) {
  const rememberedUser = useMemo(() => localStorage.getItem(LAST_USER_KEY) || '', []);
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState(rememberedUser);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const finishLogin = (data) => {
    saveSession(data);
    onLogin(data.user.username);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const cleanUsername = username.trim();
    if (!cleanUsername) { setError('הזן שם משתמש.'); setSubmitting(false); return; }
    if (!pin.trim()) { setError('הזן קוד PIN.'); setSubmitting(false); return; }
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, pin }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'הכניסה נכשלה.');
      finishLogin(data);
    } catch (err) {
      setError(err.message || 'לא הצלחתי להתחבר לשרת.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <BrandLogo size={92} />
        </div>
        <h1 className="login-title">ברוך הבא</h1>
        <p className="login-subtitle">מערכת ניהול שותפים · התאחדות הסטודנטים</p>

        {error && <div className="notice notice-error" style={{ marginBottom: '16px', textAlign: 'right' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ textAlign: 'right' }}>
            <label>שם משתמש</label>
            <input
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="הכנס שם משתמש"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              disabled={submitting}
            />
          </div>
          <div className="form-group" style={{ textAlign: 'right', marginBottom: '28px' }}>
            <label>קוד PIN</label>
            <input
              type="password"
              className="form-control"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="הזן PIN"
              autoComplete="current-password"
              required
              disabled={submitting}
              style={{ letterSpacing: '6px', fontSize: '1.1rem' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center', fontSize: '1rem', padding: '13px' }}>
            {submitting ? 'מתחבר...' : 'כניסה למערכת'}
          </button>
        </form>

        <p style={{ marginTop: '20px', fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
          אין לך חשבון? פנה למנהל המערכת.
        </p>
      </div>
    </div>
  );
}
