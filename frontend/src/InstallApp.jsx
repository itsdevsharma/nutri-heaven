import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './install-app.css';

let deferredPrompt = null;

export default function InstallApp({ className = '', admin = false }) {
  const [prompt, setPrompt] = useState(() => deferredPrompt);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  const dialog = useRef(null);
  const id = useId();
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const ready = event => { event.preventDefault(); deferredPrompt = event; setPrompt(event); };
    const done = () => { setInstalled(true); deferredPrompt = null; setPrompt(null); dialog.current?.close(); };
    const changed = () => setInstalled(display.matches || navigator.standalone === true);
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);
    display.addEventListener('change', changed);
    return () => { window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', done); display.removeEventListener('change', changed); };
  }, []);
  const install = async () => {
    if (prompt) {
      try { await prompt.prompt(); await prompt.userChoice; deferredPrompt = null; setPrompt(null); return; }
      catch { deferredPrompt = null; setPrompt(null); }
    }
    dialog.current?.showModal();
  };
  if (installed) return null;
  return <>
    <button type="button" className={`app-install-trigger ${className}`.trim()} onClick={install}>{admin ? 'Install admin app' : 'Install app'}</button>
    {createPortal(<dialog className="app-install-dialog" ref={dialog} aria-labelledby={`${id}-title`}>
      <div className="app-install-heading"><h2 id={`${id}-title`}>{admin ? 'Install Nutri Heaven Admin' : 'Install Nutri Heaven'}</h2><button type="button" aria-label="Close installation instructions" onClick={() => dialog.current.close()}>×</button></div>
      <p>{admin ? 'Open your commerce console directly from your home screen or desktop. The admin app launches at /admin; staff sign-in is still required.' : 'Keep Nutri Heaven on your home screen and open it in its own app window.'}</p>
      {ios ? <ol><li>Open this site in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li><li>Keep <strong>Open as Web App</strong> enabled if shown, then tap <strong>Add</strong>.</li></ol> : <><ol><li>Open this site in <strong>Chrome or Edge</strong>.</li><li>Choose the install icon in the address bar, or open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li><li>Confirm installation in your browser.</li></ol><p className="app-install-note">On Mac with Safari, use File → Add to Dock. If installation is unavailable, open the site in your device’s main browser.</p></>}
      <p className="app-install-note">Browsing live stock, checkout and admin actions require an internet connection.</p>
      <button type="button" className="app-install-done" onClick={() => dialog.current.close()}>Got it</button>
    </dialog>, document.body)}
  </>;
}
