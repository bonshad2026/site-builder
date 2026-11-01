import { randomToken } from '../../common/crypto.js';

export interface PaymentRequest {
  amountMinor: bigint;
  currency: string;
  callbackUrl: string;
  description: string;
  email?: string;
  mobile?: string;
}

export type VerifyResult = { ok: true; refId: string; cardPan?: string } | { ok: false; reason: string };

export interface PaymentGateway {
  readonly name: 'zarinpal' | 'zibal' | 'idpay' | 'sandbox';
  /** True when no real money moves. Such payments are recorded as `test_paid`. */
  readonly isTest: boolean;
  request(req: PaymentRequest): Promise<{ authority: string; redirectUrl: string }>;
  /** Server-to-server confirmation. The only thing that may mark a payment as succeeded. */
  verify(args: { authority: string; amountMinor: bigint; currency: string; sandboxDecision?: string | null }): Promise<VerifyResult>;
}

type Fetch = typeof fetch;

/**
 * Zarinpal REST v4. Amounts are sent in rials (IRR).
 * Written against Zarinpal's published API; not exercised against the live service in this repo.
 */
export class ZarinpalGateway implements PaymentGateway {
  readonly name = 'zarinpal' as const;
  readonly isTest: boolean;
  private readonly base: string;

  constructor(
    private readonly merchantId: string,
    useSandboxHost: boolean,
    private readonly http: Fetch = fetch,
  ) {
    // The sandbox host moves no money, so its payments must not count as paid.
    this.isTest = useSandboxHost;
    this.base = useSandboxHost ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
  }

  private async post(path: string, body: object) {
    const res = await this.http(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown> | unknown[]; errors?: unknown };
    const data = Array.isArray(json.data) ? {} : (json.data ?? {});
    return { data: data as Record<string, unknown>, errors: json.errors };
  }

  async request(req: PaymentRequest) {
    if (req.currency !== 'IRR') throw new Error('Zarinpal only supports IRR');
    const { data, errors } = await this.post('/pg/v4/payment/request.json', {
      merchant_id: this.merchantId,
      amount: Number(req.amountMinor),
      currency: 'IRR',
      callback_url: req.callbackUrl,
      description: req.description.slice(0, 255),
      metadata: { email: req.email, mobile: req.mobile },
    });
    if (data.code !== 100 || typeof data.authority !== 'string') {
      throw new Error(`Zarinpal rejected the payment request: ${JSON.stringify(errors ?? data)}`);
    }
    return { authority: data.authority, redirectUrl: `${this.base}/pg/StartPay/${data.authority}` };
  }

  async verify({ authority, amountMinor }: { authority: string; amountMinor: bigint }): Promise<VerifyResult> {
    const { data, errors } = await this.post('/pg/v4/payment/verify.json', { merchant_id: this.merchantId, amount: Number(amountMinor), authority });
    // 100 = verified now, 101 = already verified earlier (idempotent).
    if (data.code === 100 || data.code === 101) return { ok: true, refId: String(data.ref_id), cardPan: typeof data.card_pan === 'string' ? data.card_pan : undefined };
    return { ok: false, reason: `Gateway did not confirm the payment (${JSON.stringify(errors ?? data.code ?? 'no response')})` };
  }
}

async function postJson(http: Fetch, url: string, body: object, headers: Record<string, string> = {}) {
  const res = await http(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/**
 * Zibal (zibal.ir). Amounts in rials. The merchant "zibal" is Zibal's own test merchant, whose
 * payments move no money and count as test payments.
 * Written against Zibal's published API; not exercised against the live service in this repo.
 */
export class ZibalGateway implements PaymentGateway {
  readonly name = 'zibal' as const;
  readonly isTest: boolean;
  private readonly base = 'https://gateway.zibal.ir';

  constructor(
    private readonly merchant: string,
    private readonly http: Fetch = fetch,
  ) {
    this.isTest = merchant === 'zibal';
  }

  async request(req: PaymentRequest) {
    if (req.currency !== 'IRR') throw new Error('Zibal only supports IRR');
    const { json } = await postJson(this.http, `${this.base}/v1/request`, {
      merchant: this.merchant,
      amount: Number(req.amountMinor),
      callbackUrl: req.callbackUrl,
      description: req.description.slice(0, 255),
      ...(req.mobile ? { mobile: req.mobile } : {}),
    });
    if (json.result !== 100 || json.trackId === undefined) throw new Error(`Zibal rejected the payment request: ${JSON.stringify(json)}`);
    const trackId = String(json.trackId);
    return { authority: trackId, redirectUrl: `${this.base}/start/${trackId}` };
  }

  async verify({ authority }: { authority: string }): Promise<VerifyResult> {
    const { json } = await postJson(this.http, `${this.base}/v1/verify`, { merchant: this.merchant, trackId: Number(authority) });
    // 100 = verified now, 201 = verified before.
    if (json.result === 100 || json.result === 201) return { ok: true, refId: String(json.refNumber ?? authority), cardPan: typeof json.cardNumber === 'string' ? json.cardNumber : undefined };
    return { ok: false, reason: `Gateway did not confirm the payment (${JSON.stringify(json.result ?? json.message ?? 'no response')})` };
  }
}

/**
 * IDPay (idpay.ir). Amounts in rials. With "test mode" the sandbox header is sent and no money moves.
 * Written against IDPay's published API (v1.1); not exercised against the live service in this repo.
 */
export class IdpayGateway implements PaymentGateway {
  readonly name = 'idpay' as const;
  readonly isTest: boolean;
  private readonly base = 'https://api.idpay.ir/v1.1';

  constructor(
    private readonly apiKey: string,
    sandbox: boolean,
    private readonly http: Fetch = fetch,
  ) {
    this.isTest = sandbox;
  }

  private headers() {
    return { 'X-API-KEY': this.apiKey, ...(this.isTest ? { 'X-SANDBOX': '1' } : {}) };
  }

  async request(req: PaymentRequest) {
    if (req.currency !== 'IRR') throw new Error('IDPay only supports IRR');
    const orderId = randomToken(10);
    const { json } = await postJson(
      this.http,
      `${this.base}/payment`,
      { order_id: orderId, amount: Number(req.amountMinor), callback: req.callbackUrl, desc: req.description.slice(0, 255), ...(req.mobile ? { phone: req.mobile } : {}), ...(req.email ? { mail: req.email } : {}) },
      this.headers(),
    );
    if (typeof json.id !== 'string' || typeof json.link !== 'string') throw new Error(`IDPay rejected the payment request: ${JSON.stringify(json)}`);
    // The order id is needed to verify; it travels with the payment id.
    return { authority: `${json.id}:${orderId}`, redirectUrl: json.link };
  }

  async verify({ authority }: { authority: string }): Promise<VerifyResult> {
    const [id, orderId] = authority.split(':');
    const { json } = await postJson(this.http, `${this.base}/payment/verify`, { id, order_id: orderId }, this.headers());
    // 100 = verified now, 101 = verified before.
    const status = Number(json.status);
    if (status === 100 || status === 101) {
      const payment = (json.payment ?? {}) as Record<string, unknown>;
      return { ok: true, refId: String(json.track_id ?? id), cardPan: typeof payment.card_no === 'string' ? payment.card_no : undefined };
    }
    return { ok: false, reason: `Gateway did not confirm the payment (${JSON.stringify(json.status ?? json.error_message ?? 'no response')})` };
  }
}

/**
 * DEVELOPMENT/DEMO gateway. It shows a local "approve or decline" page and
 * moves no money. Payments it confirms are stored as `test_paid`, never `paid`.
 * Refused in production by config validation.
 */
export class SandboxGateway implements PaymentGateway {
  readonly name = 'sandbox' as const;
  readonly isTest = true;

  constructor(private readonly pageUrl: (authority: string) => string) {}

  async request() {
    const authority = `SBX-${randomToken(12)}`;
    return { authority, redirectUrl: this.pageUrl(authority) };
  }

  async verify({ sandboxDecision }: { sandboxDecision?: string | null }): Promise<VerifyResult> {
    return sandboxDecision === 'approved' ? { ok: true, refId: `TEST-${randomToken(6)}` } : { ok: false, reason: 'Declined on the sandbox page' };
  }
}
