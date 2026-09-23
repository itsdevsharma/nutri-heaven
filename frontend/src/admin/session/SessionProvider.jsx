import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, setUnauthorizedHandler, sessionStore } from '../lib/api.js';
import { SessionContext } from './session-context.js';

/**
 * Owns the signed-in admin.
 *
 * Two responsibilities only: hold the session, and own the reaction to a 401.
 * Because the API client routes every unauthorised response through
 * `setUnauthorizedHandler`, an expired 15-minute token signs the operator out
 * once and drops them on the login screen with an explanation — instead of each
 * page surfacing its own "Request failed with status 401" banner.
 *
 * `notice` is that explanation, and it is deliberately short-lived state rather
 * than a toast, because the login page is where the operator lands next.
 */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(() => sessionStore.read());
  const [notice, setNotice] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      sessionStore.clear();
      setSession(null);
      setNotice('Your session expired. Please sign in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email, password) => {
    setSigningIn(true);
    try {
      const next = await adminApi.login(email, password);
      sessionStore.write(next);
      setSession(next);
      setNotice('');
      return next;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    sessionStore.clear();
    setSession(null);
    setNotice('You have been signed out.');
  }, []);

  const value = useMemo(
    () => ({
      session,
      admin: session?.admin ?? null,
      role: session?.admin?.role ?? null,
      notice,
      dismissNotice: () => setNotice(''),
      signingIn,
      login,
      logout,
    }),
    [session, notice, signingIn, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
