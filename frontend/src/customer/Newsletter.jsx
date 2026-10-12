import { useState } from 'react';
import { storefrontApi } from '../cart-api.js';
export function NewsletterForm() {
  const [email, setEmail] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  return <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); setMessage(''); try { const result = await storefrontApi.subscribe({ email: email.trim(), consent }); setMessage(result.message); setEmail(''); setConsent(false); } catch (e) { setError(e.message); } finally { setBusy(false); } }}><input type="email" required aria-label="Email address for newsletter" placeholder="Your email address" value={email} onChange={e => setEmail(e.target.value)} /><button disabled={busy}>{busy ? 'Sending…' : 'Subscribe →'}</button><label className="newsletter-consent"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /> Email me offers and pantry news. I can unsubscribe any time.</label>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</form>;
}
export function NewsletterAction() {
  const [query] = useState(() => new URLSearchParams(location.search));
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const action = query.get('newsletter');
  return <main className="account-page"><section className="account-card"><h1>Newsletter</h1><p>{action === 'confirm' ? 'Confirm that you would like to receive our newsletter.' : 'Stop receiving newsletter emails.'}</p>{message ? <p role="status">{message}</p> : <button disabled={busy || !['confirm', 'unsubscribe'].includes(action)} onClick={async () => { setBusy(true); setError(''); try { const result = await storefrontApi.newsletterAction(action, query.get('token')); setMessage(result.message); history.replaceState(null, '', '/account'); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{busy ? 'Please wait…' : action === 'confirm' ? 'Confirm subscription' : 'Unsubscribe'}</button>}{error && <p role="alert">{error}</p>}<p><a href="/">Back to store</a></p></section></main>;
}
