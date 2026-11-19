import EngagementList from '../components/EngagementList.jsx';
import EmailDeliveryQueue from '../components/EmailDeliveryQueue.jsx';
import { downloadCsv } from '../lib/exportCsv.js';
import { useState } from 'react';
import { adminApi } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { PageHeader, Card, StatCard } from '../components/PageHeader.jsx';
import { ErrorState, LoadingBlock } from '../components/Feedback.jsx';
import { Pagination } from '../components/Pagination.jsx';
import '../engagement.css';
import { DataTable } from '../components/DataTable.jsx';
import { formatPaise } from '../lib/format.js';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { Link } from '../router.jsx';
const formatReportDate = value => new Date(`${value}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function EngagementPage() {
  const confirm = useConfirm();
  const [range, setRange] = useState({ from: '', to: '' });
  const [applied, setApplied] = useState({});
  const [dailyOffset, setDailyOffset] = useState(0);
  const [salesOnly, setSalesOnly] = useState(false);
  const { data, error, loading, reload } = useResource(() => adminApi.engagement.report(applied), [applied]);
  const [failure, setFailure] = useState(''), [busy, setBusy] = useState('');
  if (loading) return <LoadingBlock label="Loading sales and engagement…" />;
  if (error) return <><ErrorState error={error} onRetry={reload} /><button className="admin-btn" onClick={() => setApplied({})}>Reset report dates</button></>;
  const report = data;
  const daily = [...report.daily].filter(day => !salesOnly || day.orders > 0).sort((a, b) => b._id.localeCompare(a._id));
  const change = report.previous ? report.revenuePaise - report.previous.revenuePaise : 0;
  const applyDates = event => {
    event.preventDefault();
    const from = range.from || report.from, to = range.to || report.to;
    const input = event.currentTarget.elements.to;
    input.setCustomValidity((Date.parse(to) - Date.parse(from)) / 86400000 >= 366 ? 'Choose a report period of 366 days or fewer.' : '');
    if (!event.currentTarget.reportValidity()) return;
    setDailyOffset(0);
    setApplied({ from, to });
  };
  return <div className="admin-engagement-page"><PageHeader title="Sales & engagement" description="Track paid sales, review customer feedback and manage subscribers." />
    <Card className="engagement-period" title="Report period" description="Order creation dates · Asia/Kolkata · Up to 366 days">
      <form className="engagement-date-form" onSubmit={applyDates}>
        <label htmlFor="report-from">From<input id="report-from" name="from" className="admin-input" type="date" required max={range.to || report.to} value={range.from || report.from} onChange={e => { setRange({ ...range, from: e.target.value }); e.currentTarget.form.elements.to.setCustomValidity(''); }} /></label>
        <label htmlFor="report-to">To<input id="report-to" name="to" className="admin-input" type="date" required min={range.from || report.from} value={range.to || report.to} onChange={e => { setRange({ ...range, to: e.target.value }); e.currentTarget.setCustomValidity(''); }} /></label>
        <button className="admin-btn admin-btn-primary">Apply dates</button>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setRange({ from: '', to: '' }); setApplied({}); setDailyOffset(0); }}>Last 30 days</button>
      </form>
      <div className="engagement-period-summary"><strong>{formatReportDate(report.from)} – {formatReportDate(report.to)}</strong>{report.previous && <span>Compared with {formatReportDate(report.previous.from)} – {formatReportDate(report.previous.to)}</span>}</div>
    </Card>
    {failure && <p role="alert">{failure}</p>}
    <div className="admin-stat-grid engagement-metrics">
      <StatCard label="Paid revenue" value={formatPaise(report.revenuePaise)} foot={report.previous ? `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatPaise(Math.abs(change))} vs previous period` : undefined} />
      <StatCard label="Paid orders" value={report.paidOrders} foot={report.previous ? `${report.previous.paidOrders} in previous period` : undefined} />
      <StatCard label="All orders" value={report.orders} foot="All payment and fulfilment statuses" />
      <StatCard label="New customers" value={report.customers} foot="Registered during this period" />
    </div>
    <p className="admin-hint engagement-revenue-note">Paid revenue includes delivery, after discounts. Cancelled, returned and refunded orders are excluded.</p>
    <div className="engagement-sales-grid">
      <Card className="engagement-sales" title="Daily paid sales" description="Most recent first · Order creation date" actions={<button type="button" className="admin-btn admin-btn-ghost admin-btn-small" onClick={() => downloadCsv(`sales-${report.from}-${report.to}.csv`, [{ key: '_id', label: 'Date (Asia/Kolkata)' }, { key: 'orders', label: 'Paid orders' }, { key: 'revenuePaise', label: 'Revenue (paise)' }], report.daily)}>Export daily sales</button>}>
        <div className="engagement-table-tools"><label><input type="checkbox" checked={salesOnly} onChange={event => { setSalesOnly(event.target.checked); setDailyOffset(0); }} />Days with sales only</label><span>{daily.length} {daily.length === 1 ? 'day' : 'days'}</span></div>
        <DataTable caption="Daily paid sales" rows={daily.slice(dailyOffset, dailyOffset + 7)} rowKey={r => r._id} empty={<p className="engagement-empty">No paid sales in this period. Clear the filter to see all days.</p>} columns={[{ key: '_id', header: 'Date', render: r => formatReportDate(r._id) }, { key: 'orders', header: 'Paid orders', align: 'right' }, { key: 'revenuePaise', header: 'Revenue', align: 'right', render: r => <span className={r.orders ? 'engagement-sale-value' : 'admin-muted'}>{formatPaise(r.revenuePaise)}</span> }]} />
        <Pagination total={daily.length} limit={7} offset={dailyOffset} onChange={setDailyOffset} label="days" />
      </Card>
      <Card className="engagement-products" title="Top products" description="Paid units · Before order-level coupons and shipping" actions={<button type="button" className="admin-btn admin-btn-ghost admin-btn-small" onClick={() => downloadCsv('top-products.csv', [{ key: '_id', label: 'Product' }, { key: 'units', label: 'Units' }, { key: 'grossPaise', label: 'Gross product value (paise)' }], report.topProducts)}>Export top products</button>}>
        <DataTable caption="Top products by paid units" rows={report.topProducts} rowKey={r => r._id} empty={<p className="engagement-empty">No products from paid orders in this period.</p>} columns={[{ key: '_id', header: 'Product' }, { key: 'units', header: 'Units', align: 'right' }, { key: 'grossPaise', header: 'Gross value', align: 'right', render: r => formatPaise(r.grossPaise) }]} />
      </Card>
    </div>
    <Card title="Catalogue audit" description="Review these flags and update real product content before publishing. Image relevance requires visual review."><DataTable empty={<p className="engagement-empty">No catalogue issues flagged. Product images still need visual review before publishing.</p>} rows={report.catalogueIssues} rowKey={r => r.slug} columns={[{ key: 'title', header: 'Product' }, { key: 'issues', header: 'Issues', render: r => r.issues.join(' · ') }, { key: 'edit', header: 'Action', render: r => <div className="admin-row-actions"><Link to={`/admin/products/${encodeURIComponent(r.slug)}`}>Review product</Link><button className="admin-btn admin-btn-small" disabled={Boolean(busy)} onClick={async () => { if (!await confirm({ title: 'Hide incomplete product?', message: `Remove ${r.title} from the storefront until its content is corrected?`, confirmLabel: 'Hide product' })) return; setBusy(r.slug); try { await adminApi.products.deactivate(r.slug); await reload(); } catch (e) { setFailure(e.message); } finally { setBusy(''); } }}>Hide from storefront</button></div> }]} /></Card>
    <EngagementList kind="reviews" /><EngagementList kind="subscribers" />
    <EmailDeliveryQueue configured={report.emailConfigured} pending={report.pendingEmails} onRetried={reload} />
  </div>;
}
