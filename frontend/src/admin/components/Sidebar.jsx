import { Pill } from './StatusPill.jsx';
import { Icon } from './Icon.jsx';
import { can, roleLabel } from '../lib/permissions.js';
import { NAV_GROUP_ORDER, navRoutes } from '../routes.jsx';
import { Link, useRouter } from '../router.jsx';
import { useSession } from '../session/session-context.js';

/**
 * Navigation generated from the route table and filtered by the signed-in role,
 * so an operator only ever sees modules they can actually open. The filtering is
 * a convenience, not a security boundary: the API re-checks every request.
 */
export function Sidebar({ ref, open, mobile, collapsed, onCollapse, onClose, onNavigate }) {
  const { admin, role, logout } = useSession();
  const { path } = useRouter();

  const groups = NAV_GROUP_ORDER.map((group) => ({
    group,
    items: navRoutes.filter((route) => route.group === group && (!route.capability || can(role, route.capability))),
  })).filter((entry) => entry.items.length);

  const isActive = (route) =>
    route.path === '/admin' ? path === '/admin' : path === route.path || path.startsWith(`${route.path}/`);

  return (
    <aside ref={ref} id="admin-navigation" className={`admin-sidebar${open ? ' admin-sidebar-open' : ''}`} aria-label="Admin navigation" role={mobile && open ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined} inert={mobile && !open} aria-hidden={mobile && !open ? true : undefined}>
      <Link className="admin-brand" to="/admin" onClick={onNavigate}>
        <img src="/assets/venus-logo-CDOQxo_F_ze0A.png" alt="" width="40" height="40" />
        <span className="admin-brand-label">
          <b>
            NUTRI<span>HEAVEN</span>
          </b>
          <small>Commerce console</small>
        </span>
      </Link>

      <button type="button" className="admin-sidebar-collapse" onClick={mobile ? onClose : onCollapse} aria-label={mobile ? 'Close navigation' : collapsed ? 'Expand navigation' : 'Collapse navigation'} title={mobile ? 'Close navigation' : collapsed ? 'Expand navigation' : 'Collapse navigation'}>
        <Icon name={mobile ? 'close' : collapsed ? 'expand' : 'collapse'} /><span>{mobile ? 'Close navigation' : 'Collapse navigation'}</span>
      </button>
      <nav className="admin-nav">
        {groups.map(({ group, items }) => (
          <div className="admin-nav-group" key={group}>
            <p className="admin-nav-heading">{group}</p>
            {items.map((route) => (
              <Link
                key={route.id}
                to={route.path}
                onClick={onNavigate}
                title={collapsed ? route.label : undefined}
                aria-label={route.label}
                aria-current={isActive(route) ? 'page' : undefined}
                className={`admin-nav-link${isActive(route) ? ' admin-nav-link-active' : ''}`}
              >
                <span className="admin-nav-icon" aria-hidden="true">
                  <Icon name={route.id} />
                </span>
                <span className="admin-nav-label">{route.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="admin-sidebar-foot">
        <div className="admin-who">
          <b>{admin?.name ?? 'Signed in'}</b>
          <small>{admin?.email}</small>
          <Pill tone="info">{roleLabel(role)}</Pill>
        </div>
        <button type="button" className="admin-btn admin-btn-ghost admin-btn-block" onClick={logout}>
          Sign out
        </button>
        <a className="admin-sidebar-link" href="/">
          View storefront ↗
        </a>

      </div>
    </aside>
  );
}
