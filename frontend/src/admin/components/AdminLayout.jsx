import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
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
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('nh-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 960px)').matches);
  const toggleRef = useRef(null);
  const sidebarRef = useRef(null);
  const closeNav = () => { setNavOpen(false); requestAnimationFrame(() => toggleRef.current?.focus()); };
  const toggleCollapsed = () => setCollapsed(value => {
    try { localStorage.setItem('nh-sidebar-collapsed', String(!value)); } catch { /* Storage is optional. */ }
    return !value;
  });

  useEffect(() => {
    const query = window.matchMedia('(max-width: 960px)');
    const update = () => { setMobile(query.matches); setNavOpen(false); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!navOpen || !mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector('a')?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeNav(); }
      if (event.key !== 'Tab') return;
      const controls = [...sidebarRef.current.querySelectorAll('a[href], button:not(:disabled)')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [navOpen, mobile]);

  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  return (
    <div className={`admin-shell${collapsed ? ' admin-shell-collapsed' : ''}`}>
      <a className="nh-skip-link" href="#admin-main">Skip to content</a>
      <Sidebar ref={sidebarRef} open={navOpen} mobile={mobile} collapsed={collapsed && !mobile} onCollapse={toggleCollapsed} onClose={closeNav} onNavigate={() => { setNavOpen(false); if (mobile) requestAnimationFrame(() => document.getElementById('admin-main')?.focus()); }} />

      <div className="admin-body" inert={mobile && navOpen}>
        <Topbar route={route} navOpen={navOpen} toggleRef={toggleRef} onToggleNav={() => setNavOpen(current => !current)} />
        <main className="admin-main" id="admin-main" tabIndex={-1}>
          <div className="admin-content">{children}</div>
        </main>
        <footer className="admin-footer">
          <span>Nutri Heaven · Commerce console</span>
          <a href="/" target="_blank" rel="noreferrer">Open storefront ↗</a>
        </footer>
      </div>

      {navOpen ? (
        <button type="button" className="admin-nav-scrim" aria-label="Close navigation" onClick={closeNav} tabIndex={-1} />
      ) : null}
    </div>
  );
}
