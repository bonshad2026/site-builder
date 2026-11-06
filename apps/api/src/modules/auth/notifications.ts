import nodemailer from 'nodemailer';
import type { Env } from '../../config/env.js';
import type { Logger } from '../../common/logger.js';

export const SMS_OPT_OUT_FOOTER = 'لغو ۱۱';
/** Normalize old trailing forms and append the footer exactly once on its own line. */
export function withSmsFooter(text:string):string {
  const body=text.replace(/(?:\s*لغو[ \t]*[۱١1]{2})+\s*$/u,'').trimEnd();
  return body ? body+'\n'+SMS_OPT_OUT_FOOTER : SMS_OPT_OUT_FOOTER;
}
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
  /** Sends a plain text message (request updates). Throws if the provider did not accept it. */
  sendText(phone: string, text: string): Promise<void>;
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
  readonly outbox: { phone: string; code: string; text:string }[] = [];
  readonly texts: { phone: string; text: string }[] = [];
  constructor(private readonly log: Logger) {}
  async sendOtp(phone: string, code: string) {
    const text=withSmsFooter(`کد تأیید شما: ${code}`);
    this.outbox.push({ phone, code, text });
    this.log.info({ phone }, `[dev sms] ${text}`);
  }
  async sendText(phone: string, text: string) {
    text=withSmsFooter(text);
    this.texts.push({ phone, text });
    this.log.info({ phone }, `[dev sms] ${text}`);
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
    private readonly sender?: string,
  ) {}
  async sendText(phone: string, text: string) {
    const url = new URL(`https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/sms/send.json`);
    url.searchParams.set('receptor', phone);
    url.searchParams.set('message', withSmsFooter(text));
    if (this.sender) url.searchParams.set('sender', this.sender);
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string } } | null;
    if (!res.ok || body?.return?.status !== 200) {
      throw new Error(`SMS provider rejected the message: ${body?.return?.message ?? res.status}`);
    }
  }
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

/** Messaging set in the admin panel (Platform → Messaging); secrets are stored encrypted. */
export interface PanelMessaging {
  email: { enabled: boolean; smtpUrl: string; from: string };
  sms: { enabled: boolean; apiKey: string; otpTemplate: string; sender: string };
}
export type MessagingLoader = () => Promise<PanelMessaging | null>;

/** Used when the server is told to take messaging from the panel and the panel has none yet. */
class NotConfigured implements EmailSender, SmsSender {
  readonly name = 'not-configured';
  constructor(private readonly what: string) {}
  private fail(): never {
    throw new Error(`${this.what} is not set up yet (admin panel: Platform → Messaging)`);
  }
  async send() {
    this.fail();
  }
  async sendOtp() {
    this.fail();
  }
  async sendText() {
    this.fail();
  }
}

/**
 * Sends through the provider set in the admin panel when it is turned on there, else through the
 * one from the server's environment. Settings are re-read at most every 30 seconds.
 */
class PanelSender implements EmailSender, SmsSender {
  private cached: { at: number; value: PanelMessaging | null } = { at: 0, value: null };
  private built: { key: string; email?: EmailSender; sms?: SmsSender } = { key: '' };
  constructor(
    private readonly fallbackEmail: EmailSender,
    private readonly fallbackSms: SmsSender,
    private readonly load: MessagingLoader,
    private readonly kind: 'email' | 'sms',
  ) {}

  /** The sender in use (known after the first message; the environment's until then). */
  get name() {
    return this.kind === 'email' ? (this.built.email ?? this.fallbackEmail).name : (this.built.sms ?? this.fallbackSms).name;
  }
  /** Tests read the development outboxes through these. */
  get outbox() {
    return this.kind === 'email' ? (this.fallbackEmail as ConsoleEmailSender).outbox : (this.fallbackSms as ConsoleSmsSender).outbox;
  }
  get texts() {
    return (this.fallbackSms as ConsoleSmsSender).texts;
  }

  /** Forget the cached settings (after they are saved). */
  reset() {
    this.cached = { at: 0, value: null };
  }

  private async current() {
    if (Date.now() - this.cached.at > 30_000) this.cached = { at: Date.now(), value: await this.load().catch(() => null) };
    const v = this.cached.value;
    const key = JSON.stringify(v);
    if (this.built.key !== key) {
      this.built = {
        key,
        email: v?.email.enabled && v.email.smtpUrl ? new SmtpEmailSender(v.email.smtpUrl, v.email.from) : undefined,
        sms: v?.sms.enabled && v.sms.apiKey ? new KavenegarSmsSender(v.sms.apiKey, v.sms.otpTemplate || 'verify', v.sms.sender || undefined) : undefined,
      };
    }
    return this.built;
  }

  async send(message: EmailMessage) {
    await ((await this.current()).email ?? this.fallbackEmail).send(message);
  }
  async sendOtp(phone: string, code: string) {
    await ((await this.current()).sms ?? this.fallbackSms).sendOtp(phone, code);
  }
  async sendText(phone: string, text: string) {
    await ((await this.current()).sms ?? this.fallbackSms).sendText(phone, text);
  }
}

export function createNotifiers(env: Env, log: Logger, load: MessagingLoader = async () => null): { email: EmailSender; sms: SmsSender; reset: () => void } {
  const email: EmailSender =
    env.EMAIL_PROVIDER === 'smtp' ? new SmtpEmailSender(env.SMTP_URL!, env.EMAIL_FROM) : env.EMAIL_PROVIDER === 'panel' ? new NotConfigured('E-mail') : new ConsoleEmailSender(log);
  const sms: SmsSender =
    env.SMS_PROVIDER === 'kavenegar'
      ? new KavenegarSmsSender(env.KAVENEGAR_API_KEY!, env.KAVENEGAR_OTP_TEMPLATE ?? 'verify', env.KAVENEGAR_SENDER)
      : env.SMS_PROVIDER === 'panel'
        ? new NotConfigured('SMS')
        : new ConsoleSmsSender(log);
  const panelEmail = new PanelSender(email, sms, load, 'email');
  const panelSms = new PanelSender(email, sms, load, 'sms');
  return {
    email: panelEmail,
    sms: panelSms,
    reset: () => {
      panelEmail.reset();
      panelSms.reset();
    },
  };
}
