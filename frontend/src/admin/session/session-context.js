import { createContext, useContext } from 'react';

/**
 * Session context lives in its own module so pages can consume the hook without
 * importing the provider (which would create an import cycle the other way).
 */
export const SessionContext = createContext(null);

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
