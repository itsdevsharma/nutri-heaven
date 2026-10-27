import { useState, useEffect } from 'react';
import { useSession } from '../session/session-context.js';
import { adminApi } from '../lib/api.js';
import { Card, PageHeader } from '../components/PageHeader.jsx';
import { FormField, FormGrid } from '../components/FormField.jsx';
export default function ShippingPage() {
  const canConfigure = useSession().role === 'super_admin';
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [locations, setLocations] = useState([]), [form, setForm] = useState({ pickupLocation: '', weight: '', length: '', breadth: '', height: '' });
  useEffect(() => { adminApi.shipping.configuration().then(record => { setData(record); if (record.defaults) setForm(record.defaults); }).catch(e => setError(e.message)); }, []);
  const loadPickups = async () => { setBusy(true); setError(''); try { setLocations(await adminApi.shipping.pickups()); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const save = async event => {
    event.preventDefault(); if (!canConfigure) return; setBusy(true); setError(''); setMessage('');
    try { const saved = await adminApi.shipping.configure({ pickupLocation: form.pickupLocation, ...Object.fromEntries(['weight', 'length', 'breadth', 'height'].map(key => [key, Number(form[key])])) }); setForm(saved); setMessage('Shipping defaults saved.'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <><PageHeader title="Shipping" description="Shiprocket pickup location and parcel defaults. Book shipments from each order." />{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <Card title="Shiprocket connection"><p>{data?.configured ? 'API credentials are configured on the backend.' : 'Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to the backend environment using a Shiprocket API user, then restart the backend.'}</p><p>Register your pickup address in Shiprocket, then load its locations here. Credentials stay on the server.</p><button className="admin-btn admin-btn-ghost" disabled={busy || !data?.configured} onClick={loadPickups}>Load pickup locations</button>{locations.length > 0 && <ul>{locations.map(location => <li key={location.name}>{location.name} · {location.address}, {location.city} {location.pin}</li>)}</ul>}</Card>
    <Card title="Default parcel"><p className="admin-hint">Use the packed parcel weight including packaging. You can override dimensions for each booking.</p><form className="admin-stack" onSubmit={save}>{!canConfigure && <p className="admin-hint">Only a super admin can change shipping defaults.</p>}<fieldset disabled={busy || !canConfigure} style={{ border: 0, padding: 0, margin: 0 }}><FormField label="Shiprocket pickup location name">{locations.length ? <select aria-label="Shiprocket pickup location name" className="admin-input" required value={form.pickupLocation} onChange={e => setForm({ ...form, pickupLocation: e.target.value })}><option value="">Choose pickup location</option>{locations.map(location => <option key={location.name}>{location.name}</option>)}</select> : <input aria-label="Shiprocket pickup location name" className="admin-input" required maxLength={100} value={form.pickupLocation} onChange={e => setForm({ ...form, pickupLocation: e.target.value })} />}</FormField><FormGrid>{[['weight', 'Weight (kg)'], ['length', 'Length (cm)'], ['breadth', 'Width (cm)'], ['height', 'Height (cm)']].map(([key, label]) => <FormField label={label} key={key}><input aria-label={label} className="admin-input" type="number" required min={key === 'weight' ? '0.001' : '0.51'} max="1000" step="0.001" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></FormField>)}</FormGrid></fieldset>{canConfigure && <button className="admin-btn admin-btn-primary" disabled={busy || !data}>Save shipping defaults</button>}</form></Card>
  </>;
}
