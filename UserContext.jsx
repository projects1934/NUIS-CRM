/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiJson } from './api';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiJson('/users/me');
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <UserContext.Provider value={{ me, loading, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(UserContext);
  return ctx?.me || null;
}

export function useRole() {
  const me = useCurrentUser();
  return me?.role || 'viewer';
}

export function useCan(action) {
  const role = useRole();
  if (action === 'delete') return role === 'admin';
  if (action === 'write') return role === 'admin' || role === 'manager';
  if (action === 'admin') return role === 'admin';
  return true;
}

export const ROLE_LABEL = { admin: 'מנהל', manager: 'עורך', viewer: 'צופה' };
