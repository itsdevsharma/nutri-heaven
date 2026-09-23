import { useEffect } from 'react';
import { AdminLayout } from './components/AdminLayout.jsx';
import { ConfirmProvider } from './components/ConfirmProvider.jsx';
import { ToastProvider } from './components/ToastProvider.jsx';
import { ForbiddenPage, NotFoundPage } from './pages/SystemPages.jsx';
import { can } from './lib/permissions.js';
import { ROUTES } from './routes.jsx';
import { matchRoutes, RouterProvider, useRouter } from './router.jsx';
import { SessionProvider } from './session/SessionProvider.jsx';
import { useSession } from './session/session-context.js';

/**
 * Screen resolution, in one place:
 *
 * - no session + protected route → replace with `/admin/login`
 * - session + the login screen  → replace with `/admin`
 * - unknown path                → 404 inside the shell
 * - known path, missing role    → 403 inside the shell
 *
 * Redirects are effects rather than render-time navigation because the router is
 * a plain History-API wrapper; the single render before the effect returns `null`,
 * which is one frame of empty shell instead of a crashed tree.
 */
function Routed() {
  const { path, navigate } = useRouter();
  const { session, role } = useSession();

  const match = matchRoutes(ROUTES, path);
  const route = match?.route ?? null;
  const isPublic = route?.public === true;

  useEffect(() => {
    if (!session && !isPublic) navigate('/admin/login', { replace: true });
    else if (session && isPublic) navigate('/admin', { replace: true });
  }, [session, isPublic, navigate]);

  if (isPublic) {
    if (session) return null;
    const PublicPage = route.element;
    return <PublicPage />;
  }

  if (!session) return null;

  if (!route) {
    return (
      <AdminLayout route={{ title: 'Not found' }}>
        <NotFoundPage path={path} />
      </AdminLayout>
    );
  }

  if (route.capability && !can(role, route.capability)) {
    return (
      <AdminLayout route={route}>
        <ForbiddenPage route={route} role={role} />
      </AdminLayout>
    );
  }

  const Page = route.element;
  return (
    <AdminLayout route={route}>
      <Page params={match.params} route={route} />
    </AdminLayout>
  );
}

/**
 * Root of the admin area. Providers nest outside-in so every page has toasts,
 * the session and confirmations available; the router is innermost because the
 * sidebar needs the session to filter navigation.
 */
export default function AdminApp() {
  return (
    <ToastProvider>
      <SessionProvider>
        <ConfirmProvider>
          <RouterProvider>
            <Routed />
          </RouterProvider>
        </ConfirmProvider>
      </SessionProvider>
    </ToastProvider>
  );
}
