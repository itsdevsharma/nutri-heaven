// All Meta SDK access lives here so analytics failures never interrupt shopping.
const SCRIPT_ID = 'nutri-meta-pixel';
const initializedIds = new Set();
const sentEvents = new Set();
let activePixelId;

export function initializeMetaPixel(settings) {
  activePixelId = undefined;
  const pixelId = String(settings?.pixelId ?? '').trim();
  if (typeof window === 'undefined' || !settings?.enabled || !/^[0-9]{5,30}$/.test(pixelId)) return false;
  try {
    if (!window.fbq) {
      const fbq = function (...args) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue.push(args);
      };
      window.fbq = fbq;
      window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
    }
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      script.onerror = () => script.remove();
      document.head.appendChild(script);
    }
    if (!initializedIds.has(pixelId)) {
      window.fbq('init', pixelId);
      initializedIds.add(pixelId);
    }
    activePixelId = pixelId;
    trackMetaEvent('PageView', {}, { once: `page:${window.location.pathname}` });
    return true;
  } catch { return false; }
}

export function trackMetaEvent(name, parameters = {}, { once, eventId, persist = false } = {}) {
  if (!activePixelId || typeof window?.fbq !== 'function') return false;
  const key = `${activePixelId}:${once || eventId || ''}`;
  try {
    if ((once || eventId) && sentEvents.has(key)) return false;
    if (persist) {
      try { if (window.localStorage.getItem(`nutri_meta:${key}`)) return false; } catch { /* Storage may be blocked. */ }
    }
    const args = ['trackSingle', activePixelId, name, parameters];
    if (eventId) args.push({ eventID: eventId });
    window.fbq(...args);
    if (once || eventId) sentEvents.add(key);
    if (persist) {
      try { window.localStorage.setItem(`nutri_meta:${key}`, '1'); } catch { /* In-memory deduplication still applies. */ }
    }
    return true;
  } catch { return false; }
}

export function commerceData(lines = [], totalPaise) {
  const contents = lines.filter(line => (line.productSlug || line.productId) && Number.isInteger(line.quantity) && line.quantity > 0)
    .map(line => ({ id: line.productSlug || line.productId, quantity: line.quantity, ...(Number.isFinite(line.unitPricePaise) ? { item_price: line.unitPricePaise / 100 } : {}) }));
  return {
    content_type: 'product', content_ids: [...new Set(contents.map(item => item.id))], contents,
    num_items: contents.reduce((sum, item) => sum + item.quantity, 0), currency: 'INR',
    ...(Number.isFinite(totalPaise) && totalPaise >= 0 ? { value: totalPaise / 100 } : {}),
  };
}

export function trackProductView(product) {
  if (!product?.slug) return;
  const variant = product.variants?.find(item => item.isActive !== false);
  return trackMetaEvent('ViewContent', {
    ...commerceData([{ productSlug: product.slug, quantity: 1, unitPricePaise: variant?.pricePaise ?? product.pricePaise }], variant?.pricePaise ?? product.pricePaise),
    content_name: product.title,
  }, { once: `product:${product.slug}` });
}

export function trackPurchase(order) {
  if (!order?.id || order.status !== 'confirmed' || order.paymentReconciliationRequired ||
    (order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') || !Number.isFinite(order.totalPaise)) return false;
  return trackMetaEvent('Purchase', commerceData(order.lines, order.totalPaise), {
    eventId: `purchase:${order.id}`, persist: true,
  });
}
