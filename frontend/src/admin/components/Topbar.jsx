import { API_URL } from '../lib/api.js';
import { Link } from '../router.jsx';

/** Breadcrumb + mobile navigation toggle. Deliberately thin: no global search. */
export function Topbar({ route, onToggleNav }) {
  return (
    <header className="admin-topbar">
      <button type="button" className="admin-icon-btn admin-nav-toggle" onClick={onToggleNav} aria-label="Toggle navigation">
        ☰
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
        <b>{route?.title ?? 'Not found'}</b>
      </nav>
      <div className="admin-topbar-meta">
        <span className="admin-api-chip admin-mono" title={`API base URL: ${API_URL}`}>
          {API_URL.replace(/^https?:\/\//, '')}
        </span>
      </div>
    </header>
  );
}
