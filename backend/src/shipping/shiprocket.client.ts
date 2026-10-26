import { Injectable, ServiceUnavailableException, BadGatewayException, BadRequestException } from '@nestjs/common';

export class ShiprocketRejectedException extends BadRequestException {
  constructor() { super('Shiprocket rejected the request. Check the pickup location, delivery address and parcel details before retrying.'); }
}
@Injectable()
export class ShiprocketClient {
  private token = '';
  private expiresAt = 0;
  private authenticating?: Promise<string>;
  get configured() { return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD); }
  private async authenticate(): Promise<string> {
    if (!this.configured) throw new ServiceUnavailableException('Configure SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD on the backend.');
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (!this.authenticating) this.authenticating = (async () => {
      try {
        const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }), signal: AbortSignal.timeout(20000) });
        const data = await response.json() as Record<string, unknown>;
        if (!response.ok || typeof data.token !== 'string') throw new Error('Authentication failed');
        this.token = data.token; this.expiresAt = Date.now() + 9 * 86400000; return this.token;
      } catch { throw new ServiceUnavailableException('Shiprocket authentication failed. Check the API user credentials on the backend.'); }
    })().finally(() => { this.authenticating = undefined; });
    return this.authenticating;
  }
  async request(path: string, method = 'GET', body?: unknown): Promise<any> {
    const token = await this.authenticate();
    try {
      const response = await fetch(`https://apiv2.shiprocket.in/v1/external/${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
      if (response.status === 401) { this.token = ''; this.expiresAt = 0; }
      const data = await response.json();
      if ([400, 401, 403, 422].includes(response.status)) throw new ShiprocketRejectedException();
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      return data;
    } catch (error) { if (error instanceof ShiprocketRejectedException) throw error; throw new BadGatewayException('Shiprocket did not confirm this request. Refresh provider details before retrying a booking or pickup.'); }
  }
}
