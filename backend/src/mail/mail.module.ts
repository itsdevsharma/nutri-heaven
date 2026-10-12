import { Injectable, Module, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class MailService {
  get configured() { return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.STOREFRONT_URL); }
  url(path: string) {
    const origin = process.env.STOREFRONT_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
    if (!origin) throw new ServiceUnavailableException('Email service is not configured');
    return new URL(path, origin).toString();
  }
  async send(to: string, subject: string, text: string, key: string) {
    if (!this.configured) {
      if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Email service is not configured');
      return false;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
    }).catch(() => { throw new ServiceUnavailableException('Email delivery is unavailable. Please try again later.'); });
    if (!response.ok) throw new ServiceUnavailableException('Email delivery is unavailable. Please try again later.');
    return true;
  }
}
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
