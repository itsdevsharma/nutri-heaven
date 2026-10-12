import { useEffect, useState } from 'react';
import { customerApi } from '../cart-api.js';
export default function Notifications() {
  const [items, setItems] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const load = () => customerApi.notifications().then(setItems).catch(e => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  return <section className="account-card"><h2>Notifications</h2><p>{items.filter(item => !item.readAt).length} unread · Latest 100 notifications</p>{loading && <p>Loading notifications…</p>}{error && <p role="alert">{error} <button onClick={load}>Retry</button></p>}{!loading && !items.length && <p>You’re all caught up.</p>}{items.map(item => <article className="customer-address" key={item._id}><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small>{!item.readAt && <div className="customer-actions"><button onClick={async () => { try { await customerApi.readNotification(item._id); setItems(current => current.map(entry => entry._id === item._id ? { ...entry, readAt: new Date().toISOString() } : entry)); } catch (e) { setError(e.message); } }}>Mark as read</button></div>}</article>)}</section>;
}
