import { useState } from 'react';
import { adminApi } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { PageHeader, Card, StatCard } from '../components/PageHeader.jsx';
import { ErrorState, LoadingBlock } from '../components/Feedback.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { formatPaise, formatDateTime } from '../lib/format.js';
import { Link } from '../router.jsx';
export default function EngagementPage() {
  const { data, error, loading, reload } = useResource(() => Promise.all([adminApi.engagement.report(), adminApi.engagement.reviews(), adminApi.engagement.subscribers()]), []);
  const [failure, setFailure] = useState(''), [busy, setBusy] = useState('');
  if (loading) return <LoadingBlock label="Loading sales and engagement…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const [report, reviews, subscribers] = data;
  const moderate = async (id, status) => { setBusy(id); setFailure(''); try { await adminApi.engagement.moderate(id, status); await reload(); } catch (e) { setFailure(e.message); } finally { setBusy(''); } };
  return <><PageHeader title="Sales & engagement" description="Sales reporting, customer reviews, newsletter subscribers and catalogue checks." />{failure && <p role="alert">{failure}</p>}<div className="admin-stat-grid"><StatCard label="Paid revenue" value={formatPaise(report.revenuePaise)} hint="Includes delivery, after discounts. Excludes cancelled, returned and refunded orders." /><StatCard label="Paid orders" value={report.paidOrders} /><StatCard label="All orders" value={report.orders} /><StatCard label="Customers" value={report.customers} /></div>
    <Card title="Daily paid sales · last 30 days" description="Asia/Kolkata dates, grouped by order creation date. Days without sales are omitted."><DataTable rows={report.daily} rowKey={r => r._id} columns={[{ key: '_id', header: 'Date' }, { key: 'orders', header: 'Orders' }, { key: 'revenuePaise', header: 'Revenue', render: r => formatPaise(r.revenuePaise) }]} /></Card>
    <Card title="Top products" description="Units from paid orders. Product amounts are before order-level coupons and exclude shipping."><DataTable rows={report.topProducts} rowKey={r => r._id} columns={[{ key: '_id', header: 'Product' }, { key: 'units', header: 'Units' }, { key: 'grossPaise', header: 'Gross product value', render: r => formatPaise(r.grossPaise) }]} /></Card>
    <Card title="Catalogue audit" description="Review these flags and update real product content before publishing. Image relevance requires visual review."><DataTable rows={report.catalogueIssues} rowKey={r => r.slug} columns={[{ key: 'title', header: 'Product' }, { key: 'issues', header: 'Issues', render: r => r.issues.join(' · ') }, { key: 'edit', header: 'Action', render: r => <Link to={`/admin/products/${encodeURIComponent(r.slug)}`}>Review product</Link> }]} /></Card>
    <Card title="Review moderation" description="Latest 500 reviews. Only approved reviews appear publicly."><DataTable rows={reviews} rowKey={r => r._id} columns={[{ key: 'productSlug', header: 'Product' }, { key: 'customerName', header: 'Customer' }, { key: 'rating', header: 'Rating' }, { key: 'body', header: 'Review' }, { key: 'status', header: 'Status' }, { key: 'actions', header: 'Moderate', render: r => <div className="admin-row-actions"><button className="admin-btn admin-btn-small" disabled={busy === r._id || r.status === 'approved'} onClick={() => moderate(r._id, 'approved')}>Approve</button><button className="admin-btn admin-btn-small" disabled={busy === r._id || r.status === 'rejected'} onClick={() => moderate(r._id, 'rejected')}>Reject</button></div> }]} /></Card>
    <Card title="Newsletter subscribers" description="Latest 1,000 records. Only confirmed subscriptions are eligible for marketing email."><DataTable rows={subscribers} rowKey={r => r._id} columns={[{ key: 'email', header: 'Email' }, { key: 'status', header: 'Status' }, { key: 'consentAt', header: 'Consent', render: r => formatDateTime(r.consentAt) }, { key: 'confirmedAt', header: 'Confirmed', render: r => formatDateTime(r.confirmedAt) }]} /></Card>
    <Card title="Transactional email"><p>{report.emailConfigured ? 'Resend is configured.' : 'Resend credentials or verified sender are missing.'} {report.pendingEmails} messages have not been sent. Automatic delivery retries run every 30 seconds, up to five attempts.</p></Card>
  </>;
}
