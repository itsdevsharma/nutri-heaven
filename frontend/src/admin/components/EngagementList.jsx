import { useState } from 'react';
import { adminApi } from '../lib/api.js';
import { useResource, useDebounced } from '../lib/useResource.js';
import { downloadCsv } from '../lib/exportCsv.js';
import { Card } from './PageHeader.jsx';
import { DataTable } from './DataTable.jsx';
import { Pagination } from './Pagination.jsx';
import { ErrorState, LoadingBlock } from './Feedback.jsx';
export default function EngagementList({ kind }) {
  const reviews = kind === 'reviews';
  const [q, setQ] = useState(''), [status, setStatus] = useState(''), [offset, setOffset] = useState(0), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const search = useDebounced(q);
  const { data, error, loading, reload } = useResource(() => adminApi.engagement[kind]({ q: search, status, offset, limit: 25 }), [search, status, offset]);
  const columns = reviews ? [{ key: 'productSlug', header: 'Product' }, { key: 'customerName', header: 'Customer' }, { key: 'rating', header: 'Rating' }, { key: 'body', header: 'Review' }, { key: 'status', header: 'Status' }] : [{ key: 'email', header: 'Email' }, { key: 'status', header: 'Status' }, { key: 'consentAt', header: 'Consent date' }, { key: 'confirmedAt', header: 'Confirmed date' }];
  const moderate = async (id, next) => { setBusy(true); setFailure(''); try { await adminApi.engagement.moderate(id, next); await reload(); } catch (e) { setFailure(e.message); } finally { setBusy(false); } };
  const exportRows = async () => {
    setBusy(true); setFailure('');
    try {
      const rows = []; let cursor = 0;
      while (true) {
        const page = await adminApi.engagement[kind]({ q, status, offset: cursor, limit: 100 });
        rows.push(...page.items); cursor += page.items.length;
        if (!page.items.length || cursor >= page.total) break;
      }
      downloadCsv(`${kind}.csv`, columns.map(c => ({ key: c.key, label: c.header })), rows);
    } catch (e) { setFailure(e.message); } finally { setBusy(false); }
  };
  return <Card title={reviews ? 'Review moderation' : 'Newsletter subscribers'} description={reviews ? 'Search and moderate reviews across the complete list.' : 'Search subscription records. Only confirmed subscriptions are eligible for marketing.'}>
    <div className="admin-toolbar"><input className="admin-input" type="search" aria-label={`Search ${kind}`} placeholder={reviews ? 'Product, customer or review…' : 'Subscriber email…'} value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} /><select className="admin-input" aria-label={`${kind} status`} value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="">All statuses</option>{(reviews ? ['pending', 'approved', 'rejected'] : ['pending', 'subscribed', 'unsubscribed']).map(value => <option key={value}>{value}</option>)}</select><button className="admin-btn admin-btn-ghost" disabled={busy || loading} onClick={exportRows}>{busy ? 'Working…' : 'Export filtered CSV'}</button></div>
    {failure && <p role="alert">{failure}</p>}{error ? <ErrorState error={error} onRetry={reload} /> : loading ? <LoadingBlock label={`Loading ${kind}…`} /> : <><DataTable rows={data?.items ?? []} rowKey={r => r._id} columns={reviews ? [...columns, { key: 'actions', header: 'Moderate', render: r => <div className="admin-row-actions">{['approved', 'rejected'].map(next => <button key={next} className="admin-btn admin-btn-small" disabled={busy || r.status === next} onClick={() => moderate(r._id, next)}>{next === 'approved' ? 'Approve' : 'Reject'}</button>)}</div> }] : columns} /><Pagination total={data?.total ?? 0} limit={25} offset={offset} onChange={setOffset} label={kind} /></>}
  </Card>;
}
