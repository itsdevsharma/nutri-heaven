import { Card, PageHeader } from '../components/PageHeader.jsx';
import { Link } from '../router.jsx';
import { roleLabel } from '../lib/permissions.js';

/**
 * Rendered inside the shell when a URL matches no route, and when a route
 * exists but the signed-in role lacks the capability it declares. Both keep the
 * navigation visible so the operator is never stuck on a dead end.
 */

export function NotFoundPage({ path }) {
  return (
    <>
      <PageHeader eyebrow="404" title="No such screen" description={`Nothing is routed at ${path}.`} />
      <Card>
        <p className="admin-hint">
          The console routes live in <code>frontend/src/admin/routes.jsx</code>. If you followed a
          bookmark, the module may have been renamed.
        </p>
        <Link className="admin-btn admin-btn-primary" to="/admin">
          Back to dashboard
        </Link>
      </Card>
    </>
  );
}

export function ForbiddenPage({ route, role }) {
  return (
    <>
      <PageHeader
        eyebrow="403"
        title="Not available for your role"
        description={`“${route?.title ?? 'This module'}” needs the ${route?.capability ?? 'missing'} permission.`}
      />
      <Card title="What to do next">
        <p className="admin-hint">
          You are signed in as <b>{roleLabel(role)}</b>. The API enforces the same rule, so the button
          would fail even if the console showed it. A super admin can grant the matching role.
        </p>
        <Link className="admin-btn admin-btn-primary" to="/admin">
          Back to dashboard
        </Link>
      </Card>
    </>
  );
}
