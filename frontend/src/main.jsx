import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Load order matters: the storefront's global stylesheet comes first and the
// admin stylesheet second, so the console can override the shared element rules
// (`body`, `h1`, `h2`) without a fight of `!important` declarations.
import './theme.css';
import '../style.css';
import './admin/admin.css';
import './storefront-theme.css';
import { registerAppWorker } from './pwa.js';
import { configureAppManifest } from './app-manifest.js';

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

configureAppManifest(document, window.location.pathname);

if (import.meta.env.PROD) registerAppWorker();

/**
 * Two surfaces, one bundle.
 *
 * `/admin/*` is the staff console; everything else is the customer storefront.
 * The decision is made here rather than at the top of `App` for two reasons: the
 * storefront's hooks (cart fetch, carousel interval) must never run for an admin
 * session, and `App` keeps an unconditional hook order — an early `return` before
 * its `useState`/`useEffect` calls would break the rules of hooks.
 */
const isAdmin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

createRoot(document.getElementById('root')).render(
  <StrictMode><Suspense fallback={<div className="nh-app-loading" role="status">Loading Nutri Heaven…</div>}>{isAdmin ? <AdminApp /> : <App />}</Suspense></StrictMode>,
);

