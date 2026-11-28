// Run from backend with node --env-file=.env scripts/configure-webhook.cjs.
// Registers/reconciles delivery of payment and refund events; never charges,
// captures, refunds or creates an order. Secrets are never printed.
const Razorpay = require('razorpay');
async function main() {
  const origin = new URL(process.env.STOREFRONT_URL);
  if (origin.protocol !== 'https:' || !process.env.RAZORPAY_WEBHOOK_SECRET) throw new Error('Configure the HTTPS storefront and webhook secret first');
  const client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  const url = `${origin.origin}/api/payments/razorpay/webhook`;
  const required = ['payment.captured', 'payment.failed', 'refund.created', 'refund.processed', 'refund.failed'];
  const before = await client.webhooks.all({ count: 100 });
  const existing = before.items.find(webhook => webhook.url === url);
  // The merchant v1 endpoint expects event-name/boolean pairs. The partner v2
  // examples use arrays, which the merchant endpoint rejects as numeric names.
  const events = { ...(Array.isArray(existing?.events) ? Object.fromEntries(existing.events.map(name => [name, true])) : existing?.events), ...Object.fromEntries(required.map(name => [name, true])) };
  const payload = { url, active: true, secret: process.env.RAZORPAY_WEBHOOK_SECRET, events };
  const saved = existing ? await client.webhooks.edit(payload, existing.id) : await client.webhooks.create(payload);
  const after = (await client.webhooks.all({ count: 100 })).items.find(webhook => webhook.id === saved.id);
  const enabled = name => Array.isArray(after?.events) ? after.events.includes(name) : after?.events?.[name] === true;
  if (!after?.active || !after.secret_exists || !required.every(enabled)) throw new Error('Provider read-back did not confirm the required configuration');
  console.log(JSON.stringify({ url, active: true, secretExists: true, enabledEvents: required }));
}
main().catch(() => { console.error('Webhook configuration failed. Check provider access, HTTPS URL and server credentials.'); process.exitCode = 1; });
