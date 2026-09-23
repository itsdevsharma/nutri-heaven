import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AdminApp from './admin/AdminApp.jsx';
// Load order matters: the storefront's global stylesheet comes first and the
// admin stylesheet second, so the console can override the shared element rules
// (`body`, `h1`, `h2`) without a fight of `!important` declarations.
import '../style.css';
import './admin/admin.css';

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
  <StrictMode>{isAdmin ? <AdminApp /> : <App />}</StrictMode>,
);

