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
import { useRouter } from '../router.jsx';
import { useSession } from '../session/session-context.js';
import { BulkActionBar } from '../components/BulkActionBar.jsx';
import { CsvImportExport } from '../components/CsvImportExport.jsx';
import { Modal } from '../components/Modal.jsx';

const PAGE_SIZE = 25;
const emptyFilters = () => ({ category: '', stock: '', featured: '', bestseller: '', newArrival: '', minPrice: '', maxPrice: '' });

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
  const { navigate } = useRouter();

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [busySlug, setBusySlug] = useState('');
  const [selected, setSelected] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const query = useDebounced(search, 300);
  const { minPrice, maxPrice, ...otherFilters } = filters;
  const priceError = minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice);
  const apiFilters = { ...otherFilters,
    minPricePaise: minPrice === '' ? undefined : Math.round(Number(minPrice) * 100),
    maxPricePaise: maxPrice === '' || priceError ? undefined : Math.round(Number(maxPrice) * 100),
  };
  const activeCount = Object.values(filters).filter(Boolean).length + Number(Boolean(status)) + Number(Boolean(search.trim()));
  const clearFilters = () => { setStatus(''); setSearch(''); setFilters(emptyFilters()); };
  const changeFilter = (key, value) => {
    if (['minPrice', 'maxPrice'].includes(key) && value !== '' && Number(value) < 0) return;
    setFilters(current => ({ ...current, [key]: value }));
  };

  // A new filter invalidates the current page number.
  useEffect(() => { setOffset(0); setSelected([]); }, [status, query, filters]);
  const categories = useResource(() => adminApi.categories.list(), []);

  const { data, loading, error, reload } = useResource(
    () =>
      adminApi.products.list({
        status: status || undefined,
        q: query || undefined,
        limit: PAGE_SIZE,
        offset,
        ...apiFilters,
      }),
    [status, query, offset, filters],
  );

  const canWrite = can(role, 'catalogue:write');
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtered = activeCount > 0;
  const toggleSelected = (slug) => setSelected((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
  const selectPage = (checked) => setSelected(checked ? items.map((item) => item.slug) : []);
  const bulk = async (action, extras = {}) => { try { await adminApi.products.bulk({ action, slugs: selected, ...extras }); toast.success(`${selected.length} product${selected.length === 1 ? '' : 's'} updated.`); setSelected([]); reload(); } catch (failure) { toast.error(failure.message); } };
  const exportCsv = async (extra = {}) => { try { const blob = await adminApi.products.exportCsv({ status: status || undefined, q: query || undefined, ...apiFilters, ...extra }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'products.csv'; link.click(); URL.revokeObjectURL(link.href); } catch (failure) { toast.error(failure.message); } };

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
    { key: 'select', header: <input type="checkbox" aria-label="Select page" checked={items.length > 0 && selected.length === items.length} onChange={(event) => selectPage(event.target.checked)} />, render: (product) => <input type="checkbox" aria-label={`Select ${product.title}`} checked={selected.includes(product.slug)} onChange={() => toggleSelected(product.slug)} /> },
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
              {product.status !== 'archived' ? <button type="button" className="admin-btn admin-btn-small admin-btn-quiet" disabled={busySlug === product.slug} onClick={() => adminApi.products.archive(product.slug).then(reload).catch((failure) => toast.error(failure.message))}>Archive</button> : <><button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => adminApi.products.recover(product.slug, 'draft').then(reload).catch((failure) => toast.error(failure.message))}>Recover draft</button><button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => adminApi.products.recover(product.slug, 'inactive').then(reload).catch((failure) => toast.error(failure.message))}>Recover inactive</button></>}
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
        <section className="product-filters" aria-label="Product filters">
          <div className="product-filters-heading">
            <div><h2>Find products</h2><p>Search or combine filters. Results update automatically.</p></div>
            <CsvImportExport disabled={!canWrite} onExport={exportCsv} onImport={async (file) => { try { setImportPreview(await adminApi.products.importCsv(file, true)); } catch (failure) { toast.error(failure.message); } }} />
          </div>
          <div className="product-status-filter" role="group" aria-label="Product status">
            <span>Status</span>
            <div className="admin-tabs">
              {tabs.map(tab => <button key={tab.value || 'all'} type="button" aria-pressed={status === tab.value} className={`admin-tab${status === tab.value ? ' admin-tab-active' : ''}`} onClick={() => setStatus(tab.value)}>{tab.value ? tab.label : 'All products'}</button>)}
            </div>
          </div>
          <div className="product-filter-grid">
            <label className="product-filter-field product-filter-search"><span>Search products</span><input className="admin-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, SKU, category or slug" /></label>
            <label className="product-filter-field"><span>Category</span><select className="admin-input" aria-label="Category" value={filters.category} onChange={event => changeFilter('category', event.target.value)}><option value="">All categories</option>{(categories.data ?? []).filter(category => category.isActive !== false).map(category => <option key={category._id} value={category.name}>{category.name}</option>)}</select></label>
            <label className="product-filter-field"><span>Stock availability</span><select className="admin-input" aria-label="Stock availability" value={filters.stock} onChange={event => changeFilter('stock', event.target.value)}><option value="">Any stock level</option><option value="healthy">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label>
          </div>
          <div className="product-filter-details">
            <fieldset className="product-price-filter"><legend>Price range (₹)</legend><div className="product-price-inputs"><label><span className="admin-visually-hidden">Minimum price in rupees</span><input className="admin-input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Min ₹" value={minPrice} onChange={event => changeFilter('minPrice', event.target.value)} aria-invalid={priceError} aria-describedby={priceError ? 'product-price-error' : undefined} /></label><span aria-hidden="true">–</span><label><span className="admin-visually-hidden">Maximum price in rupees</span><input className="admin-input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Max ₹" value={maxPrice} onChange={event => changeFilter('maxPrice', event.target.value)} aria-invalid={priceError} aria-describedby={priceError ? 'product-price-error' : undefined} /></label></div>{priceError && <small id="product-price-error" role="alert">Maximum price must be at least the minimum.</small>}</fieldset>
            <fieldset className="product-flag-filter"><legend>Show only</legend><div>{[['featured', 'Featured'], ['bestseller', 'Bestsellers'], ['newArrival', 'New arrivals']].map(([key, label]) => <label key={key}><input type="checkbox" checked={filters[key] === 'true'} onChange={event => changeFilter(key, event.target.checked ? 'true' : '')} />{label}</label>)}</div></fieldset>
          </div>
          <div className="product-filter-footer">
            <div className="product-filter-summary"><span role="status">{loading ? 'Finding products…' : `${formatNumber(total)} product${total === 1 ? '' : 's'} found`}{activeCount > 0 && <small> · {activeCount} active filter{activeCount === 1 ? '' : 's'}</small>}</span>{activeCount > 0 && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
            {can(role, 'inventory:read') && <div className="product-inventory-links"><span>Manage stock:</span><button type="button" onClick={() => navigate('/admin/inventory?view=low')}>Low stock → Inventory</button><button type="button" onClick={() => navigate('/admin/inventory?view=out')}>Out of stock → Inventory</button></div>}
          </div>
        </section>
        {canWrite ? <BulkActionBar selected={selected} categories={categories.data ?? []} onAction={bulk} onClear={() => setSelected([])} onExport={() => exportCsv({ slugs: selected.join(',') })} /> : null}

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
                      ? 'Try a broader search or clear the filters to see all products.'
                      : 'Create the first product, or seed the catalogue with pnpm backend:seed.'
                  }
                  action={
                    filtered ? (<button type="button" className="admin-btn admin-btn-ghost" onClick={clearFilters}>Clear filters</button>) : canWrite ? (
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
      <Modal open={Boolean(importPreview)} title="CSV import preview" description="Review validation before any catalogue records are changed." onClose={() => setImportPreview(null)} size="md" footer={<><button type="button" className="admin-btn admin-btn-ghost" onClick={() => setImportPreview(null)}>Cancel</button><button type="button" className="admin-btn admin-btn-primary" disabled={!importPreview || importPreview.errors.length > 0} onClick={async () => { try { const result = await adminApi.products.confirmImport(importPreview.token); toast.success(`Imported ${result.created} new and updated ${result.updated} products.`); setImportPreview(null); reload(); } catch (failure) { toast.error(failure.message); } }}>Confirm import</button></>}><div className="admin-import-summary"><p><b>{importPreview?.created ?? 0}</b> new products · <b>{importPreview?.updated ?? 0}</b> updates · <b>{importPreview?.errors.length ?? 0}</b> invalid rows</p>{importPreview?.errors.length ? <ul className="admin-list">{importPreview.errors.map((item) => <li key={`${item.row}-${item.message}`}>Row {item.row}: {item.message}</li>)}</ul> : <p className="admin-hint">All rows are valid. Confirmation will apply this exact preview once.</p>}</div></Modal>
    </>
  );
}
