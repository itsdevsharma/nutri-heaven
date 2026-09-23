/**
 * The four states every data-driven screen has to render.
 *
 * Pages render `<LoadingBlock />`, `<ErrorState />`, `<EmptyState />` or content,
 * so "loading" and "failed" can never be silently mistaken for "no rows".
 */

export function Spinner({ label = 'Loading' }) {
  return <span className="admin-spinner" role="status" aria-label={label} />;
}

export function LoadingBlock({ label = 'Loading…', rows = 3 }) {
  return (
    <div className="admin-loading" role="status" aria-live="polite">
      <span className="admin-loading-label">
        <Spinner label={label} /> {label}
      </span>
      {Array.from({ length: rows }, (_, index) => (
        <span className="admin-skeleton" key={index} />
      ))}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action, icon = '◌' }) {
  return (
    <div className="admin-empty">
      <span className="admin-empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'That did not work' }) {
  const message = error?.message ?? 'Something went wrong.';
  return (
    <div className="admin-error" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {error?.status === 403 ? (
          <p className="admin-hint">
            Ask a super admin to grant your role the matching permission.
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => onRetry()}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
