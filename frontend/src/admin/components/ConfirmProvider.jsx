import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';

/**
 * Promise-based confirmation for destructive actions.
 *
 * `if (await confirm({...}))` reads far better than threading an `isOpen` flag
 * plus a pending row through every page, and it makes it impossible to perform a
 * deactivation without a confirmation step in between — which is the rule
 * `ADMIN_COMMERCE_PLAN.md` sets for destructive actions.
 */
const ConfirmContext = createContext(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return context;
}

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    setRequest(options ?? {});
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((answer) => {
    resolver.current?.(answer);
    resolver.current = null;
    setRequest(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={Boolean(request)}
        title={request?.title ?? 'Are you sure?'}
        description={request?.description}
        onClose={() => settle(false)}
        size="sm"
        footer={
          <>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => settle(false)}>
              {request?.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              className={`admin-btn ${request?.tone === 'danger' ? 'admin-btn-danger' : 'admin-btn-primary'}`}
              onClick={() => settle(true)}
            >
              {request?.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        <p className="admin-hint">{request?.message ?? 'This action will be recorded against your admin account.'}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}
