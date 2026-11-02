export function registerAppWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const register = () => { navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {}); };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
