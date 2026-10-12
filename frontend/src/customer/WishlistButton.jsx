import { useEffect, useState } from 'react';
import { customerApi } from '../cart-api.js';
let cachedToken, saved = new Set(), pending;
function load() {
  const token = customerApi.token();
  if (!token) return Promise.resolve(new Set());
  if (token !== cachedToken) { cachedToken = token; pending = undefined; saved = new Set(); }
  if (!pending) pending = customerApi.me().then(me => { saved = new Set(me.wishlist); return saved; }).catch(error => { pending = undefined; throw error; });
  return pending;
}
export default function WishlistButton({ slug }) {
  const [selected, setSelected] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let active = true; load().then(items => { if (active) setSelected(items.has(slug)); }).catch(() => {}); const refresh = () => setSelected(saved.has(slug)); window.addEventListener('wishlist-updated', refresh); return () => { active = false; window.removeEventListener('wishlist-updated', refresh); }; }, [slug]);
  return <div className="wishlist-control"><button type="button" disabled={busy} aria-label={selected ? 'Remove from wishlist' : 'Save to wishlist'} aria-pressed={selected} onClick={async () => {
    if (!customerApi.token()) { setError('Sign in to save favourites.'); return; }
    setBusy(true); setError('');
    try { if (selected) { await customerApi.removeWishlist(slug); saved.delete(slug); } else { await customerApi.addWishlist(slug); saved.add(slug); } setSelected(saved.has(slug)); window.dispatchEvent(new Event('wishlist-updated')); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }}>{selected ? '♥' : '♡'}</button>{error && <p role="alert">{error} {!customerApi.token() && <a href="/account">Sign in</a>}</p>}</div>;
}
