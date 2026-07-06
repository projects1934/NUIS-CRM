import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useCurrentUser, ROLE_LABEL } from './UserContext.jsx';

const TITLES = {
  '/': 'דשבורד',
  '/partners': 'שותפים',
  '/projects': 'פרויקטים',
  '/projects/calendar': 'לוח שנה',
  '/representations': 'נציגויות ההתאחדות',
  '/finance': 'ניהול כספים',
  '/messages': 'הודעות',
  '/settings': 'הגדרות',
};

function titleFor(pathname) {
  if (pathname.startsWith('/partners/')) return 'פרטי שותף';
  if (pathname.startsWith('/projects/calendar')) return 'לוח שנה';
  if (pathname.startsWith('/projects/')) return 'פרטי פרויקט';
  return TITLES[pathname] || '';
}

export default function AppHeader({ onToggleSidebar }) {
  const location = useLocation();
  const me = useCurrentUser();
  const title = titleFor(location.pathname);

  return (
    <div className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          className="app-header-hamburger"
          onClick={onToggleSidebar}
          aria-label="פתח תפריט"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
        <div className="app-header-title">{title}</div>
      </div>
      <div className="app-header-actions">
        <NotificationBell />
        {me && (
          <div className="app-header-user">
            <div className="user-avatar-pill">
              {(me.displayName || me.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="user-meta">
              <div className="user-name">{me.displayName}</div>
              <div className={`role-pill role-${me.role}`}>{ROLE_LABEL[me.role] || me.role}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
