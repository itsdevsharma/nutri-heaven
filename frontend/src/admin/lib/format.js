/**
 * Formatting helpers for the admin console.
 *
 * Money is integer paise everywhere in the API (`backend/src/common/pricing.ts`)
 * and percentages are integer basis points, so every conversion in and out of
 * the UI lives here rather than being re-derived inside pages. The form inputs
 * work in rupees/percent because that is what a human types; the payload always
 * goes back as paise/basis points.
 */

/** `27500` → `₹275`, `27550` → `₹275.50`, junk → the fallback. */
export function formatPaise(paise, fallback = '—') {
  const value = Number(paise);
  if (paise === null || paise === undefined || paise === '' || !Number.isFinite(value)) {
    return fallback;
  }
  const rupees = value / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** `27500` → `'275'` for a rupee `<input>`. Empty stays empty, not `0`. */
export function paiseToRupees(paise) {
  if (paise === null || paise === undefined || paise === '') return '';
  const value = Number(paise);
  return Number.isFinite(value) ? String(value / 100) : '';
}

/** `'275.5'` → `27550`. Anything unparseable becomes `0`, never `NaN`. */
export function rupeesToPaise(rupees) {
  const value = Number(String(rupees ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** `1200` basis points → `12` (per cent, for a form input). */
export function basisPointsToPercent(basisPoints) {
  if (basisPoints === null || basisPoints === undefined || basisPoints === '') return '';
  const value = Number(basisPoints);
  return Number.isFinite(value) ? String(value / 100) : '';
}

/** `'12.5'` → `1250`. */
export function percentToBasisPoints(percent) {
  const value = Number(String(percent ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** `1200` → `'12%'` for read-only display. */
export function formatBasisPoints(basisPoints) {
  const value = Number(basisPoints ?? 0);
  return `${(Number.isFinite(value) ? value / 100 : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
}

export function formatNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString('en-IN') : '—';
}

/** `'California Almonds'` → `'california-almonds'`, matching backend slugs. */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncate(text, length = 72) {
  const value = String(text ?? '');
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
