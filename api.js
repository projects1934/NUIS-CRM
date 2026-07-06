const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export const SESSION_TOKEN_KEY = 'sessionToken';
export const SESSION_EXPIRES_KEY = 'sessionExpiresAt';
export const SESSION_USER_KEY = 'username';
export const LAST_USER_KEY = 'lastUsername';

export function getSession() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  const expiresAt = localStorage.getItem(SESSION_EXPIRES_KEY);
  const username = localStorage.getItem(SESSION_USER_KEY);
  if (!token || !expiresAt || !username) return null;
  if (new Date(expiresAt).getTime() <= Date.now()) {
    clearSession(true);
    return null;
  }
  return { token, expiresAt, username };
}

export function saveSession({ token, expiresAt, user }) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_EXPIRES_KEY, expiresAt);
  localStorage.setItem(SESSION_USER_KEY, user.username);
  localStorage.setItem(LAST_USER_KEY, user.username);
}

export function clearSession(keepLastUser = true) {
  const lastUsername = localStorage.getItem(LAST_USER_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_EXPIRES_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem('loginTime');
  if (keepLastUser && lastUsername) localStorage.setItem(LAST_USER_KEY, lastUsername);
}

export async function apiFetch(path, options = {}) {
  const session = getSession();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401) clearSession(true);
  return response;
}

export function normalizeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}
