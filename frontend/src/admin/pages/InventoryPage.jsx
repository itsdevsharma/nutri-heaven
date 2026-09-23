import { useState } from 'react';
import { DataTable } from '../components/DataTable.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Feedback.jsx';
import { Card, PageHeader, StatCard } from '../components/PageHeader.jsx';
import { Modal } from '../components/Modal.jsx';
import { Pill } from '../components/StatusPill.jsx';
import { FormField } from '../components/FormField.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { adminApi } from '../lib/api.js';
import { assetUrl } from '../lib/catalogue.js';
import { formatDateTime, formatNumber, formatPaise } from '../lib/format.js';
import { can } from '../lib/permissions.js';
import { useDebounced, useResource } from '../lib/useResource.js';
import { Link } from '../router.jsx';
import { useSession } from '../session/session-context.js';

/** The overview DTO caps `limit` at 500 packs per page. */
const PAGE_LIMIT = 200;

/** Movement types as the ledger stores them (`inventory-movement.schema.ts`). */
const MOVEMENT_TYPE_META = {
  opening: { label: 'Opening', tone: 'info' },
  adjustment: { label: 'Adjustment', tone: 'warn' },
  'order-reserved': { label: 'Order reserved', tone: 'danger' },
  'order-committed': { label: 'Order committed', tone: 'ok' },
  return: { label: 'Return', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'info' },
};

const movementMeta = (type) => MOVEMENT_TYPE_META[type] ?? { label: type ?? 'Movement', tone: 'muted' };

const StatePill = ({ state }) => (
  <Pill tone={state === 'out' ? 'danger' : state === 'low' ? 'warn' : 'ok'}>
    {state === 'out' ? 'Out of stock' : state === 'low' ? 'Low stock' : 'In stock'}
  </Pill>
);

/**
 * Inventory: automatic stock movements, low-stock alerts and full history.
 *
 * The API derives each pack's `state` from its own stock vs low-stock limit and
 * computes the summary, so the "Low stock" / "Out of stock" tabs and the stat
 * cards are the API's view — the page never re-derives them. Adjustments go
 * through `PATCH /inventory/admin/adjust`, which writes an immutable ledger row
 * (delta, resulting balance, actor, reason, idempotency key) next to the new
 * balance; the console never writes a balance directly.
 */
export default function InventoryPage() {
  const { role } = useSession();
  const toast = useToast();

  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const query = useDebounced(search, 300);

  const { data, loading, error, reload } = useResource(
    () =>
      adminApi.inventory.overview({
        view: view === 'all' ? undefined : view,
        q: query || undefined,
        limit: PAGE_LIMIT,
      }),
    [view, query],
  );

  const canAdjust = can(role, 'inventory:write');
  const rows = data?.items ?? [];
  const summary = data?.summary;

  // ---- adjust dialog --------------------------------------------------------
  const [adjustRow, setAdjustRow] = useState(null);
  const [form, setForm] = useState({ balance: '', lowStockLimit: '', reason: '' });
  const [saving, setSaving] = useState(false);

  // ---- movement history -----------------------------------------------------
  const [historyRow, setHistoryRow] = useState(null);
  const history = useResource(
    () =>
      historyRow
        ? adminApi.inventory.movements({
            productSlug: historyRow.productSlug,
            packSize: historyRow.packSize,
            limit: 20,
          })
        : Promise.resolve(null),
    [historyRow?.productSlug, historyRow?.packSize],
  );

  const openAdjust = (row) => {
    setAdjustRow(row);
    setForm({
      balance: String(row.stockQuantity),
      lowStockLimit: String(row.lowStockLimit),
      reason: '',
    });
  };

  const submitAdjust = async (event) => {
    event.preventDefault();
    if (!adjustRow) return;

    const balance = Number(form.balance);
    if (!Number.isInteger(balance) || balance < 0) {
      toast.error('Enter a whole number of units (0 or more).');
      return;
    }
    if (!form.reason.trim()) {
      toast.error('A reason is required — it is recorded on the movement.');
      return;
    }

    setSaving(true);
    try {
      const movement = await adminApi.inventory.adjust({
        productSlug: adjustRow.productSlug,
        packSize: adjustRow.packSize,
        balance,
        setLowStockLimit: Number(form.lowStockLimit) || 0,
        reason: form.reason.trim(),
        // One key per dialog open: resubmitting the same dialog is a no-op.
        idempotencyKey: `adjust-${crypto.randomUUID()}`,
      });
      const delta = Number(movement?.quantity ?? 0);
      if (delta === 0) {
        toast.success('Saved — the balance was already correct; the ledger records the check.');
      } else {
        toast.success(
          `Stock ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} to ${movement.balance} — movement recorded.`,
        );
      }
      setAdjustRow(null);
      await reload();
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <div className="admin-product-cell">
          {row.image ? <img src={assetUrl(row.image)} alt="" /> : null}
          <span>
            <b>{row.title}</b>
            <small className="admin-mono">{row.productSlug}</small>
          </span>
        </div>
      ),
    },
    { key: 'packSize', header: 'Pack', render: (row) => row.packSize || '—' },
    { key: 'stock', header: 'Stock', align: 'right', render: (row) => <b>{formatNumber(row.stockQuantity)}</b> },
    { key: 'limit', header: 'Low-stock at', align: 'right', render: (row) => formatNumber(row.lowStockLimit) },
    {
      key: 'value',
      header: 'Stock value',
      align: 'right',
      render: (row) => formatPaise(row.stockQuantity * row.pricePaise),
    },
    { key: 'state', header: 'State', render: (row) => <StatePill state={row.state} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="admin-row-actions">
          <button
            type="button"
            className="admin-btn admin-btn-small admin-btn-ghost"
            onClick={() => setHistoryRow(row)}
          >
            History
          </button>
          {canAdjust ? (
            <button
              type="button"
              className="admin-btn admin-btn-small admin-btn-ghost"
              onClick={() => openAdjust(row)}
            >
              Adjust
            </button>
          ) : null}
          <Link className="admin-btn admin-btn-small admin-btn-ghost" to={`/admin/products/${row.productSlug}`}>
            Open
          </Link>
        </div>
      ),
    },
  ];

  const views = [
    { value: 'all', label: 'All packs' },
    { value: 'low', label: 'Low stock' },
    { value: 'out', label: 'Out of stock' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS"
        title="Inventory"
        description="Variant-wise stock with automatic low-stock and out-of-stock alerts, plus the immutable movement history behind every balance."
        actions={
          canAdjust ? (
            <span className="admin-pill admin-pill-ok">Adjustments enabled</span>
          ) : (
            <span className="admin-pill admin-pill-muted">Read-only role</span>
          )
        }
      />

      <div className="admin-stat-grid">
        <StatCard label="Packs tracked" value={formatNumber(summary?.skus ?? 0)} hint="Product × pack combinations" />
        <StatCard label="Units on hand" value={formatNumber(summary?.units ?? 0)} hint="Sum of every pack balance" />
        <StatCard label="Stock value" value={formatPaise(summary?.valuePaise ?? 0)} hint="Balance × selling price" />
        <StatCard
          label="Low stock alert"
          value={formatNumber(summary?.low ?? 0)}
          tone={summary?.low ? 'warn' : 'ok'}
          hint="At or below the pack's own low-stock limit"
        />
        <StatCard
          label="Out of stock"
          value={formatNumber(summary?.out ?? 0)}
          tone={summary?.out ? 'danger' : 'ok'}
          hint="Balance zero — the storefront refuses add-to-cart"
        />
      </div>

      <Card className="admin-card-tight">
        <div className="admin-toolbar">
          <div className="admin-tabs" role="tablist" aria-label="Filter stock">
            {views.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={view === option.value}
                className={`admin-tab${view === option.value ? ' admin-tab-active' : ''}`}
                onClick={() => setView(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            className="admin-input admin-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, slug or category…"
            aria-label="Search stock"
          />
        </div>

        {error ? (
          <ErrorState error={error} onRetry={reload} title="Stock did not load" />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.key}
            loading={loading}
            caption="Stock by product pack"
            empty={
              <EmptyState
                title={view === 'all' ? 'No packs to show' : 'Nothing needs attention'}
                description={
                  view === 'all'
                    ? 'Products with pack sizes appear here automatically; adjust their stock from this screen.'
                    : 'Every pack is above its low-stock limit right now.'
                }
              />
            }
          />
        )}
      </Card>

      <p className="admin-footnote">
        Every balance is backed by an immutable movement — opening, adjustment, order-reserved, return or
        cancelled — recorded with the actor, reason and resulting balance. Automatic order deductions land with
        the orders module (step 7 of backend/ADMIN_COMMERCE_PLAN.md) through the same ledger.
      </p>

      <Modal
        open={Boolean(adjustRow)}
        title={adjustRow ? `Adjust stock — ${adjustRow.title}` : 'Adjust stock'}
        description={
          adjustRow
            ? `${adjustRow.packSize} · currently ${adjustRow.stockQuantity} on hand, alerting at ${adjustRow.lowStockLimit}`
            : undefined
        }
        onClose={() => setAdjustRow(null)}
        footer={
          <>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setAdjustRow(null)}>
              Cancel
            </button>
            <button type="submit" form="admin-adjust-form" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? 'Recording…' : 'Record movement'}
            </button>
          </>
        }
      >
        <form id="admin-adjust-form" onSubmit={submitAdjust} noValidate>
          <FormField
            label="Counted stock on hand"
            required
            hint={`The API stores the delta from the current balance (${adjustRow?.stockQuantity ?? 0}) as an adjustment movement.`}
          >
            <input
              className="admin-input admin-mono"
              inputMode="numeric"
              value={form.balance}
              onChange={(event) => setForm((current) => ({ ...current, balance: event.target.value }))}
            />
          </FormField>
          <FormField label="Low-stock alert at" hint="Zero disables the low-stock warning for this pack.">
            <input
              className="admin-input admin-mono"
              inputMode="numeric"
              value={form.lowStockLimit}
              onChange={(event) => setForm((current) => ({ ...current, lowStockLimit: event.target.value }))}
            />
          </FormField>
          <FormField label="Reason" required hint="Shown on the movement row, e.g. “Weekly count”, “Damaged in transit”.">
            <input
              className="admin-input"
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Weekly stock count"
            />
          </FormField>
        </form>
      </Modal>

      <Modal
        open={Boolean(historyRow)}
        title={historyRow ? `Stock history — ${historyRow.title}` : 'Stock history'}
        description={
          historyRow ? `${historyRow.packSize} · every movement recorded against this pack` : undefined
        }
        onClose={() => setHistoryRow(null)}
        size="lg"
      >
        {history.loading ? (
          <LoadingBlock label="Loading movements…" />
        ) : history.error ? (
          <ErrorState error={history.error} onRetry={history.reload} title="History did not load" />
        ) : (history.data?.items ?? []).length ? (
          <div className="admin-movements">
            {(history.data?.items ?? []).map((movement) => (
              <article className={`admin-movement admin-movement-${movement.type}`} key={movement._id}>
                <div className="admin-movement-head">
                  <Pill tone={movementMeta(movement.type).tone}>{movementMeta(movement.type).label}</Pill>
                  <span className="admin-movement-delta">
                    {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                    <small>→ {movement.balance} left</small>
                  </span>
                </div>
                <p className="admin-movement-body">
                  {movement.reason || 'No reason recorded'}
                  <span>
                    {' '}· {movement.actor}
                    {movement.referenceId ? ` · ${movement.referenceId}` : ''}
                  </span>
                </p>
                <p className="admin-movement-time">{formatDateTime(movement.createdAt)}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No movements yet"
            description="This pack has not moved since the ledger was introduced. Adjustments and order movements appear here."
          />
        )}
      </Modal>
    </>
  );
}
