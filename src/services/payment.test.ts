import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '@/lib/result';
import { makePaise, type Paise } from '@/lib/money';
import { createConfigService } from './config';
import {
  computeCheckoutSignature,
  createPaymentService,
  PAYMENT_METHOD_ORDER,
  type CreateRazorpayOrderRequest,
  type PayableOrder,
  type RazorpayApiOrder,
  type RazorpayCallback,
  type RazorpayHttpClient,
} from './payment';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const KEY_ID = 'rzp_test_abcdef123456';
const KEY_SECRET = 'test_secret_key_value';

/** Config bound to a fixed in-memory env with test Razorpay credentials. */
function testConfig(overrides: Record<string, string | undefined> = {}) {
  return createConfigService({
    RAZORPAY_KEY_ID: KEY_ID,
    RAZORPAY_KEY_SECRET: KEY_SECRET,
    ...overrides,
  });
}

/** A fake Razorpay client that echoes the requested amount and records calls. */
function fakeClient(): RazorpayHttpClient & { calls: CreateRazorpayOrderRequest[] } {
  const calls: CreateRazorpayOrderRequest[] = [];
  return {
    calls,
    async createOrder(req: CreateRazorpayOrderRequest): Promise<RazorpayApiOrder> {
      calls.push(req);
      return { id: 'order_TEST123', amount: req.amount, currency: req.currency };
    },
  };
}

function paise(n: number): Paise {
  const r = makePaise(n);
  if (isErr(r)) throw new Error(`bad test amount ${n}`);
  return r.value;
}

// ---------------------------------------------------------------------------
// createRazorpayOrder (Req 8.1, 8.10)
// ---------------------------------------------------------------------------

describe('createRazorpayOrder (Req 8.1, 8.10)', () => {
  it('creates a Razorpay order with amount equal to the order total in paise', async () => {
    const client = fakeClient();
    const svc = createPaymentService(client, testConfig());
    const order: PayableOrder = { id: 'ord_1', total: paise(129900) };

    const result = await svc.createRazorpayOrder(order);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.amount).toBe(129900);
      expect(result.value.currency).toBe('INR');
      expect(result.value.receipt).toBe('ord_1');
      expect(result.value.razorpayOrderId).toBe('order_TEST123');
    }
    expect(client.calls).toHaveLength(1);
    const call = client.calls[0];
    expect(call).toBeDefined();
    expect(call?.amount).toBe(129900);
    expect(call?.receipt).toBe('ord_1');
  });

  it('leaves the order unpaid (returns error) when the Razorpay API call fails', async () => {
    const failing: RazorpayHttpClient = {
      async createOrder(): Promise<RazorpayApiOrder> {
        throw new Error('network down');
      },
    };
    const svc = createPaymentService(failing, testConfig());

    const result = await svc.createRazorpayOrder({ id: 'ord_2', total: paise(5000) });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ORDER_CREATION_FAILED');
    }
  });

  it('errors when Razorpay echoes a different amount than requested', async () => {
    const mismatched: RazorpayHttpClient = {
      async createOrder(req): Promise<RazorpayApiOrder> {
        return { id: 'order_X', amount: req.amount + 1, currency: req.currency };
      },
    };
    const svc = createPaymentService(mismatched, testConfig());

    const result = await svc.createRazorpayOrder({ id: 'ord_3', total: paise(5000) });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ORDER_CREATION_FAILED');
    }
  });

  it('errors without calling Razorpay when credentials are missing', async () => {
    const client = fakeClient();
    const svc = createPaymentService(
      client,
      testConfig({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }),
    );

    const result = await svc.createRazorpayOrder({ id: 'ord_4', total: paise(5000) });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('MISSING_CONFIG');
    }
    expect(client.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// UPI-first ordering (Req 8.2)
// ---------------------------------------------------------------------------

describe('payment method ordering (Req 8.2)', () => {
  it('ranks UPI first, then card, netbanking, wallet', () => {
    expect(PAYMENT_METHOD_ORDER).toEqual(['upi', 'card', 'netbanking', 'wallet']);
  });

  it('exposes the UPI-first order in checkout options', async () => {
    const svc = createPaymentService(fakeClient(), testConfig());
    const created = await svc.createRazorpayOrder({ id: 'ord_5', total: paise(1000) });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const opts = svc.checkoutOptions(created.value);
    expect(isOk(opts)).toBe(true);
    if (isOk(opts)) {
      expect(opts.value.methodOrder[0]).toBe('upi');
      expect(opts.value.key).toBe(KEY_ID);
      expect(opts.value.amount).toBe(1000);
    }
  });
});

// ---------------------------------------------------------------------------
// Signature verification (Req 8.3, 8.4)
// ---------------------------------------------------------------------------

describe('verifySignature (Req 8.3, 8.4)', () => {
  const svc = createPaymentService(fakeClient(), testConfig());

  function signedCallback(orderId: string, paymentId: string): RazorpayCallback {
    return {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: computeCheckoutSignature(orderId, paymentId, KEY_SECRET),
      method: 'upi',
    };
  }

  it('accepts a valid server-computed signature', () => {
    const payload = signedCallback('order_TEST123', 'pay_TEST123');
    expect(svc.verifySignature(payload)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const payload = signedCallback('order_TEST123', 'pay_TEST123');
    const tampered: RazorpayCallback = {
      ...payload,
      razorpaySignature: `${payload.razorpaySignature.slice(0, -1)}0`,
    };
    expect(svc.verifySignature(tampered)).toBe(false);
  });

  it('rejects when the payment id has been swapped', () => {
    const payload = signedCallback('order_TEST123', 'pay_TEST123');
    const swapped: RazorpayCallback = { ...payload, razorpayPaymentId: 'pay_OTHER' };
    expect(svc.verifySignature(swapped)).toBe(false);
  });

  it('rejects empty identifiers or signature', () => {
    expect(
      svc.verifySignature({
        razorpayOrderId: '',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'abc',
      }),
    ).toBe(false);
  });

  it('rejects everything when no key secret is configured', () => {
    const noSecret = createPaymentService(
      fakeClient(),
      testConfig({ RAZORPAY_KEY_SECRET: '' }),
    );
    const payload = signedCallback('order_TEST123', 'pay_TEST123');
    expect(noSecret.verifySignature(payload)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// paymentDetailsForPaidOrder (Req 8.7, 8.9)
// ---------------------------------------------------------------------------

describe('paymentDetailsForPaidOrder (Req 8.7, 8.9)', () => {
  const svc = createPaymentService(fakeClient(), testConfig());

  it('returns identifiers/method for a verified callback', () => {
    const orderId = 'order_TEST123';
    const paymentId = 'pay_TEST123';
    const payload: RazorpayCallback = {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: computeCheckoutSignature(orderId, paymentId, KEY_SECRET),
      method: 'upi',
    };

    const result = svc.paymentDetailsForPaidOrder(payload);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: payload.razorpaySignature,
        paymentMethod: 'upi',
      });
      // No credential-bearing fields are ever present (Req 8.9).
      const keys = Object.keys(result.value);
      expect(keys).not.toContain('card');
      expect(keys).not.toContain('upiId');
      expect(keys).not.toContain('vpa');
    }
  });

  it('refuses to produce stored details when verification fails', () => {
    const result = svc.paymentDetailsForPaidOrder({
      razorpayOrderId: 'order_TEST123',
      razorpayPaymentId: 'pay_TEST123',
      razorpaySignature: 'deadbeef',
    });
    expect(isErr(result)).toBe(true);
  });

  it('defaults payment method to null when absent', () => {
    const orderId = 'order_TEST123';
    const paymentId = 'pay_NoMethod';
    const result = svc.paymentDetailsForPaidOrder({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: computeCheckoutSignature(orderId, paymentId, KEY_SECRET),
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.paymentMethod).toBeNull();
    }
  });
});
