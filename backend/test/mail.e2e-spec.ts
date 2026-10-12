import { MailService } from '../src/mail/mail.module';
describe('Transactional email adapter', () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM, url: process.env.STOREFRONT_URL, node: process.env.NODE_ENV };
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries({ RESEND_API_KEY: saved.key, MAIL_FROM: saved.from, STOREFRONT_URL: saved.url, NODE_ENV: saved.node })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  it('sends only through the server with a stable idempotency key', async () => {
    process.env.RESEND_API_KEY = 'test-provider-key'; process.env.MAIL_FROM = 'Nutri <hello@example.com>'; process.env.STOREFRONT_URL = 'https://shop.example.com';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true }); global.fetch = fetchMock;
    const mail = new MailService();
    expect(await mail.send('buyer@example.com', 'Reset password', 'Example link', 'reset-key')).toBe(true);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers['Idempotency-Key']).toBe('reset-key');
    expect(JSON.parse(options.body)).toMatchObject({ to: ['buyer@example.com'], subject: 'Reset password', text: 'Example link' });
    expect(mail.url('/account?reset=example')).toBe('https://shop.example.com/account?reset=example');
  });
  it('does not pretend to deliver when production email is unconfigured', async () => {
    process.env.NODE_ENV = 'production'; delete process.env.RESEND_API_KEY;
    await expect(new MailService().send('buyer@example.com', 'Test', 'Text', 'key')).rejects.toThrow('not configured');
  });
  it('hides provider errors and exposes a retryable service failure', async () => {
    process.env.RESEND_API_KEY = 'test-provider-key'; process.env.MAIL_FROM = 'hello@example.com'; process.env.STOREFRONT_URL = 'https://shop.example.com';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(new MailService().send('buyer@example.com', 'Test', 'Text', 'key')).rejects.toThrow('Email delivery is unavailable');
  });
});
