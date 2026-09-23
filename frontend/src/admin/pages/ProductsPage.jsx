import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable.jsx';
import { EmptyState, ErrorState } from '../components/Feedback.jsx';
import { Card, PageHeader } from '../components/PageHeader.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { Flags, StatusPill } from '../components/StatusPill.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { adminApi } from '../lib/api.js';
import { PRODUCT_STATUSES, assetUrl, productStatusMeta, variantTotals } from '../lib/catalogue.js';
import { formatDateTime, formatPaise, formatNumber } from '../lib/format.js';
import { can } from '../lib/permissions.js';
import { useDebounced, useResource } from '../lib/useResource.js';
import { Link } from '../router.jsx';
import { useSession } from '../session/session-context.js';

const PAGE_SIZE = 25;

/** Cheapest-to-dearest sellable price, so a pack matrix reads at a glance. */
function priceRange(product) {
  const prices = (product.variants ?? [])
    .map((variant) => Number(variant.pricePaise))
    .filter(Number.isFinite);
  const pool = prices.length ? prices : [Number(product.pricePaise ?? 0)];
  const min = Math.min(...pool);
  const max = Math.max(...pool);
  return min === max ? formatPaise(min) : `${formatPaise(min)} – ${formatPaise(max)}`;
}

/**
 * Catalogue list across every lifecycle state.
 *
 * Status, search term and page are component state that goes straight to
 * `GET /products/admin`, so filtering and counting happen in MongoDB rather than
 * over a client-side copy of the catalogue. The search box is debounced —
 * otherwise every keystroke would be its own request.
 */
export default function ProductsPage() {
  const { role } = useSession();
  const toast = useToast();
  const confirm = useConfirm();

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [busySlug, setBusySlug] = useState('');
  const query = useDebounced(search, 300);

  // A new filter invalidates the current page number.
  useEffect(() => setOffset(0), [status, query]);

  const { data, loading, error, reload } = useResource(
    () =>
      adminApi.products.list({
        status: status || undefined,
        q: query || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    [status, query, offset],
  );

  const canWrite = can(role, 'catalogue:write');
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtered = Boolean(status || query);

  const tabs = useMemo(
    () => [
      { value: '', label: 'All' },
      ...PRODUCT_STATUSES.map((value) => ({ value, label: productStatusMeta(value).label })),
    ],
    [],
  );

  const duplicate = async (product) => {
    setBusySlug(product.slug);
    try {
      const copy = await adminApi.products.duplicate(product.slug);
      toast.success(`Duplicated as “${copy.slug}” — the copy arrives as an inactive draft.`);
      await reload();
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusySlug('');
    }
  };

  const deactivate = async (product) => {
    const confirmed = await confirm({
      title: `Deactivate “${product.title}”?`,
      message:
        'It disappears from the storefront but stays in the catalogue, so nothing is deleted and the change remains traceable.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBusySlug(product.slug);
    try {
      await adminApi.products.deactivate(product.slug);
      toast.success(`“${product.title}” is now inactive.`);
      await reload();
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusySlug('');
    }
  };

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (product) => (
        <div className="admin-product-cell">
          {product.image ? <img src={assetUrl(product.image)} alt="" /> : null}
          <span>
            <b>{product.title}</b>
            <small className="admin-mono">/{product.slug}</small>
          </span>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (product) => product.category ?? '—' },
    { key: 'price', header: 'Price', align: 'right', render: priceRange },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      render: (product) => {
        const totals = variantTotals(product);
        const packs = (product.variants ?? []).length;
        return (
          <>
            <b>{formatNumber(totals.stock)}</b>
            <small className="admin-cell-note">
              {packs === 1 ? '1 pack' : `${packs} packs`}
              {totals.outOfStock ? ` · ${totals.outOfStock} out` : ''}
            </small>
          </>
        );
      },
    },
    { key: 'status', header: 'Status', render: (product) => <StatusPill status={product.status} /> },
    { key: 'flags', header: 'Flags', render: (product) => <Flags product={product} /> },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (product) => <span className="admin-muted">{formatDateTime(product.updatedAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (product) => (
        <div className="admin-row-actions">
          <Link className="admin-btn admin-btn-small admin-btn-ghost" to={`/admin/products/${product.slug}`}>
            {canWrite ? 'Edit' : 'View'}
          </Link>
          {canWrite ? (
            <>
              <button
                type="button"
                className="admin-btn admin-btn-small admin-btn-ghost"
                disabled={busySlug === product.slug}
                onClick={() => duplicate(product)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-small admin-btn-quiet"
                disabled={busySlug === product.slug || product.isActive === false}
                onClick={() => deactivate(product)}
              >
                Deactivate
              </button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CATALOGUE"
        title="Products"
        description="Every lifecycle state — draft, active, inactive and archived — with the prices and stock the API holds."
        actions={
          canWrite ? (
            <Link className="admin-btn admin-btn-primary" to="/admin/products/new">
              + New product
            </Link>
          ) : (
            <span className="admin-pill admin-pill-muted">Read-only role</span>
          )
        }
      />

      <Card className="admin-card-tight">
        <div className="admin-toolbar">
          <div className="admin-tabs" role="tablist" aria-label="Filter by status">
            {tabs.map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                role="tab"
                aria-selected={status === tab.value}
                className={`admin-tab${status === tab.value ? ' admin-tab-active' : ''}`}
                onClick={() => setStatus(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            className="admin-input admin-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, slug, SKU, category…"
            aria-label="Search products"
          />
        </div>

        {error ? (
          <ErrorState error={error} onRetry={reload} title="The catalogue did not load" />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(product) => product._id ?? product.slug}
              loading={loading}
              caption="Catalogue products"
              empty={
                <EmptyState
                  title={filtered ? 'No products match this filter' : 'The catalogue is empty'}
                  description={
                    filtered
                      ? 'Try another status tab, or clear the search box.'
                      : 'Create the first product, or seed the catalogue with pnpm backend:seed.'
                  }
                  action={
                    canWrite && !filtered ? (
                      <Link className="admin-btn admin-btn-primary" to="/admin/products/new">
                        + New product
                      </Link>
                    ) : null
                  }
                />
              }
            />
            <Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} label="products" />
          </>
        )}
      </Card>

      <p className="admin-footnote">
        Prices are integer paise in the database and are formatted here for display only. The storefront
        always reads its price from the API, never from this screen.
      </p>
    </>
  );
}
