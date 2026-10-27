import nodemailer from 'nodemailer';
import type { Env } from '../../config/env.js';
import type { Logger } from '../../common/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export interface SmsSender {
  readonly name: string;
  /** Sends a one-time code. Throws if the provider did not accept the message. */
  sendOtp(phone: string, code: string): Promise<void>;
}

/**
 * DEVELOPMENT ONLY. Messages are logged and kept in memory so tests and local
 * development can read them. Config validation forbids this in production.
 */
export class ConsoleEmailSender implements EmailSender {
  readonly name = 'console';
  readonly outbox: EmailMessage[] = [];
  constructor(private readonly log: Logger) {}
  async send(message: EmailMessage) {
    this.outbox.push(message);
    this.log.info({ to: message.to, subject: message.subject }, `[dev email]\n${message.text}`);
  }
}

export class ConsoleSmsSender implements SmsSender {
  readonly name = 'console';
  readonly outbox: { phone: string; code: string }[] = [];
  constructor(private readonly log: Logger) {}
  async sendOtp(phone: string, code: string) {
    this.outbox.push({ phone, code });
    this.log.info({ phone }, `[dev sms] one-time code: ${code}`);
  }
}

export class SmtpEmailSender implements EmailSender {
  readonly name = 'smtp';
  private readonly transport;
  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }
  async send(message: EmailMessage) {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** Kavenegar "verify/lookup" template API. Not exercised against the live service in this repo. */
export class KavenegarSmsSender implements SmsSender {
  readonly name = 'kavenegar';
  constructor(
    private readonly apiKey: string,
    private readonly template: string,
  ) {}
  async sendOtp(phone: string, code: string) {
    const url = new URL(`https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/verify/lookup.json`);
    url.searchParams.set('receptor', phone);
    url.searchParams.set('token', code);
    url.searchParams.set('template', this.template);
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string } } | null;
    if (!res.ok || body?.return?.status !== 200) {
      throw new Error(`SMS provider rejected the message: ${body?.return?.message ?? res.status}`);
    }
  }
}

export function createNotifiers(env: Env, log: Logger): { email: EmailSender; sms: SmsSender } {
  const email: EmailSender = env.EMAIL_PROVIDER === 'smtp' ? new SmtpEmailSender(env.SMTP_URL!, env.EMAIL_FROM) : new ConsoleEmailSender(log);
  const sms: SmsSender =
    env.SMS_PROVIDER === 'kavenegar' ? new KavenegarSmsSender(env.KAVENEGAR_API_KEY!, env.KAVENEGAR_OTP_TEMPLATE ?? 'verify') : new ConsoleSmsSender(log);
  return { email, sms };
}
