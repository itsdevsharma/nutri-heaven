import { useEffect, useState } from 'react';
import { storefrontApi } from './cart-api.js';

// A quote belongs to one basket, address, coupon and payment method. Ignore
// responses from previous inputs so a slow request cannot restore an old total.
export function useDeliveryQuote(payload, enabled) {
  const key = JSON.stringify(payload);
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const address = payload.deliveryAddress;
  const ready = enabled && payload.lines.length > 0 && /^\d{6}$/.test(address.pin)
    && Boolean(address.street && address.city && address.state);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const controller = new AbortController();
    setResult({ key, loading: true });
    const timer = setTimeout(async () => {
      try {
        const quote = await storefrontApi.deliveryQuote(JSON.parse(key), controller.signal);
        if (active) setResult({ key, quote });
      } catch (error) {
        if (active) setResult({ key, error: error.message });
      }
    }, 600);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [key, ready, revision]);

  const current = ready && result?.key === key ? result : null;
  const quote = current?.quote;
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setResult({ key, error: 'Delivery quote expired. Refresh delivery to confirm your total.' }), Math.max(0, new Date(quote.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [quote, key]);

  return {
    quote,
    busy: Boolean(ready && (!current || current.loading)),
    error: current?.error || '',
    ready,
    refresh: () => { setResult(null); setRevision(value => value + 1); },
  };
}
