import { useState } from 'react';
import ShiprocketShipment from './ShiprocketShipment.jsx';
import { FormField, FormGrid } from './FormField.jsx';

export default function OrderDelivery({ order, tracking, setTracking, busy, setBusy, save, reload }) {
  const [method, setMethod] = useState(order.shippingQuote && order.shippingQuote.source !== 'store' ? 'shiprocket' : 'manual');
  return <section className="admin-order-section admin-delivery-step">
    <h3>2. Arrange delivery</h3>
    <p className="admin-hint">Choose how you will send this parcel. Preparing an order does not book a courier.</p>
    <fieldset className="admin-delivery-method"><legend>How are you sending this order?</legend>
      <label><input type="radio" name="delivery-method" checked={method === 'manual'} disabled={busy} onChange={() => setMethod('manual')} /><span><b>Use my own courier</b><small>Book delivery yourself, then add the tracking details below.</small></span></label>
      <label><input type="radio" name="delivery-method" checked={method === 'shiprocket'} disabled={busy} onChange={() => setMethod('shiprocket')} /><span><b>Book through Shiprocket</b><small>Arrange courier pickup and get shipping documents here.</small></span></label>
    </fieldset>
    {method === 'manual' ? <form className="admin-stack" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="admin-hint">After booking with your courier, copy the details from their receipt. Saving these details lets the customer track their parcel; it does not mark the order as sent.</p>
      <FormGrid><FormField label="Parcel tracking number"><input aria-label="Parcel tracking number" className="admin-input" required value={tracking.trackingNumber} disabled={busy} placeholder="Number from your courier receipt" onChange={event => setTracking({ ...tracking, trackingNumber: event.target.value })} /></FormField><FormField label="Tracking website (optional)"><input aria-label="Tracking website (optional)" className="admin-input" type="url" disabled={busy} value={tracking.trackingUrl} placeholder="https://courier.com/track/…" onChange={event => setTracking({ ...tracking, trackingUrl: event.target.value })} /></FormField></FormGrid>
      <div><button className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save tracking details'}</button></div>
    </form> : <ShiprocketShipment order={order} onUpdate={reload} onBusyChange={setBusy} />}
  </section>;
}
