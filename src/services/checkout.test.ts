import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '@/lib/result';
import { makePaise, type Paise } from '@/lib/money';
import { createConfigService } from './config';
import { createInvoiceService } from './invoice';
import {
  applyCoupon,
  autofillPincode,
  buildOrderLineSnapshots,
  createInMemoryPincodeDirectory,
  guestAccountCreationOffer,
  isValidEmail,
  isValidIndianMobile,
  isValidLineQuantity,
  isValidPincodeFormat,
  priceOrder,
  validateGuestContact,
  type CheckoutError,
  type Coupon,
  type OrderTotals,
  type PincodeDirectory,
  type PricedOrderLine,
} from './checkout';

/** Helper: build a Paise value, throwing in test setup if out of range. */
function paise(n: number): Paise {
  const r = makePaise(n);
  if (!isOk(r)) throw new Error(`invalid test paise ${n}`);
  return r.value;
}

/** An Invoice_Service with a known 18% GST rate for deterministic pricing tests. */
const invoice18 = createInvoiceService(
  createConfigService({
    GST_RATE_PERCENT: '18',
    SELLER_GSTIN: '29ABCDE1234F1Z5',
    GARMENT_HSN: '61091000',
    SELLER_STATE: 'Karnataka',
    LEGAL_ENTITY_NAME: 'Corporate Cult Retail Pvt Ltd',
    LEGAL_ENTITY_ADDRESS: 'No. 1, MG Road, Bengaluru, Karnataka 560001',
  }),
);

const priceOpts = { gstRatePercent: 18, invoice: invoice18 } as const;

const directory: PincodeDirectory = createInMemoryPincodeDirectory({
  '560001': { city: 'Bengaluru', state: 'Karnataka' },
  '110001': { city: 'New Delhi', state: 'Delhi' },
  '400001': { city: 'Mumbai', state: 'Maharashtra' },
});

describe('autofillPincode (Req 7.2, 7.10)', () => {
  it('populates city and state for a valid serviceable pincode', () => {
    const result = autofillPincode('560001', directory);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ city: 'Bengaluru', state: 'Karnataka' });
    }
  });

  it('trims surrounding whitespace before lookup', () => {
    const result = autofillPincode('  110001  ', directory);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.state).toBe('Delhi');
    }
  });

  it('rejects a well-formed but non-serviceable pincode as unrecognized', () => {
    const result = autofillPincode('999999', directory);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('UNRECOGNIZED_PINCODE');
    }
  });

  it.each(['12345', '1234567', '05601', 'ABCDEF', '', '12 45 6'])(
    'rejects malformed pincode %j as invalid',
    (bad) => {
      const result = autofillPincode(bad, directory);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe('INVALID_PINCODE');
      }
    },
  );

  it('ignores malformed seed keys so invalid pincodes never appear serviceable', () => {
    const dir = createInMemoryPincodeDirectory({
      // Malformed key must be dropped.
      abc: { city: 'Nowhere', state: 'Nowhere' },
      '000000': { city: 'Nowhere', state: 'Nowhere' },
      '560001': { city: 'Bengaluru', state: 'Karnataka' },
    });
    expect(isErr(autofillPincode('000000', dir))).toBe(true);
    expect(isOk(autofillPincode('560001', dir))).toBe(true);
  });
});

describe('validateGuestContact (Req 7.1, 7.9)', () => {
  it('accepts a valid email and 10-digit Indian mobile, normalizing values', () => {
    const result = validateGuestContact({
      email: '  buyer@example.com ',
      phone: ' 9876543210 ',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        email: 'buyer@example.com',
        phone: '9876543210',
      });
    }
  });

  it('identifies the email field when only the email is invalid', () => {
    const result = validateGuestContact({
      email: 'not-an-email',
      phone: '9876543210',
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      const error = result.error as Extract<CheckoutError, { kind: 'INVALID_CONTACT' }>;
      expect(error.kind).toBe('INVALID_CONTACT');
      expect(error.fields).toEqual(['email']);
    }
  });

  it('identifies the phone field when only the phone is invalid', () => {
    const result = validateGuestContact({
      email: 'buyer@example.com',
      phone: '12345', // too short and wrong prefix
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      const error = result.error as Extract<CheckoutError, { kind: 'INVALID_CONTACT' }>;
      expect(error.fields).toEqual(['phone']);
    }
  });

  it('identifies both fields when both are invalid', () => {
    const result = validateGuestContact({ email: 'bad', phone: '000' });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      const error = result.error as Extract<CheckoutError, { kind: 'INVALID_CONTACT' }>;
      expect(error.fields).toEqual(['email', 'phone']);
    }
  });

  it.each(['1234567890', '5876543210', '987654321', '98765432101', '+919876543210'])(
    'rejects invalid mobile %j',
    (phone) => {
      expect(isValidIndianMobile(phone)).toBe(false);
    },
  );

  it.each(['6000000000', '7123456789', '8888888888', '9999999999'])(
    'accepts valid mobile %j',
    (phone) => {
      expect(isValidIndianMobile(phone)).toBe(true);
    },
  );
});

describe('validation helpers', () => {
  it('validates pincode format', () => {
    expect(isValidPincodeFormat('560001')).toBe(true);
    expect(isValidPincodeFormat('012345')).toBe(false);
  });

  it('validates email format', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

describe('guestAccountCreationOffer (Req 7.8)', () => {
  it('offers account creation only after a successful purchase', () => {
    expect(guestAccountCreationOffer(true)).toBe(true);
    expect(guestAccountCreationOffer(false)).toBe(false);
  });
});

describe('isValidLineQuantity (Req 5.1, 5.2)', () => {
  it('accepts integers 1..99 and rejects everything else', () => {
    expect(isValidLineQuantity(1)).toBe(true);
    expect(isValidLineQuantity(99)).toBe(true);
    expect(isValidLineQuantity(50)).toBe(true);
    expect(isValidLineQuantity(0)).toBe(false);
    expect(isValidLineQuantity(100)).toBe(false);
    expect(isValidLineQuantity(1.5)).toBe(false);
    expect(isValidLineQuantity(-1)).toBe(false);
  });
});

describe('priceOrder (Req 7.3, 7.6)', () => {
  const lines: PricedOrderLine[] = [
    { variantId: 'v1', unitPrice: paise(50_000), quantity: 2 }, // 100000
    { variantId: 'v2', unitPrice: paise(30_000), quantity: 1 }, // 30000
  ];

  it('computes subtotal, tax, shipping, and total as integer paise', () => {
    const res = priceOrder(lines, { ...priceOpts, shipping: paise(7_900) });
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      const t = res.value;
      expect(t.subtotal as number).toBe(130_000);
      expect(t.discount as number).toBe(0);
      expect(t.shipping as number).toBe(7_900);
      // per-line 18%: 100000->18000, 30000->5400 = 23400
      expect(t.tax as number).toBe(23_400);
      // total = subtotal + shipping + tax
      expect(t.total as number).toBe(130_000 + 7_900 + 23_400);
      // every amount is an integer
      for (const v of Object.values(t)) {
        expect(Number.isInteger(v as number)).toBe(true);
      }
    }
  });

  it('defaults shipping to zero paise', () => {
    const res = priceOrder(lines, priceOpts);
    expect(isOk(res) && (res.value.shipping as number)).toBe(0);
  });

  it('rejects an out-of-range line quantity', () => {
    const bad: PricedOrderLine[] = [{ variantId: 'v', unitPrice: paise(100), quantity: 100 }];
    const res = priceOrder(bad, priceOpts);
    expect(isErr(res) && res.error.kind).toBe('INVALID_LINE');
  });
});

describe('buildOrderLineSnapshots (Req 7.7)', () => {
  it('records unit price, quantity, and derived line total per line', () => {
    const lines: PricedOrderLine[] = [
      { variantId: 'v1', sku: 'SKU-1', description: 'Reply All Tee', unitPrice: paise(49_900), quantity: 3 },
    ];
    const res = buildOrderLineSnapshots(lines);
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value).toHaveLength(1);
      const snap = res.value[0]!;
      expect(snap.variantId).toBe('v1');
      expect(snap.sku).toBe('SKU-1');
      expect(snap.description).toBe('Reply All Tee');
      expect(snap.unitPrice as number).toBe(49_900);
      expect(snap.quantity).toBe(3);
      expect(snap.lineTotal as number).toBe(149_700);
    }
  });

  it('defaults optional snapshot fields to null', () => {
    const res = buildOrderLineSnapshots([{ variantId: 'v', unitPrice: paise(100), quantity: 1 }]);
    if (isOk(res)) {
      expect(res.value[0]!.sku).toBeNull();
      expect(res.value[0]!.description).toBeNull();
    }
  });
});

describe('applyCoupon (Req 7.4, 7.5)', () => {
  const totals: OrderTotals = {
    subtotal: paise(100_000),
    discount: paise(0),
    shipping: paise(0),
    tax: paise(18_000),
    total: paise(118_000),
  };

  const activeFlat: Coupon = {
    code: 'FLAT500',
    discountType: 'FLAT',
    discountValue: 50_000,
    minSubtotal: paise(0),
    active: true,
    expiresAt: null,
  };

  it('applies a flat discount and reports the deducted amount', () => {
    const res = applyCoupon(totals, activeFlat);
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.discount as number).toBe(50_000);
      expect(res.value.total as number).toBe(68_000);
      // untouched fields
      expect(res.value.subtotal as number).toBe(100_000);
      expect(res.value.tax as number).toBe(18_000);
    }
  });

  it('applies a percentage discount half-up on the subtotal', () => {
    const pct: Coupon = {
      code: 'SAVE10',
      discountType: 'PERCENT',
      discountValue: 10,
      minSubtotal: paise(0),
      active: true,
    };
    const res = applyCoupon(totals, pct);
    if (isOk(res)) {
      // 10% of 100000 subtotal = 10000
      expect(res.value.discount as number).toBe(10_000);
      expect(res.value.total as number).toBe(108_000);
    }
  });

  it('floors the total at zero paise and never goes negative (Req 7.4)', () => {
    const huge: Coupon = {
      code: 'MEGA',
      discountType: 'FLAT',
      discountValue: 999_999,
      minSubtotal: paise(0),
      active: true,
    };
    const res = applyCoupon(totals, huge);
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.total as number).toBe(0);
      // effective discount capped at the pre-discount total
      expect(res.value.discount as number).toBe(118_000);
    }
  });

  it('rejects an inactive coupon leaving totals unchanged (Req 7.5)', () => {
    const res = applyCoupon(totals, { ...activeFlat, active: false });
    expect(isErr(res)).toBe(true);
    if (isErr(res)) expect(res.error.reason).toBe('INACTIVE');
  });

  it('rejects an expired coupon leaving totals unchanged (Req 7.5)', () => {
    const expired: Coupon = { ...activeFlat, expiresAt: new Date('2020-01-01T00:00:00Z') };
    const res = applyCoupon(totals, expired, new Date('2026-01-01T00:00:00Z'));
    expect(isErr(res)).toBe(true);
    if (isErr(res)) expect(res.error.reason).toBe('EXPIRED');
  });

  it('rejects a coupon when subtotal is below its minimum (Req 7.5)', () => {
    const res = applyCoupon(totals, { ...activeFlat, minSubtotal: paise(200_000) });
    expect(isErr(res)).toBe(true);
    if (isErr(res)) expect(res.error.reason).toBe('BELOW_MINIMUM');
  });

  it('does not mutate the input totals on rejection', () => {
    const snapshot = { ...totals };
    applyCoupon(totals, { ...activeFlat, active: false });
    expect(totals).toEqual(snapshot);
  });
});
