import { productStatusMeta, variantStockState } from '../lib/catalogue.js';

/** Tone is one of: ok | warn | danger | muted | info. */
export function Pill({ children, tone = 'muted', title }) {
  return (
    <span className={`admin-pill admin-pill-${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Product lifecycle state, with its consequence as the tooltip. */
export function StatusPill({ status }) {
  const meta = productStatusMeta(status);
  return (
    <Pill tone={meta.tone} title={meta.hint}>
      {meta.label}
    </Pill>
  );
}

/** Stock state for a single variant, derived from its own low-stock limit. */
export function StockPill({ variant }) {
  const state = variantStockState(variant);
  return <Pill tone={state.tone}>{state.label}</Pill>;
}

export function Flags({ product }) {
  const flags = [
    product?.isFeatured ? 'Featured' : null,
    product?.isBestseller ? 'Bestseller' : null,
    product?.isNewArrival ? 'New arrival' : null,
  ].filter(Boolean);
  if (!flags.length) return <span className="admin-muted">—</span>;
  return (
    <span className="admin-flags">
      {flags.map((flag) => (
        <Pill tone="info" key={flag}>
          {flag}
        </Pill>
      ))}
    </span>
  );
}
