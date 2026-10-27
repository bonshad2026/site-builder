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
  readonly name: 'zarinpal' | 'sandbox';
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
