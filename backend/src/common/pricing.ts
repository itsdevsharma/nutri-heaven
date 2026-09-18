/** Monetary values use integer paise to avoid floating-point rounding errors. */
export const FREE_SHIPPING_THRESHOLD_PAISE = 99_900;
export const STANDARD_SHIPPING_FEE_PAISE = 7_900;

/** Returns the delivery fee for a cart subtotal in paise. */
export function shippingFeeForPaise(subtotalPaise: number): number {
  if (!Number.isFinite(subtotalPaise) || subtotalPaise <= 0) return 0;
  return subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE
    ? 0
    : STANDARD_SHIPPING_FEE_PAISE;
}

/** Returns a cart total, including delivery, in paise. */
export function orderTotalForPaise(subtotalPaise: number): number {
  return subtotalPaise + shippingFeeForPaise(subtotalPaise);
}
