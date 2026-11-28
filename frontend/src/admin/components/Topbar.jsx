import InstallApp from '../../InstallApp.jsx';
import { Icon } from './Icon.jsx';
import { Link } from '../router.jsx';
import { ModuleGuide } from './ModuleGuide.jsx';

/** Breadcrumb + mobile navigation toggle. Deliberately thin: no global search. */
export function Topbar({ route, navOpen, toggleRef, onToggleNav }) {
  return (
    <header className="admin-topbar">
      <button type="button" className="admin-icon-btn admin-nav-toggle" ref={toggleRef} onClick={onToggleNav} aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} aria-controls="admin-navigation">
        <Icon name="menu" />
      </button>
      <nav className="admin-crumbs" aria-label="Breadcrumb">
        <Link to="/admin">Admin</Link>
        {route?.group ? (
          <>
            <span aria-hidden="true">/</span>
            <span>{route.group}</span>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <b aria-current="page">{route?.title ?? 'Not found'}</b>
      </nav>
      {route?.id && <ModuleGuide key={route.id} route={route} />}
      <InstallApp admin className="admin-install-app" />

    </header>
  );
}
