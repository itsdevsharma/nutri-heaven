import { useState } from 'react';
import { FormField } from '../components/FormField.jsx';
import { API_URL } from '../lib/api.js';
import { useSession } from '../session/session-context.js';

/**
 * The console's only public screen.
 *
 * Validation mirrors the backend so the operator gets the answer before a round
 * trip: `LoginRequest` is an email plus a 12+ character password. On success this
 * component does *no* navigation — `AdminApp` redirects once the session exists,
 * which keeps "where do I land after sign-in" in exactly one place.
 */
export default function LoginPage() {
  const { login, signingIn, notice, dismissNotice } = useSession();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    dismissNotice();

    if (!form.email.trim() || !form.password) {
      setError('Email and password are both required.');
      return;
    }
    if (form.password.length < 12) {
      setError('Admin passwords are at least 12 characters long.');
      return;
    }

    try {
      await login(form.email.trim().toLowerCase(), form.password);
    } catch (failure) {
      setError(failure.message);
    }
  };

  return (
    <main className="admin-login">
      <section className="admin-login-card">
        <header className="admin-login-brand">
          <img src="/assets/venus-logo-CDOQxo_F_ze0A.png" alt="" width="52" height="52" />
          <span>
            <b>
              NUTRI<span>HEAVEN</span>
            </b>
            <small>Commerce console</small>
          </span>
        </header>

        <h1>Sign in</h1>
        <p className="admin-login-lede">
          Catalogue, categories and inventory for the Nutri Heaven storefront. Your role decides which
          modules open.
        </p>

        {notice ? <div className="admin-alert admin-alert-info">{notice}</div> : null}
        {error ? (
          <div className="admin-alert admin-alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={submit} noValidate>
          <FormField label="Work email" required>
            <input
              className="admin-input"
              type="email"
              name="email"
              value={form.email}
              onChange={change}
              autoComplete="username"
              placeholder="admin@example.com"
              required
            />
          </FormField>

          <FormField label="Password" required hint="At least 12 characters, as seeded by ADMIN_PASSWORD.">
            <input
              className="admin-input"
              type="password"
              name="password"
              value={form.password}
              onChange={change}
              autoComplete="current-password"
              required
            />
          </FormField>

          <button type="submit" className="admin-btn admin-btn-primary admin-btn-block" disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <footer className="admin-login-foot">
          <p>Access is limited to Nutri Heaven staff.</p>
          <p className="admin-mono">{API_URL}</p>
        </footer>
      </section>
    </main>
  );
}
