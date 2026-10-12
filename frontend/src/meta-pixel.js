let initializedPixelId;

// Module state prevents duplicate PageViews during React StrictMode effects.
export function initializeMetaPixel(settings) {
  const pixelId = settings?.pixelId;
  if (!settings?.enabled || !/^[0-9]{5,30}$/.test(pixelId ?? '') || initializedPixelId === pixelId) return;
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
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  window.fbq('init', pixelId);
  window.fbq('trackSingle', pixelId, 'PageView');
  initializedPixelId = pixelId;
}
