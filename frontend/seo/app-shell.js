// Keep server-rendered content usable without JavaScript. During a normal app
// boot, show a small loading state instead of flashing the SEO catalogue. If
// the bundle fails, restore the content and let the visitor retry.
export function appShell(content) {
  return `<div id="root"><div class="store-fallback">${content}</div><div class="store-boot" role="status" aria-live="polite"><span class="store-boot-brand">Nutri Heaven</span><span>Loading your store…</span></div></div>`;
}
