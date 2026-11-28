import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';

let openModalCount = 0;
let previousBodyOverflow = '';
let previousRootInert = false;


/**
 * Shared accessible dialog: portalled to `document.body` so it escapes the
 * scroll container, closes on Escape and on backdrop click, locks page scroll
 * while open, and takes focus so keyboard users are not left behind the modal.
 */
export function Modal({ open, title, description, onClose, children, footer, size = 'md', className = '' }) {
  const layerRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const root = document.getElementById('root');
    const dialog = layerRef.current?.querySelector('.admin-modal');
    if (openModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousRootInert = root?.inert ?? false;
      if (root) root.inert = true;
    }
    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    dialog?.focus({ preventScroll: true });
    const onKeyDown = event => {
      const layers = document.querySelectorAll('.admin-modal-layer');
      if (layers[layers.length - 1] !== layerRef.current) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      openModalCount -= 1;
      if (openModalCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        if (root) root.inert = previousRootInert;
      }
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="admin-modal-layer" ref={layerRef}>
      <button type="button" className="admin-modal-backdrop" tabIndex={-1} aria-label="Close dialog" onClick={() => onClose?.()} />
      <div className={`admin-modal admin-modal-${size} ${className}`.trim()} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header className="admin-modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
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
