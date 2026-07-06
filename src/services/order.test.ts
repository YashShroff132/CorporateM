import { describe, expect, it } from 'vitest';

import { makePaise, type Paise } from '../lib/money';
import { isOk, isErr } from '../lib/result';
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  createOrder,
  createOrderService,
  isTransitionAllowed,
  transitionOrder,
  type AddressSnapshot,
  type Order,
  type OrderLineSnapshot,
  type OrderStatus,
} from './order';

/** Helper: build a Paise value, throwing in test setup if out of range. */
function paise(n: number): Paise {
  const r = makePaise(n);
  if (!isOk(r)) throw new Error(`invalid test paise ${n}`);
  return r.value;
}

const address: AddressSnapshot = {
  name: 'Asha Rao',
  line1: '12 Church Street',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  phone: '9876543210',
  email: 'asha@example.com',
};

const line: OrderLineSnapshot = {
  variantId: 'var_1',
  sku: 'CC-TEE-BLK-M',
  color: 'Black',
  size: 'M',
  fit: 'Regular',
  unitPrice: paise(49_900),
  quantity: 2,
  lineTotal: paise(99_800),
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order_1',
    status: 'CREATED',
    fulfillmentMode: 'SELF',
    addressSnapshot: address,
    lineSnapshots: [line],
    trackingId: null,
    trackingUrl: null,
    ...overrides,
  };
}

describe('createOrder', () => {
  it('creates an order in CREATED status with snapshots (Req 10.4)', () => {
    const result = createOrder({
      id: 'order_1',
      addressSnapshot: address,
      lineSnapshots: [line],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.status).toBe('CREATED');
      expect(result.value.addressSnapshot).toEqual(address);
      expect(result.value.lineSnapshots).toEqual([line]);
    }
  });

  it('defaults the fulfillment mode to SELF (Req 10.8)', () => {
    const result = createOrder({
      id: 'order_1',
      addressSnapshot: address,
      lineSnapshots: [line],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.fulfillmentMode).toBe('SELF');
  });

  it('honors an explicit POD fulfillment mode (Req 10.8)', () => {
    const result = createOrder({
      id: 'order_1',
      addressSnapshot: address,
      lineSnapshots: [line],
      fulfillmentMode: 'POD',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.fulfillmentMode).toBe('POD');
  });

  it('rejects an order with no line snapshots (Req 10.4)', () => {
    const result = createOrder({
      id: 'order_1',
      addressSnapshot: address,
      lineSnapshots: [],
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('MISSING_SNAPSHOT');
  });
});

describe('isTransitionAllowed (Req 10.11)', () => {
  it('permits the transitions in the allowed set', () => {
    expect(isTransitionAllowed('CREATED', 'PAID')).toBe(true);
    expect(isTransitionAllowed('PAID', 'FULFILLING')).toBe(true);
    expect(isTransitionAllowed('PAID', 'SHIPPED')).toBe(true);
    expect(isTransitionAllowed('FULFILLING', 'SHIPPED')).toBe(true);
    expect(isTransitionAllowed('SHIPPED', 'DELIVERED')).toBe(true);
    expect(isTransitionAllowed('DELIVERED', 'REFUNDED')).toBe(true);
  });

  it('rejects transitions outside the allowed set', () => {
    expect(isTransitionAllowed('CREATED', 'SHIPPED')).toBe(false);
    expect(isTransitionAllowed('DELIVERED', 'SHIPPED')).toBe(false);
    expect(isTransitionAllowed('CANCELLED', 'PAID')).toBe(false);
    expect(isTransitionAllowed('REFUNDED', 'PAID')).toBe(false);
  });

  it('treats CANCELLED and REFUNDED as terminal', () => {
    for (const next of ORDER_STATUSES) {
      expect(isTransitionAllowed('CANCELLED', next)).toBe(false);
      expect(isTransitionAllowed('REFUNDED', next)).toBe(false);
    }
  });
});

describe('transitionOrder', () => {
  it('rejects an unknown target status (Req 10.1)', () => {
    const result = transitionOrder(order(), 'BOGUS' as OrderStatus);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('INVALID_STATUS');
  });

  it('rejects a disallowed transition and leaves status unchanged (Req 10.11)', () => {
    const o = order({ status: 'CREATED' });
    const result = transitionOrder(o, 'SHIPPED', {
      tracking: { trackingId: 'TRK1', trackingUrl: 'https://track/1' },
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('TRANSITION_NOT_ALLOWED');
    expect(o.status).toBe('CREATED');
  });

  it('does not mutate the input order on success', () => {
    const o = order({ status: 'CREATED' });
    const result = transitionOrder(o, 'PAID');
    expect(isOk(result)).toBe(true);
    expect(o.status).toBe('CREATED');
    if (isOk(result)) expect(result.value.status).toBe('PAID');
  });

  describe('SHIPPED transition (Req 10.2, 10.9)', () => {
    it('records tracking and ships from PAID', () => {
      const result = transitionOrder(order({ status: 'PAID' }), 'SHIPPED', {
        tracking: { trackingId: 'TRK123', trackingUrl: 'https://track/123' },
      });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.status).toBe('SHIPPED');
        expect(result.value.trackingId).toBe('TRK123');
        expect(result.value.trackingUrl).toBe('https://track/123');
      }
    });

    it('ships from FULFILLING', () => {
      const result = transitionOrder(order({ status: 'FULFILLING' }), 'SHIPPED', {
        tracking: { trackingId: 'TRK123', trackingUrl: 'https://track/123' },
      });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value.status).toBe('SHIPPED');
    });

    it('rejects shipping without tracking and leaves status unchanged (Req 10.9)', () => {
      const o = order({ status: 'PAID' });
      const result = transitionOrder(o, 'SHIPPED');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.kind).toBe('TRACKING_REQUIRED');
      expect(o.status).toBe('PAID');
    });

    it('rejects shipping with an empty tracking id or url (Req 10.9)', () => {
      const emptyId = transitionOrder(order({ status: 'PAID' }), 'SHIPPED', {
        tracking: { trackingId: '   ', trackingUrl: 'https://track/1' },
      });
      const emptyUrl = transitionOrder(order({ status: 'PAID' }), 'SHIPPED', {
        tracking: { trackingId: 'TRK1', trackingUrl: '' },
      });
      expect(isErr(emptyId)).toBe(true);
      expect(isErr(emptyUrl)).toBe(true);
    });
  });

  describe('REFUNDED transition (Req 10.7, 10.10)', () => {
    it('refunds a PAID order on gateway success', () => {
      const result = transitionOrder(order({ status: 'PAID' }), 'REFUNDED', {
        refundOutcome: { success: true },
      });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value.status).toBe('REFUNDED');
    });

    it('leaves status unchanged when the gateway refund fails (Req 10.10)', () => {
      const o = order({ status: 'PAID' });
      const result = transitionOrder(o, 'REFUNDED', {
        refundOutcome: { success: false, detail: 'gateway error' },
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.kind).toBe('REFUND_FAILED');
      expect(o.status).toBe('PAID');
    });

    it('rejects a refund with no gateway outcome supplied (Req 10.7)', () => {
      const result = transitionOrder(order({ status: 'PAID' }), 'REFUNDED');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.kind).toBe('REFUND_FAILED');
    });
  });

  it('follows the full happy-path lifecycle CREATED→PAID→FULFILLING→SHIPPED→DELIVERED', () => {
    const svc = createOrderService();
    let current = order({ status: 'CREATED' });
    const paid = svc.transition(current, 'PAID');
    expect(isOk(paid)).toBe(true);
    if (!isOk(paid)) return;
    const fulfilling = svc.transition(paid.value, 'FULFILLING');
    expect(isOk(fulfilling)).toBe(true);
    if (!isOk(fulfilling)) return;
    const shipped = svc.transition(fulfilling.value, 'SHIPPED', {
      tracking: { trackingId: 'TRK9', trackingUrl: 'https://track/9' },
    });
    expect(isOk(shipped)).toBe(true);
    if (!isOk(shipped)) return;
    const delivered = svc.transition(shipped.value, 'DELIVERED');
    expect(isOk(delivered)).toBe(true);
    if (isOk(delivered)) expect(delivered.value.status).toBe('DELIVERED');
    current = order();
  });
});

describe('ALLOWED_TRANSITIONS integrity', () => {
  it('references only known statuses', () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(ORDER_STATUSES).toContain(from as OrderStatus);
      for (const t of targets) expect(ORDER_STATUSES).toContain(t);
    }
  });
});
