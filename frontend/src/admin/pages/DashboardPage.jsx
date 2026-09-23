import { useMemo } from 'react';
import { DataTable } from '../components/DataTable.jsx';
import { ErrorState } from '../components/Feedback.jsx';
import { Card, PageHeader, StatCard } from '../components/PageHeader.jsx';
import { Pill, StatusPill } from '../components/StatusPill.jsx';
import { adminApi } from '../lib/api.js';
import { assetUrl, countByStatus, variantStockState, variantTotals } from '../lib/catalogue.js';
import { formatDateTime, formatNumber, formatPaise } from '../lib/format.js';
import { can, roleLabel, rolesFor } from '../lib/permissions.js';
import { useResource } from '../lib/useResource.js';
import { Link } from '../router.jsx';
import { useSession } from '../session/session-context.js';

/** Route capabilities as operator-facing modules. */
const MODULES = [
  { label: 'Catalogue & categories', read: 'catalogue:read', write: 'catalogue:write' },
  { label: 'Inventory', read: 'inventory:read' },
  { label: 'Orders', read: 'orders:read' },
  { label: 'Promotions & coupons', read: 'marketing:read' },
  { label: 'Audit trail', read: 'audit:read' },
];

/**
 * Landing screen: catalogue health first, then "what can I do here".
 *
 * Both resources are fetched together so the dashboard paints once instead of in
 * two passes. Counts are derived from the same helpers the products and inventory
 * screens use, so the numbers can never disagree with those pages.
 */
export default function DashboardPage() {
  const { role, admin } = useSession();

  const { data, loading, error, reload } = useResource(
    () => Promise.all([adminApi.products.list({ limit: 200 }), adminApi.categories.list()]),
    [],
  );

  const products = useMemo(() => data?.[0]?.items ?? [], [data]);
  const categories = useMemo(() => data?.[1] ?? [], [data]);

  const stats = useMemo(() => {
    const statusCounts = countByStatus(products);
    const stock = products.reduce(
      (accumulator, product) => {
        const totals = variantTotals(product);
        accumulator.valuePaise += totals.valuePaise;
        (product.variants ?? []).forEach((variant) => {
          const state = variantStockState(variant);
          accumulator.packs += 1;
          if (state.key === 'low') accumulator.low += 1;
          if (state.key === 'out') accumulator.out += 1;
        });
        return accumulator;
      },
      { packs: 0, low: 0, out: 0, valuePaise: 0 },
    );
    return { statusCounts, ...stock };
  }, [products]);

  const recent = useMemo(
    () =>
      [...products]
        .sort((a, b) => new Date(b.updatedAt ?? 0) - new Date(a.updatedAt ?? 0))
        .slice(0, 5),
    [products],
  );

  const attention = useMemo(
    () =>
      products
        .flatMap((product) =>
          (product.variants ?? []).map((variant) => ({ product, variant, state: variantStockState(variant) })),
        )
        .filter((row) => row.state.key !== 'healthy')
        .sort((a, b) => (Number(a.variant.stockQuantity) || 0) - (Number(b.variant.stockQuantity) || 0))
        .slice(0, 6),
    [products],
  );

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (product) => (
        <div className="admin-product-cell">
          {product.image ? <img src={assetUrl(product.image)} alt="" /> : null}
          <span>
            <b>{product.title}</b>
            <small className="admin-mono">{product.slug}</small>
          </span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (product) => <StatusPill status={product.status} /> },
    { key: 'price', header: 'Price', align: 'right', render: (product) => formatPaise(product.pricePaise) },
    { key: 'updated', header: 'Updated', render: (product) => formatDateTime(product.updatedAt) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OVERVIEW"
        title={`Welcome, ${admin?.name?.split(' ')[0] ?? 'admin'}`}
        description="Catalogue health and the modules your role can open."
        actions={
          <>
            <Pill tone="info">{roleLabel(role)}</Pill>
            {can(role, 'catalogue:write') ? (
              <Link className="admin-btn admin-btn-primary" to="/admin/products/new">
                + New product
              </Link>
            ) : null}
          </>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={reload} title="The dashboard did not load" />
      ) : (
        <>
          <div className="admin-stat-grid">
            <StatCard
              label="Products"
              value={formatNumber(products.length)}
              hint={`${formatNumber(stats.statusCounts.active)} active · ${formatNumber(stats.statusCounts.draft)} draft`}
            />
            <StatCard
              label="Packs"
              value={formatNumber(stats.packs)}
              hint={`${formatNumber(categories.length)} categories`}
            />
            <StatCard
              label="Low stock"
              value={formatNumber(stats.low)}
              tone={stats.low ? 'warn' : 'ok'}
              hint="At or below the pack's own limit"
            />
            <StatCard
              label="Out of stock"
              value={formatNumber(stats.out)}
              tone={stats.out ? 'danger' : 'ok'}
              hint="Balance of zero"
            />
            <StatCard
              label="Catalogue value"
              value={formatPaise(stats.valuePaise)}
              hint="Stock on hand × selling price"
            />
          </div>

          <div className="admin-dashboard-columns">
            <Card
              title="Recently updated"
              description="The five products whose catalogue record changed last."
              actions={
                <Link className="admin-btn admin-btn-small admin-btn-ghost" to="/admin/products">
                  All products
                </Link>
              }
            >
              <DataTable
                columns={columns}
                rows={recent}
                rowKey={(product) => product._id ?? product.slug}
                loading={loading}
                caption="Recently updated products"
                empty={<p className="admin-hint">No products yet. Seed the catalogue or create the first product.</p>}
              />
            </Card>

            <Card
              title="Needs attention"
              description="Packs that are out of stock or at their low-stock limit."
              actions={
                <Link className="admin-btn admin-btn-small admin-btn-ghost" to="/admin/inventory">
                  Inventory
                </Link>
              }
            >
              {attention.length ? (
                <ul className="admin-list admin-attention-list">
                  {attention.map((row) => (
                    <li key={`${row.product.slug}-${row.variant.size}`}>
                      <Link to={`/admin/products/${row.product.slug}`}>
                        <b>{row.product.title}</b>
                        <small>{row.variant.size || 'pack'}</small>
                      </Link>
                      <span>
                        <Pill tone={row.state.tone}>
                          {formatNumber(row.variant.stockQuantity ?? 0)} on hand
                        </Pill>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-hint">Every pack is above its low-stock limit.</p>
              )}
            </Card>
          </div>

          <Card
            title="Your access"
            description="The console mirrors the API's role rules for navigation only — the API is the enforcement boundary."
          >
            <DataTable
              columns={[
                { key: 'module', header: 'Module', render: (module) => module.label },
                {
                  key: 'access',
                  header: 'Your access',
                  render: (module) => {
                    if (can(role, module.write ?? '')) return <Pill tone="ok">Read &amp; write</Pill>;
                    if (can(role, module.read)) return <Pill tone="info">Read-only</Pill>;
                    return <Pill tone="muted">No access</Pill>;
                  },
                },
                {
                  key: 'roles',
                  header: 'Roles with access',
                  render: (module) => (
                    <span className="admin-muted">
                      {rolesFor(module.write ?? module.read).map(roleLabel).join(', ')}
                    </span>
                  ),
                },
              ]}
              rows={MODULES}
              rowKey={(module) => module.label}
              caption="Module access by role"
            />
          </Card>

          <p className="admin-footnote">
            Figures cover the first {formatNumber(products.length)} catalogue entries returned by the API
            {data?.[0]?.total > products.length ? ` of ${formatNumber(data[0].total)}` : ''} — enough for the
            current catalogue size, and the reason pagination exists on the products screen.
          </p>
        </>
      )}
    </>
  );
}
