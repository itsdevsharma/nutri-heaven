import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api.js';
import { formatPaise } from '../lib/format.js';
import { useSession } from '../session/session-context.js';

export default function OrdersPage() {
  const { role } = useSession();
  const [orders, setOrders] = useState([]); const [selected, setSelected] = useState(null); const [error, setError] = useState('');
  const load = () => adminApi.orders.list().then(setOrders).catch((cause) => setError(cause.message));
  useEffect(() => { load(); }, []);
  const update = async (id, status) => { try { await adminApi.orders.updateStatus(id, status); load(); } catch (cause) { setError(cause.message); } };
  const cancel = async (id) => { const reason = window.prompt('Cancellation reason (min. 3 characters)'); if (!reason) return; try { await adminApi.orders.cancel(id, reason); setSelected(null); load(); } catch (cause) { setError(cause.message); } };
  return <section className="admin-page"><header className="admin-page-head"><div><p className="admin-eyebrow">OPERATIONS</p><h1>Orders</h1></div></header>{error && <p role="alert">{error}</p>}<div className="admin-card"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>{orders.map(order => <tr key={order.id} onClick={() => setSelected(order)}><td>{order.id}</td><td>{order.customerName}<br /><small>{order.customerEmail}</small></td><td>{formatPaise(order.totalPaise)}</td><td>{order.paymentStatus}</td><td>{order.status}</td></tr>)}</tbody></table>{!orders.length && <p>No orders yet.</p>}</div>{selected && <div className="admin-card"><h2>{selected.id}</h2><p>{selected.customerName} · {selected.customerPhone}<br />{selected.deliveryAddress.street}, {selected.deliveryAddress.city} {selected.deliveryAddress.pin}</p><ul>{selected.lines.map(line => <li key={`${line.productSlug}-${line.packSize}`}>{line.productName} ({line.packSize}) × {line.quantity} — {formatPaise(line.lineTotalPaise)}</li>)}</ul><p>Payment: {selected.paymentStatus} · Fulfilment: {selected.status}</p>{role === 'super_admin' && <><select value={selected.status} onChange={event => update(selected.id, event.target.value)}>{['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(status => <option key={status}>{status}</option>)}</select><button onClick={() => cancel(selected.id)}>Cancel order</button></>}</div>}</section>;
}
