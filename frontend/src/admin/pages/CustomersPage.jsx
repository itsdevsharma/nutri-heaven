import { useState } from 'react';
import { PageHeader, Card } from '../components/PageHeader.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { ErrorState, EmptyState, LoadingBlock } from '../components/Feedback.jsx';
import { FormField, FormGrid } from '../components/FormField.jsx';
import { Modal } from '../components/Modal.jsx';
import { Pill } from '../components/StatusPill.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { adminApi } from '../lib/api.js';
import { can } from '../lib/permissions.js';
import { formatDateTime, formatPaise } from '../lib/format.js';
import { useResource, useDebounced } from '../lib/useResource.js';
import { useSession } from '../session/session-context.js';
import '../customer-details.css';

function CustomerDetails({ id, onClose, onSaved }) {
  const { role } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useResource(() => adminApi.customers.get(id), [id]);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const form = draft ?? { name: data?.name ?? '', phone: data?.phone ?? '' };
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try { await adminApi.customers.update(id, { name: form.name.trim(), phone: form.phone.trim() }); toast.success('Customer details saved.'); setDraft(null); await reload(); await onSaved(); }
    catch (failure) { toast.error(failure.message); }
    finally { setSaving(false); }
  };
  const toggle = async () => {
    if (!await confirm({ title: `${data.isActive ? 'Deactivate' : 'Reactivate'} ${data.name}?`, message: data.isActive ? 'The customer will lose account access immediately. Their orders and saved details will be kept.' : 'The customer can sign in again. Previously revoked sessions will remain invalid.', confirmLabel: data.isActive ? 'Deactivate' : 'Reactivate', tone: data.isActive ? 'danger' : 'default' })) return;
    setSaving(true);
    try { await adminApi.customers.status(id, !data.isActive); toast.success('Customer access updated.'); await reload(); await onSaved(); }
    catch (failure) { toast.error(failure.message); }
    finally { setSaving(false); }
  };
  return <Modal open size="lg" className="admin-customer-details" title={data?.name ?? 'Customer details'} description="Contact details, saved addresses and order history." onClose={() => { if (!saving) onClose(); }} footer={<><button className="admin-btn admin-btn-ghost" disabled={saving} onClick={onClose}>Close</button>{data && <button className="admin-btn admin-btn-primary" type="submit" form="admin-customer-form" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>}</>}>
    {loading ? <LoadingBlock label="Loading customer…" /> : error ? <ErrorState error={error} onRetry={reload} /> : data && <>
      <div className="admin-customer-summary">
        <div className="admin-customer-avatar" aria-hidden="true">{data.name?.trim().charAt(0).toUpperCase() || 'C'}</div>
        <div className="admin-customer-identity"><span>{data.email}</span><p className="admin-hint">Joined {formatDateTime(data.createdAt)}</p></div>
        <Pill tone={data.isActive ? 'ok' : 'muted'}>{data.isActive ? 'Active' : 'Inactive'}</Pill>
      </div>
      <section className="admin-customer-section" aria-labelledby="customer-contact-heading">
        <div className="admin-customer-section-head"><h3 id="customer-contact-heading">Contact details</h3><span className="admin-hint">Editable information</span></div>
        <form id="admin-customer-form" onSubmit={save}><FormGrid>
          <FormField label="Name" required><input className="admin-input" aria-label="Name" autoComplete="name" value={form.name} required minLength={2} maxLength={100} disabled={saving} onChange={(event) => setDraft({ ...form, name: event.target.value })} /></FormField>
          <FormField label="Phone" hint="10 digits, or leave blank."><input className="admin-input" aria-label="Phone" aria-describedby="customer-phone-hint" autoComplete="tel-national" inputMode="numeric" type="tel" pattern="[0-9]{10}" maxLength={10} disabled={saving} value={form.phone} onChange={(event) => setDraft({ ...form, phone: event.target.value })} /></FormField>
        </FormGrid><span id="customer-phone-hint" className="admin-visually-hidden">10 digits, or leave blank.</span></form>
      </section>
      <section className="admin-customer-section" aria-labelledby="customer-addresses-heading">
        <div className="admin-customer-section-head"><h3 id="customer-addresses-heading">Saved addresses <span className="admin-customer-count">{data.addresses.length}</span></h3></div>
        {data.addresses.length ? <div className="admin-customer-addresses">{data.addresses.map((address) => <article className="admin-customer-address" key={address.id}>
          <div className="admin-customer-address-label"><strong>{address.label}</strong>{address.isDefault && <Pill>Default</Pill>}</div>
          <p>{address.name} <span className="admin-muted">· {address.phone}</span></p>
          <address>{address.street}{address.landmark ? `, ${address.landmark}` : ''}<br />{address.city}, {address.state} {address.pin}</address>
        </article>)}</div> : <p className="admin-hint">No saved addresses.</p>}
      </section>
      <section className="admin-customer-section" aria-labelledby="customer-orders-heading">
        <div className="admin-customer-section-head"><h3 id="customer-orders-heading">Order history <span className="admin-customer-count">{data.orders.length}</span></h3>{data.orders.length > 0 && <span className="admin-hint admin-customer-scroll-hint">Scroll to view all columns</span>}</div>
        <div className="admin-customer-orders" role="region" aria-label="Customer order history" tabIndex={data.orders.length ? 0 : undefined}><DataTable caption="Customer order history" rows={data.orders} rowKey={(order) => order._id} empty={<EmptyState title="No orders yet" description="Orders will appear here after the customer checks out." />} columns={[
          { key: 'id', header: 'Order', render: (order) => <span className="admin-customer-order-id">{order.id}</span> },
          { key: 'createdAt', header: 'Placed', render: (order) => <span className="admin-customer-order-date">{formatDateTime(order.createdAt)}</span> },
          { key: 'status', header: 'Status', render: (order) => <Pill tone={({ confirmed: 'info', delivered: 'ok', cancelled: 'muted', shipped: 'info', pending: 'warn' })[order.status] ?? 'muted'}>{order.status}</Pill> },
          { key: 'paymentStatus', header: 'Payment', render: (order) => <Pill tone={({ paid: 'ok', pending: 'warn', failed: 'danger', refunded: 'muted' })[order.paymentStatus] ?? 'muted'}>{order.paymentStatus}</Pill> },
          { key: 'totalPaise', header: 'Total', align: 'right', render: (order) => formatPaise(order.totalPaise) },
        ]} /></div>
      </section>
      {can(role, 'customers:status') && <div className="admin-customer-access"><div><strong>Account access</strong><p className="admin-hint">{data.isActive ? 'Deactivating prevents sign-in. Orders and saved details are kept.' : 'Reactivate this account to allow the customer to sign in again.'}</p></div><button className={`admin-btn ${data.isActive ? 'admin-btn-quiet' : 'admin-btn-ghost'}`} disabled={saving} onClick={toggle}>{data.isActive ? 'Deactivate account' : 'Reactivate account'}</button></div>}
    </>}
  </Modal>;
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const q = useDebounced(search);
  const limit = 25;
  const { data, loading, error, reload } = useResource(() => adminApi.customers.list({ q, status, offset, limit }), [q, status, offset]);
  return <>
    <PageHeader eyebrow="OPERATIONS" title="Customers" description="Manage storefront customer accounts, contact details and order history." />
    <Card title="Customer accounts" description={`${data?.total ?? 0} matching customers. Order count and order value exclude cancelled orders.`}>
      <FormGrid>
        <FormField label="Search"><input className="admin-input" type="search" value={search} maxLength={100} placeholder="Name, email or phone" onChange={(event) => { setSearch(event.target.value); setOffset(0); }} /></FormField>
        <FormField label="Status"><select className="admin-input" value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="">All customers</option><option value="active">Active</option><option value="inactive">Inactive</option></select></FormField>
      </FormGrid>
      {error ? <ErrorState error={error} onRetry={reload} /> : <DataTable loading={loading} rows={data?.items ?? []} rowKey={(customer) => customer.id} empty={<EmptyState title="No customers found" description="Customers appear here when they register on the storefront. Try adjusting your filters." />} columns={[
        { key: 'name', header: 'Name' }, { key: 'email', header: 'Email' }, { key: 'phone', header: 'Phone', render: (customer) => customer.phone || '—' },
        { key: 'isActive', header: 'Status', render: (customer) => <Pill tone={customer.isActive ? 'ok' : 'muted'}>{customer.isActive ? 'Active' : 'Inactive'}</Pill> },
        { key: 'orders', header: 'Orders' }, { key: 'totalSpendingPaise', header: 'Order value', render: (customer) => formatPaise(customer.totalSpendingPaise) },
        { key: 'lastOrder', header: 'Last order', render: (customer) => formatDateTime(customer.lastOrder) },
        { key: 'actions', header: 'Actions', render: (customer) => <button className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => setSelectedId(customer.id)}>Manage</button> },
      ]} />}
      {!loading && !error && <Pagination total={data?.total ?? 0} limit={limit} offset={offset} onChange={setOffset} label="customers" />}
    </Card>
    {selectedId && <CustomerDetails key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} onSaved={reload} />}
  </>;
}
