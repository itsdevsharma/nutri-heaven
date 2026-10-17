import { Card } from './PageHeader.jsx';

export default function MetaIntegrationSettings({ value = {}, onChange, disabled = false }) {
  const pixelId = value.pixelId ?? '';
  const valid = /^[0-9]{5,30}$/.test(pixelId.trim());
  const invalid = pixelId.trim() !== '' && !valid;
  return <Card title="Facebook & Instagram integration">
    <p className="admin-hint">Connect your Meta Pixel to measure storefront visits and orders from Facebook and Instagram ads. Enter your details below, then choose Save and publish.</p>
    <ol className="admin-hint">
      <li>Open <a href="https://business.facebook.com/events_manager" target="_blank" rel="noreferrer">Meta Events Manager</a> and select your website data source.</li>
      <li>Copy the Pixel ID (also called the Dataset ID for your Pixel) from its settings.</li>
      <li>Paste the ID below, enable the integration and save.</li>
    </ol>
    <label className="store-content-field" htmlFor="meta-pixel-id"><span>Meta Pixel ID</span>
      <input id="meta-pixel-id" inputMode="numeric" autoComplete="off" maxLength={30} placeholder="e.g. 123456789012345" disabled={disabled} value={pixelId} aria-invalid={invalid} aria-describedby="meta-pixel-help" onChange={event => onChange({ ...value, pixelId: event.target.value.trim() })} />
    </label>
    <p id="meta-pixel-help" className="admin-hint">{invalid ? 'Use the numeric Pixel ID only. Do not paste a script, URL or access token.' : 'Your Pixel ID is all that is required. No code or access token is needed.'}</p>
    <label><input type="checkbox" disabled={disabled} checked={value.enabled === true} onChange={event => onChange({ ...value, enabled: event.target.checked })} /> Enable Facebook & Instagram tracking</label>
    <p role="status" className="admin-hint">{value.enabled ? valid ? 'Ready to connect when you save. Live delivery can be checked in Meta Events Manager.' : 'Enter a valid Pixel ID before saving with tracking enabled.' : 'Tracking is disabled.'}</p>
    <details><summary>What connects automatically?</summary>
      <ul className="admin-hint">
        <li>PageView: storefront page visits.</li>
        <li>ViewContent: product detail views.</li>
        <li>AddToCart: successful additions to the shopping bag.</li>
        <li>InitiateCheckout: entering checkout with products.</li>
        <li>Purchase: confirmed COD orders or verified online payments, with the order total in INR.</li>
      </ul>
      <p className="admin-hint">Save changes, open the storefront in a new tab, and use Events Manager → Test events to verify delivery. Browser extensions may block tracking. This connects the browser Pixel; server-side Conversions API requires a separate server integration.</p>
    </details>
  </Card>;
}
