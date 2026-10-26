import EngagementList from '../components/EngagementList.jsx';
import { downloadCsv } from '../lib/exportCsv.js';
import { useState } from 'react';
import { adminApi } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { PageHeader, Card, StatCard } from '../components/PageHeader.jsx';
import { ErrorState, LoadingBlock } from '../components/Feedback.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { formatPaise } from '../lib/format.js';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { Link } from '../router.jsx';
export default function EngagementPage() {
  const confirm = useConfirm();
  const [range, setRange] = useState({ from: '', to: '' });
  const [applied, setApplied] = useState({});
  const { data, error, loading, reload } = useResource(() => adminApi.engagement.report(applied), [applied]);
  const [failure, setFailure] = useState(''), [busy, setBusy] = useState('');
  if (loading) return <LoadingBlock label="Loading sales and engagement…" />;
  if (error) return <><ErrorState error={error} onRetry={reload} /><button className="admin-btn" onClick={() => setApplied({})}>Reset report dates</button></>;
  const report = data;
  return <><PageHeader title="Sales & engagement" description="Sales reporting, customer reviews, newsletter subscribers and catalogue checks." />
    <Card title="Report period" description="All sales and customer counts use this period, based on order creation dates in Asia/Kolkata. Maximum 366 days."><form className="admin-toolbar" onSubmit={event => { event.preventDefault(); setApplied({ ...range }); }}><label>From<input className="admin-input" type="date" required value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></label><label>To<input className="admin-input" type="date" required min={range.from} value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></label><button className="admin-btn admin-btn-primary">Apply dates</button><button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setRange({ from: '', to: '' }); setApplied({}); }}>Last 30 days</button><button type="button" className="admin-btn admin-btn-ghost" onClick={() => downloadCsv(`sales-${report.from}-${report.to}.csv`, [{ key: '_id', label: 'Date (Asia/Kolkata)' }, { key: 'orders', label: 'Paid orders' }, { key: 'revenuePaise', label: 'Revenue (paise)' }], report.daily)}>Export daily sales</button><button type="button" className="admin-btn admin-btn-ghost" onClick={() => downloadCsv('top-products.csv', [{ key: '_id', label: 'Product' }, { key: 'units', label: 'Units' }, { key: 'grossPaise', label: 'Gross product value (paise)' }], report.topProducts)}>Export top products</button></form><p>{report.from} to {report.to}</p>{report.previous && <p>Previous period ({report.previous.from} to {report.previous.to}): {formatPaise(report.previous.revenuePaise)} · {report.previous.paidOrders} paid orders. Revenue change: {formatPaise(report.revenuePaise - report.previous.revenuePaise)}.</p>}</Card>{failure && <p role="alert">{failure}</p>}<div className="admin-stat-grid"><StatCard label="Paid revenue" value={formatPaise(report.revenuePaise)} hint="Includes delivery, after discounts. Excludes cancelled, returned and refunded orders." /><StatCard label="Paid orders" value={report.paidOrders} /><StatCard label="All orders" value={report.orders} /><StatCard label="New customers" value={report.customers} /></div>
    <Card title="Daily paid sales" description="Asia/Kolkata dates, grouped by order creation date. Days without sales show zero."><DataTable rows={report.daily} rowKey={r => r._id} columns={[{ key: '_id', header: 'Date' }, { key: 'orders', header: 'Orders' }, { key: 'revenuePaise', header: 'Revenue', render: r => formatPaise(r.revenuePaise) }]} /></Card>
    <Card title="Top products" description="Units from paid orders. Product amounts are before order-level coupons and exclude shipping."><DataTable rows={report.topProducts} rowKey={r => r._id} columns={[{ key: '_id', header: 'Product' }, { key: 'units', header: 'Units' }, { key: 'grossPaise', header: 'Gross product value', render: r => formatPaise(r.grossPaise) }]} /></Card>
    <Card title="Catalogue audit" description="Review these flags and update real product content before publishing. Image relevance requires visual review."><DataTable rows={report.catalogueIssues} rowKey={r => r.slug} columns={[{ key: 'title', header: 'Product' }, { key: 'issues', header: 'Issues', render: r => r.issues.join(' · ') }, { key: 'edit', header: 'Action', render: r => <div className="admin-row-actions"><Link to={`/admin/products/${encodeURIComponent(r.slug)}`}>Review product</Link><button className="admin-btn admin-btn-small" disabled={Boolean(busy)} onClick={async () => { if (!await confirm({ title: 'Hide incomplete product?', message: `Remove ${r.title} from the storefront until its content is corrected?`, confirmLabel: 'Hide product' })) return; setBusy(r.slug); try { await adminApi.products.deactivate(r.slug); await reload(); } catch (e) { setFailure(e.message); } finally { setBusy(''); } }}>Hide from storefront</button></div> }]} /></Card>
    <EngagementList kind="reviews" /><EngagementList kind="subscribers" />
    <Card title="Transactional email"><p>{report.emailConfigured ? 'Resend is configured.' : 'Resend credentials or verified sender are missing.'} {report.pendingEmails} messages have not been sent. Automatic delivery retries run every 30 seconds, up to five attempts.</p></Card>
  </>;
}
