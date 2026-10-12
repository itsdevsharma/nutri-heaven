import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

let openModalCount = 0;
let previousBodyOverflow = '';


/**
 * Accessible-enough dialog: portalled to `document.body` so it escapes the
 * scroll container, closes on Escape and on backdrop click, locks page scroll
 * while open, and takes focus so keyboard users are not left behind the modal.
 */
export function Modal({ open, title, description, onClose, children, footer, size = 'md' }) {
  const layerRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    layerRef.current?.querySelector('.admin-modal')?.focus({ preventScroll: true });
    return () => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      const layers = document.querySelectorAll('.admin-modal-layer');
      if (layers[layers.length - 1] !== layerRef.current) return;
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'Tab') {
        const controls = [...layerRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(control => control.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === layerRef.current.querySelector('.admin-modal'))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    // Nested confirmation dialogs share one scroll lock, regardless of cleanup order.
    if (openModalCount === 0) previousBodyOverflow = document.body.style.overflow;
    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      openModalCount -= 1;
      if (openModalCount === 0) document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="admin-modal-layer" ref={layerRef}>
      <button type="button" className="admin-modal-backdrop" aria-label="Close dialog" onClick={() => onClose?.()} />
      <div className={`admin-modal admin-modal-${size}`} role="dialog" tabIndex={-1} aria-modal="true" aria-label={title}>
        <header className="admin-modal-head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="admin-icon-btn" onClick={() => onClose?.()} aria-label="Close dialog">
            ×
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
        {footer ? <footer className="admin-modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
