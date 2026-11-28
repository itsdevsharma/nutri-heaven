import { LoadingBlock, EmptyState } from './Feedback.jsx';

/**
 * Columns are data, not markup: `{ key, header, render(row), align, width }`.
 * The table itself only decides presentation, so list pages stay about content.
 */
export function DataTable({ columns, rows, rowKey, loading, empty, onRowClick, caption }) {
  if (loading) return <LoadingBlock label="Loading rows…" rows={4} />;
  if (!rows?.length) return empty ?? <EmptyState />;

  return (
    <div className="admin-table-wrap" role="region" aria-label={caption || 'Data table'} tabIndex={0}>
      <table className={`admin-table${columns.length > 7 ? ' admin-table-wide' : ''}`}>
        {caption ? <caption className="admin-visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align ? `admin-align-${column.align}` : undefined}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey ? rowKey(row) : index}
              className={onRowClick ? 'admin-row-clickable' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick(row); } } : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.align ? `admin-align-${column.align}` : undefined}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
