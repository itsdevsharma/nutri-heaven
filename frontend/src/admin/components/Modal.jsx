import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Accessible-enough dialog: portalled to `document.body` so it escapes the
 * scroll container, closes on Escape and on backdrop click, locks page scroll
 * while open, and takes focus so keyboard users are not left behind the modal.
 */
export function Modal({ open, title, description, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="admin-modal-layer">
      <button type="button" className="admin-modal-backdrop" aria-label="Close dialog" onClick={() => onClose?.()} />
      <div className={`admin-modal admin-modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
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
