import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { API_URL } from '../lib/api.js';
import { useRouter } from '../router.jsx';

/**
 * The console shell: sidebar, topbar, scrollable content, small footer.
 *
 * Below 960px the sidebar becomes an off-canvas drawer; it closes itself on
 * every navigation and on the scrim, so the mobile flow never traps the operator
 * behind the menu.
 */
export function AdminLayout({ route, children }) {
  const { path } = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  return (
    <div className="admin-shell">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />

      <div className="admin-body">
        <Topbar route={route} onToggleNav={() => setNavOpen((current) => !current)} />
        <main className="admin-main">
          <div className="admin-content">{children}</div>
        </main>
        <footer className="admin-footer">
          <span>Nutri Heaven commerce console · admin UI preview</span>
          <span className="admin-mono">{API_URL}</span>
        </footer>
      </div>

      {navOpen ? (
        <button type="button" className="admin-nav-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
      ) : null}
    </div>
  );
}
