import { describe, expect, it } from 'vitest';

import { makePaise, type Paise } from '../lib/money';
import { isOk, isErr } from '../lib/result';
import { createConfigService } from './config';
import {
  createInvoiceService,
  validateGstRatePercent,
  type InvoiceOrder,
} from './invoice';

/** Helper: build a Paise value, throwing in test setup if out of range. */
function paise(n: number): Paise {
  const r = makePaise(n);
  if (!isOk(r)) throw new Error(`invalid test paise ${n}`);
  return r.value;
}

const baseEnv: Record<string, string> = {
  GST_RATE_PERCENT: '18',
  SELLER_GSTIN: '29ABCDE1234F1Z5',
  GARMENT_HSN: '61091000',
  SELLER_STATE: 'Karnataka',
  LEGAL_ENTITY_NAME: 'Corporate Cult Retail Pvt Ltd',
  LEGAL_ENTITY_ADDRESS: 'No. 1, MG Road, Bengaluru, Karnataka 560001',
};

function svc(env: Partial<Record<string, string>> = {}) {
  return createInvoiceService(createConfigService({ ...baseEnv, ...env }));
}

function order(overrides: Partial<InvoiceOrder> = {}): InvoiceOrder {
  return {
    id: 'order_1',
    status: 'PAID',
    deliveryState: 'Karnataka',
    lines: [{ net: paise(10_000) }],
    ...overrides,
  };
}

describe('validateGstRatePercent (Req 9.1, 9.2)', () => {
  it('accepts rates within 0..28 inclusive', () => {
    for (const r of [0, 5, 12, 18, 28, 18.5]) {
      const res = validateGstRatePercent(r);
      expect(isOk(res)).toBe(true);
    }
  });

  it('rejects rates below 0, above 28, and non-finite values', () => {
    for (const r of [-1, 28.01, 100, NaN, Infinity]) {
      const res = validateGstRatePercent(r);
      expect(isErr(res)).toBe(true);
      if (isErr(res)) expect(res.error.kind).toBe('RATE_OUT_OF_RANGE');
    }
  });
});

describe('computeLineTax (Req 9.3 — half-up integer paise)', () => {
  it('rounds half up to the nearest paise', () => {
    // 12345 paise * 18% = 2222.1 -> 2222
    const s = svc();
    const t1 = s.computeLineTax(paise(12_345), 18);
    expect(isOk(t1) && (t1.value as number)).toBe(2222);

    // 105 paise * 5% = 5.25 -> 5
    const t2 = s.computeLineTax(paise(105), 5);
    expect(isOk(t2) && (t2.value as number)).toBe(5);

    // 50 paise * 5% = 2.5 -> 3 (half rounds up)
    const t3 = s.computeLineTax(paise(50), 5);
    expect(isOk(t3) && (t3.value as number)).toBe(3);
  });

  it('produces integer paise results', () => {
    const s = svc();
    const t = s.computeLineTax(paise(999_999), 12);
    expect(isOk(t)).toBe(true);
    if (isOk(t)) expect(Number.isInteger(t.value as number)).toBe(true);
  });
});

describe('computeOrderTax (Req 9.3 — per-line then summed)', () => {
  it('sums per-line half-up tax across lines', () => {
    const s = svc();
    // Two lines of 50 paise at 5% each round to 3 -> total 6 (not 5 from summed-net).
    const res = s.computeOrderTax([{ net: paise(50) }, { net: paise(50) }], 5);
    expect(isOk(res) && (res.value as number)).toBe(6);
  });
});

describe('taxBreakup (Req 9.4 — CGST/SGST vs IGST by state)', () => {
  it('returns CGST + SGST for intra-state delivery', () => {
    const s = svc();
    const res = s.taxBreakup(order({ deliveryState: 'Karnataka', lines: [{ net: paise(10_000) }] }));
    expect(isOk(res)).toBe(true);
    if (isOk(res) && res.value.kind === 'CGST_SGST') {
      // 10000 * 18% = 1800 total -> 900 + 900
      expect(res.value.cgst as number).toBe(900);
      expect(res.value.sgst as number).toBe(900);
    } else {
      throw new Error('expected CGST_SGST');
    }
  });

  it('returns IGST for inter-state delivery', () => {
    const s = svc();
    const res = s.taxBreakup(order({ deliveryState: 'Maharashtra', lines: [{ net: paise(10_000) }] }));
    expect(isOk(res)).toBe(true);
    if (isOk(res) && res.value.kind === 'IGST') {
      expect(res.value.igst as number).toBe(1800);
    } else {
      throw new Error('expected IGST');
    }
  });

  it('CGST + SGST equals the equivalent IGST for the same base (Req 9.4)', () => {
    const s = svc();
    const lines = [{ net: paise(333) }, { net: paise(777) }];
    const intra = s.taxBreakup(order({ deliveryState: 'Karnataka', lines }));
    const inter = s.taxBreakup(order({ deliveryState: 'Delhi', lines }));
    if (isOk(intra) && intra.value.kind === 'CGST_SGST' && isOk(inter) && inter.value.kind === 'IGST') {
      expect((intra.value.cgst as number) + (intra.value.sgst as number)).toBe(
        inter.value.igst as number,
      );
    } else {
      throw new Error('unexpected breakup kinds');
    }
  });

  it('is case- and whitespace-insensitive when matching states', () => {
    const s = svc();
    const res = s.taxBreakup(order({ deliveryState: '  karnataka ' }));
    expect(isOk(res) && res.value.kind).toBe('CGST_SGST');
  });
});

describe('generateInvoice (Req 9.5, 9.6, 9.7, 9.8)', () => {
  it('generates an invoice for a paid order with no existing invoice', () => {
    const s = svc();
    const res = s.generateInvoice(order(), { sequence: 42, now: new Date('2026-03-01T00:00:00Z') });
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.invoiceNumber).toBe('INV-2026-000042');
      expect(res.value.sellerGstin).toBe('29ABCDE1234F1Z5');
      expect(res.value.hsn).toBe('61091000');
      expect(res.value.legalEntityName).toBe('Corporate Cult Retail Pvt Ltd');
      expect(res.value.legalEntityAddress).toContain('Bengaluru');
      // 10000 net + 1800 tax = 11800 grand total; INR display two decimals (Req 9.7).
      expect(res.value.display.taxableValue).toBe('100.00');
      expect(res.value.display.totalTax).toBe('18.00');
      expect(res.value.display.grandTotal).toBe('118.00');
      expect(res.value.display.cgst).toBe('9.00');
      expect(res.value.display.sgst).toBe('9.00');
    }
  });

  it('rejects generation when the order is not paid (Req 9.8)', () => {
    const s = svc();
    const res = s.generateInvoice(order({ status: 'CREATED' }), { sequence: 1 });
    expect(isErr(res) && res.error.kind).toBe('ORDER_NOT_PAID');
  });

  it('rejects generation when an invoice already exists (Req 9.8 idempotence)', () => {
    const s = svc();
    const res = s.generateInvoice(order(), {
      sequence: 2,
      existingInvoice: { invoiceNumber: 'INV-2026-000001' },
    });
    expect(isErr(res) && res.error.kind).toBe('INVOICE_EXISTS');
  });

  it('rejects generation when required config is missing (Req 9.6)', () => {
    const s = svc({ SELLER_GSTIN: '' });
    const res = s.generateInvoice(order(), { sequence: 3 });
    expect(isErr(res) && res.error.kind).toBe('MISSING_CONFIG');
  });

  it('distinct sequences yield distinct invoice numbers (Req 9.5)', () => {
    const s = svc();
    const now = new Date('2026-01-01T00:00:00Z');
    const a = s.generateInvoice(order(), { sequence: 1, now });
    const b = s.generateInvoice(order({ id: 'order_2' }), { sequence: 2, now });
    if (isOk(a) && isOk(b)) {
      expect(a.value.invoiceNumber).not.toBe(b.value.invoiceNumber);
    } else {
      throw new Error('expected both invoices to generate');
    }
  });
});
