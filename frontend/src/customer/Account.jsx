import Notifications from './Notifications.jsx';
import { useEffect, useState } from 'react';
import { customerApi } from '../cart-api.js';

const blankAddress = { label: 'Home', name: '', phone: '', street: '', city: '', state: '', pin: '', landmark: '' };
const money = value => `₹${(value / 100).toLocaleString('en-IN')}`;

export default function Account() {
  const [resetToken] = useState(() => new URLSearchParams(location.search).get('reset'));
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!resetToken && Boolean(customerApi.token()));
  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [address, setAddress] = useState(null);
  const load = async () => {
    const me = await customerApi.me(); setCustomer(me); setProfile({ name: me.name, phone: me.phone ?? '' });
    const [history, saved] = await Promise.all([customerApi.orders(), customerApi.wishlist()]);
    setOrders(history); setWishlist(saved);
  };
  useEffect(() => {
    if (resetToken) { history.replaceState(null, '', '/account'); return; }
    if (customerApi.token()) load().catch(e => { setError(e.message); }).finally(() => setLoading(false));
  }, []);
  const run = async (action, message) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (message) setNotice(message); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const submit = event => {
    event.preventDefault();
    run(async () => {
      if (mode === 'forgot') {
        const result = await customerApi.forgotPassword({ email: form.email.trim() });
        setNotice(result.message);
        if (result.resetToken) setNotice(`${result.message} Development link: ${location.origin}/account?reset=${result.resetToken}`);
        return;
      }
      if (mode === 'reset' && form.password !== form.confirm) throw new Error('Passwords do not match.');
      const result = mode === 'signup'
        ? await customerApi.signup({ name: form.name.trim(), email: form.email.trim(), password: form.password })
        : mode === 'reset' ? await customerApi.resetPassword({ token: resetToken, password: form.password })
        : await customerApi.login({ email: form.email.trim(), password: form.password });
      setCustomer(result.customer); setForm({ name: '', email: '', password: '', confirm: '' });
      setNotice(mode === 'signup' ? 'Your account is ready! Welcome to Nutri Heaven.' : mode === 'reset' ? 'Password updated. You’re signed in!' : 'You’re signed in! Welcome back.');
      await load();
    });
  };
  const feedback = <>{error && <p className="account-message account-error" role="alert">{error}</p>}{notice && <div className="account-notification" role="status"><div><p>{notice}</p></div><button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}</>;
  if (loading) return <main className="account-page"><p role="status">Loading your account…</p></main>;
  if (!customer) return <main className="account-auth-page"><section className="account-auth-card"><div className="account-auth-aside"><p className="eyebrow">YOUR NUTRI HEAVEN</p><h1>Your everyday favourites.</h1><p>Save your favourites, follow your orders and manage your delivery details.</p></div><div className="account-auth-main"><a href="/" className="account-back">← Back to store</a><h2>{({ login: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' })[mode]}</h2><form onSubmit={submit}>
    {mode === 'signup' && <label>Full name<input name="name" required minLength={2} maxLength={100} autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>}
    {mode !== 'reset' && <label>Email address<input name="email" type="email" required autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>}
    {mode !== 'forgot' && <label>Password<input name="password" type="password" required minLength={mode === 'login' ? 1 : 12} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>}
    {mode === 'reset' && <label>Confirm password<input type="password" required autoComplete="new-password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></label>}
    {feedback}<button className="account-submit" disabled={busy}>{busy ? 'Please wait…' : ({ login: 'Sign in', signup: 'Create account', forgot: 'Send reset link', reset: 'Update password' })[mode]}</button>
  </form><div className="account-auth-links">{mode === 'login' && <button onClick={() => { setMode('forgot'); setError(''); setNotice(''); }}>Forgot password?</button>}<button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setNotice(''); }}>{mode === 'login' ? 'Create an account' : 'Back to sign in'}</button></div></div></section></main>;
  return <main className="account-page"><div className="account-wrap">{feedback}<section className="account-welcome"><div><p className="eyebrow">MY ACCOUNT</p><h1>Hello, {customer.name.split(' ')[0]}</h1><p>{customer.email}</p></div><button className="account-signout" onClick={() => { customerApi.logout(); setCustomer(null); setOrders([]); setWishlist([]); setNotice(''); setError(''); setMode('login'); }}>Sign out</button></section>
    <div className="account-columns"><div>
      <section className="account-card"><h2>Profile</h2><form className="customer-form" onSubmit={e => { e.preventDefault(); run(async () => { await customerApi.update({ name: profile.name.trim(), phone: profile.phone }); await load(); }, 'Profile saved.'); }}><label>Full name<input required minLength={2} maxLength={100} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label><label>Phone<input type="tel" pattern="[0-9]{10}" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></label><button disabled={busy}>Save profile</button></form></section>
      <section className="account-card"><h2>Delivery addresses</h2>{customer.addresses.map(item => <div className="customer-address" key={item.id}><b>{item.label} {item.isDefault && '· Default'}</b><p>{item.name} · {item.phone}<br />{item.street}, {item.city}, {item.state} {item.pin}</p><div className="customer-actions"><button disabled={busy} onClick={() => setAddress(item)}>Edit</button>{!item.isDefault && <button disabled={busy} onClick={() => run(async () => { await customerApi.defaultAddress(item.id); await load(); }, 'Default address updated.')}>Make default</button>}<button disabled={busy} onClick={() => { if (confirm('Remove this address?')) run(async () => { await customerApi.removeAddress(item.id); await load(); }, 'Address removed.'); }}>Remove</button></div></div>)}{!customer.addresses.length && <p>No saved addresses yet.</p>}<button disabled={busy} onClick={() => setAddress({ ...blankAddress, name: customer.name, phone: customer.phone ?? '' })}>Add address</button>
      {address && <form className="customer-form" onSubmit={e => { e.preventDefault(); run(async () => { const { id, isDefault, ...payload } = address; if (id) await customerApi.updateAddress(id, payload); else await customerApi.addAddress(payload); setAddress(null); await load(); }, 'Address saved.'); }}><h3>{address.id ? 'Edit address' : 'New address'}</h3>{Object.entries({ label: 'Label', name: 'Recipient name', phone: 'Phone', street: 'Street address', city: 'City', state: 'State', pin: 'PIN code', landmark: 'Landmark (optional)' }).map(([key, label]) => <label key={key}>{label}<input required={key !== 'landmark'} value={address[key] ?? ''} pattern={key === 'phone' ? '[0-9]{10}' : key === 'pin' ? '[0-9]{6}' : undefined} onChange={e => setAddress({ ...address, [key]: e.target.value })} /></label>)}<div className="customer-actions"><button disabled={busy}>Save address</button><button type="button" onClick={() => setAddress(null)}>Cancel</button></div></form>}</section>
      <section className="account-card"><h2>Orders</h2><p>Orders placed while signed in appear here. For guest or older orders, contact support with your order number.</p>{orders.length ? orders.map(order => <details className="customer-order" key={order.id}><summary>{order.id} · {money(order.totalPaise)} · {order.status.replaceAll('_', ' ')}</summary><p>Payment: {order.paymentStatus}</p><div className="customer-actions"><button disabled={busy} onClick={() => run(() => customerApi.downloadReceipt(order.id), 'Receipt downloaded. Open it to print or save as PDF.')}>Download receipt</button>{['pending', 'confirmed', 'packed'].includes(order.status) && <button disabled={busy} onClick={() => { const reason = prompt('Why would you like to cancel this order?'); if (reason) run(async () => { await customerApi.orderAction(order.id, 'cancel', reason); await load(); }, 'Order cancelled. If you paid online, support will arrange the refund.'); }}>Cancel order</button>}{order.status === 'delivered' && <button disabled={busy} onClick={() => { const reason = prompt('Tell us why you would like to return this order.'); if (reason) run(async () => { await customerApi.orderAction(order.id, 'return', reason); await load(); }, 'Return request sent. Our team will review it.'); }}>Request return</button>}</div>{order.lines.map(line => <p key={`${line.productSlug}-${line.packSize}`}>{line.productName} ({line.packSize}) × {line.quantity} — {money(line.lineTotalPaise)}</p>)}<p>{order.deliveryAddress.street}, {order.deliveryAddress.city} {order.deliveryAddress.pin}</p>{order.trackingNumber && <p>Tracking: {order.trackingNumber}</p>}{/^https?:\/\//i.test(order.trackingUrl ?? '') && <a href={order.trackingUrl} target="_blank" rel="noreferrer">Track shipment ↗</a>}<ol>{order.statusHistory?.map((event, i) => <li key={i}>{event.status.replaceAll('_', ' ')} · {new Date(event.at).toLocaleString()}</li>)}</ol></details>) : <p>No orders yet.</p>}</section>
    </div><div className="account-side"><Notifications /><section className="account-card"><h2>Wishlist</h2>{wishlist.length ? wishlist.map(product => <div className="customer-wishlist" key={product.slug}><a href={`/products/${encodeURIComponent(product.slug)}`}>{product.title}</a><button disabled={busy} onClick={() => run(async () => { await customerApi.removeWishlist(product.slug); await load(); }, 'Removed from wishlist.')}>Remove</button></div>) : <p>Your saved favourites will appear here.</p>}<a href="/shop">Browse products →</a></section></div></div>
  </div></main>;
}
