/**
 * Offset pagination over the API's `limit`/`offset` contract. The API returns
 * `total`, so the console can show "1–25 of 132" and disable the ends instead of
 * guessing whether another page exists.
 */
export function Pagination({ total, limit, offset, onChange, label = 'rows' }) {
  if (!total) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  const canGoBack = offset > 0;
  const canGoForward = offset + limit < total;

  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <span className="admin-pagination-count">
        {from}–{to} of {total} {label}
      </span>
      <div className="admin-pagination-controls">
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          disabled={!canGoBack}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          ← Previous
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          disabled={!canGoForward}
          onClick={() => onChange(offset + limit)}
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
