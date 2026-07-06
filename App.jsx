/* eslint-disable react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/exhaustive-deps, react-refresh/only-export-components */
import { useState, useEffect, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Settings as SettingsIcon, LogOut, MessageSquare, FolderOpen, Calendar, Briefcase, Wallet } from 'lucide-react';
import Dashboard from './Dashboard';
import PartnersList from './PartnersList';
import PartnerDetails from './PartnerDetails';
import Login from './Login';
import Settings from './Settings';
import Messages from './Messages';
import Projects from './Projects';
import ProjectDetails from './ProjectDetails';
import ProjectCalendar from './ProjectCalendar';
import Representations from './Representations';
import Finance from './Finance';
import ToastContainer from './Toast';
import AppHeader from './AppHeader';
import BrandLogo from './BrandLogo';
import { UserProvider, useCurrentUser, useRole, ROLE_LABEL } from './UserContext.jsx';
import { apiJson, clearSession, getSession } from './api';

export const SettingsContext = createContext(null);

function Sidebar({ user, unreadMessages, onLogout, isOpen, onClose }) {
  const me = useCurrentUser();
  const role = useRole();
  const initials = (me?.displayName || user || '?').slice(0, 2).toUpperCase();
  const closeOnNav = () => { if (typeof window !== 'undefined' && window.innerWidth < 900) onClose?.(); };
  return (
    <div className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <BrandLogo size={52} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--sidebar-text)', letterSpacing: '-0.01em' }}>
            ניהול שותפים
          </span>
          <span style={{ fontWeight: 500, fontSize: '0.74rem', color: 'var(--sidebar-muted)' }}>
            התאחדות הסטודנטים
          </span>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <NavLink to="/" end onClick={closeOnNav} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <LayoutDashboard size={18} /> דאשבורד
        </NavLink>
        <NavLink to="/partners" end onClick={closeOnNav} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <Users size={18} /> שותפים
        </NavLink>
        <NavLink to="/projects" end onClick={closeOnNav} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <FolderOpen size={18} /> פרוייקטים
        </NavLink>
        <NavLink to="/projects/calendar" onClick={closeOnNav} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <Calendar size={18} /> לוח שנה
        </NavLink>
        <NavLink to="/representations" onClick={closeOnNav} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <Briefcase size={18} /> נציגויות
        </NavLink>
        {/* Finance hidden per request — keep code & route, hide nav entry */}
        <NavLink to="/messages" onClick={closeOnNav} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <MessageSquare size={18} /> הודעות
          {unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}
        </NavLink>
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {(role === 'admin' || role === 'manager') && (
          <NavLink to="/settings" onClick={closeOnNav} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <SettingsIcon size={18} /> הגדרות
          </NavLink>
        )}
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name">{me?.displayName || user}</div>
            <div className="sidebar-user-role">{ROLE_LABEL[role] || role}</div>
            <button onClick={onLogout} className="sidebar-logout-btn">
              <LogOut size={12} /> התנתק
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState({
    economicBg: '#dbeafe',
    socialBg: '#fef3c7',
    priorityEmoji: '🔥',
    dashboardGoal: 1000000,
  });

  useEffect(() => {
    const session = getSession();
    if (session) {
      setUser(session.username);
      fetchSettings(session.username);
      refreshSessionState();
    }
  }, []);

  const applySettings = (newSettings) => {
    setSettings(newSettings);
    document.documentElement.style.setProperty('--economic-bg', newSettings.economicBg);
    document.documentElement.style.setProperty('--social-bg', newSettings.socialBg);
  };

  const fetchSettings = async (username) => {
    try {
      applySettings({ ...settings, ...(await apiJson(`/settings/${username}`)) });
    } catch (err) {
      console.error('Failed to fetch settings', err);
      applySettings(settings);
    }
  };

  const refreshSessionState = async () => {
    try {
      const data = await apiJson('/auth/me');
      setUnreadMessages(data.unreadMessages || 0);
    } catch {
      handleLogout(false);
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    const mergedSettings = { ...settings, ...newSettings };
    applySettings(mergedSettings);
    try {
      await apiJson(`/settings/${user}`, { method: 'PUT', body: JSON.stringify(newSettings) });
    } catch (err) {
      console.error('Failed to save settings', err);
    }
  };

  const handleLogin = (username) => {
    setUser(username);
    fetchSettings(username);
    refreshSessionState();
  };

  const handleLogout = async (callApi = true) => {
    if (callApi) {
      try {
        await apiJson('/auth/logout', { method: 'POST' });
      } catch {
        // still clear local session even if server unreachable
      }
    }
    clearSession(true);
    setUser(null);
    setUnreadMessages(0);
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <UserProvider>
      <SettingsContext.Provider value={{ settings, updateSettings: handleUpdateSettings, refreshSessionState }}>
        <Router>
          <div className={`app-container ${sidebarOpen ? 'sidebar-is-open' : ''}`}>
            <Sidebar
              user={user}
              unreadMessages={unreadMessages}
              onLogout={handleLogout}
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />
            <div
              className="sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            <main className="main-content">
              <AppHeader onToggleSidebar={() => setSidebarOpen((v) => !v)} />
              <div className="main-content-inner">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/partners" element={<PartnersList />} />
                  <Route path="/partners/:id" element={<PartnerDetails />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/calendar" element={<ProjectCalendar />} />
                  <Route path="/representations" element={<Representations />} />
                  <Route path="/finance" element={<Finance />} />
                  <Route path="/projects/:id" element={<ProjectDetails />} />
                  <Route path="/messages" element={<Messages onRead={refreshSessionState} />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </div>
            </main>
          </div>
          <ToastContainer />
        </Router>
      </SettingsContext.Provider>
    </UserProvider>
  );
}

export default App;
