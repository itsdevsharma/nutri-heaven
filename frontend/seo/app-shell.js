// Keep server-rendered content usable without JavaScript. During a normal app
// boot, show a small loading state instead of flashing the SEO catalogue. If
// the bundle fails, restore the content and let the visitor retry.
export function appShell(content) {
  return `<div id="root"><div class="store-fallback">${content}</div><div class="store-boot" role="status" aria-live="polite"><span class="store-boot-brand">Nutri Heaven</span><span>Loading your store…</span></div><script>(function(){var root=document.currentScript.parentElement;root.dataset.booting='true';setTimeout(function(){if(root.querySelector('.store-fallback')){delete root.dataset.booting;var note=document.createElement('p');note.className='store-boot-note';note.append('The interactive store could not load. ');var retry=document.createElement('a');retry.href='';retry.textContent='Try again';note.append(retry);root.prepend(note);}},15000);})();</script></div>`;
}
