/**
 * Invoice_Service — GST-compliant invoicing for the India market.
 *
 * Responsibilities (see design.md / requirements.md, Requirement 9):
 * - Validate GST rate configuration bounds 0..28 percent; reject out-of-range
 *   submissions and retain the prior rate (Req 9.1, 9.2).
 * - Compute GST per order line item at the configured rate, in integer paise,
 *   rounding half-up to the nearest paise (Req 9.3).
 * - Present the tax breakup as CGST + SGST for intra-state deliveries (delivery
 *   state equals the seller's state) and as IGST for inter-state deliveries,
 *   with CGST + SGST always equal to the equivalent IGST for the same base
 *   (Req 9.4).
 * - Generate an invoice carrying the seller GSTIN, garment HSN code, legal
 *   entity name/address, and tax breakup, with a unique invoice number
 *   (Req 9.5, 9.6).
 * - Express all invoice monetary amounts in INR derived from stored paise by
 *   dividing by 100 with exactly two decimal places, leaving stored paise
 *   unchanged (Req 9.7).
 * - Generate an invoice for an order exactly when it is marked paid and no
 *   invoice already exists for that order (Req 9.8).
 *
 * All monetary arithmetic is delegated to the Money module (integer paise,
 * half-up rounding, no floating point). The service is a pure(ish) domain
 * module: it performs no I/O itself and receives configuration plus any
 * existing-invoice / sequence context from its callers, so the persistence
 * layer (Prisma) owns the actual `@unique` enforcement of the invoice number.
 */

import { type Result, ok, err, isErr } from '../lib/result';
import {
  type Paise,
  type MoneyError,
  makePaise,
  add,
  applyRatePercentHalfUp,
  toINRString,
} from '../lib/money';
import { type Config_Service, config as defaultConfig } from './config';

/** Inclusive GST rate bounds in percent (Req 9.1). */
export const GST_RATE_MIN = 0;
export const GST_RATE_MAX = 28;

/** A single taxable line of an order: its net (pre-tax) amount in paise. */
export interface InvoiceOrderLine {
  /** Net taxable amount for this line in integer paise (price × qty, post-discount). */
  readonly net: Paise;
}

/** The subset of an order the Invoice_Service needs to build an invoice. */
export interface InvoiceOrder {
  readonly id: string;
  /** Order lifecycle status; an invoice is generated only when this is PAID. */
  readonly status: OrderStatusLike;
  /** Delivery address state, compared against the seller state for CGST/SGST vs IGST. */
  readonly deliveryState: string;
  /** Per-line net taxable amounts (Req 9.3 — GST computed per line item). */
  readonly lines: readonly InvoiceOrderLine[];
}

/** Order statuses relevant to invoicing (mirrors the Prisma OrderStatus enum). */
export type OrderStatusLike =
  | 'CREATED'
  | 'PAID'
  | 'FULFILLING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

/** Intra-state tax breakup: Central + State GST (Req 9.4). */
export interface CgstSgst {
  readonly kind: 'CGST_SGST';
  readonly cgst: Paise;
  readonly sgst: Paise;
}

/** Inter-state tax breakup: Integrated GST (Req 9.4). */
export interface Igst {
  readonly kind: 'IGST';
  readonly igst: Paise;
}

export type TaxBreakup = CgstSgst | Igst;

/** Existing invoice marker used to enforce one-invoice-per-order (Req 9.8). */
export interface ExistingInvoice {
  readonly invoiceNumber: string;
}

/** Context supplied by the caller when generating an invoice. */
export interface GenerateInvoiceContext {
  /** An existing invoice for the order, if one already exists (else null/undefined). */
  readonly existingInvoice?: ExistingInvoice | null;
  /**
   * A monotonically increasing sequence number backing invoice-number
   * uniqueness. Callers source this from a persistent counter; the DB
   * `@unique` constraint on `Invoice.invoiceNumber` is the final guarantee.
   */
  readonly sequence: number;
  /** Generation time; defaults to now. Used for the invoice number prefix and timestamp. */
  readonly now?: Date;
}

/** A generated GST invoice (Req 9.5, 9.6, 9.7). */
export interface GeneratedInvoice {
  readonly invoiceNumber: string;
  readonly orderId: string;
  readonly sellerGstin: string;
  readonly hsn: string;
  readonly legalEntityName: string;
  readonly legalEntityAddress: string;
  readonly taxBreakup: TaxBreakup;
  /** Total net taxable value across all lines, in paise. */
  readonly taxableValue: Paise;
  /** Total GST across all lines, in paise (CGST+SGST or IGST). */
  readonly totalTax: Paise;
  /** Grand total (taxable value + total tax), in paise. */
  readonly grandTotal: Paise;
  readonly createdAt: Date;
  /** INR string presentation derived from paise, two decimals (Req 9.7). */
  readonly display: InvoiceDisplay;
}

/** INR-formatted presentation of the invoice amounts (Req 9.7). */
export interface InvoiceDisplay {
  readonly taxableValue: string;
  readonly totalTax: string;
  readonly grandTotal: string;
  readonly cgst?: string;
  readonly sgst?: string;
  readonly igst?: string;
}

/** Discriminated error type for invoicing operations. */
export type InvoiceError =
  | { readonly kind: 'RATE_OUT_OF_RANGE'; readonly message: string }
  | { readonly kind: 'ORDER_NOT_PAID'; readonly message: string }
  | { readonly kind: 'INVOICE_EXISTS'; readonly message: string }
  | { readonly kind: 'MISSING_CONFIG'; readonly message: string }
  | { readonly kind: 'MONEY_ERROR'; readonly message: string; readonly cause: MoneyError };

function moneyErr(cause: MoneyError): InvoiceError {
  return { kind: 'MONEY_ERROR', message: cause.message, cause };
}

/**
 * Validate a submitted GST rate against the configured bounds (Req 9.1, 9.2).
 *
 * Returns the accepted rate when it is a finite number within 0..28 percent
 * inclusive; otherwise returns an error and the caller retains the previous
 * rate (this function never mutates anything).
 */
export function validateGstRatePercent(
  submitted: number,
): Result<number, InvoiceError> {
  if (
    !Number.isFinite(submitted) ||
    submitted < GST_RATE_MIN ||
    submitted > GST_RATE_MAX
  ) {
    return err({
      kind: 'RATE_OUT_OF_RANGE',
      message: `GST rate must be a number between ${GST_RATE_MIN} and ${GST_RATE_MAX} percent, received ${submitted}`,
    });
  }
  return ok(submitted);
}

export interface Invoice_Service {
  /** Compute GST for a single line net amount, half-up to integer paise (Req 9.3). */
  computeLineTax(lineNet: Paise, ratePercent: number): Result<Paise, InvoiceError>;
  /** Sum the per-line GST across an order's lines (Req 9.3). */
  computeOrderTax(
    lines: readonly InvoiceOrderLine[],
    ratePercent: number,
  ): Result<Paise, InvoiceError>;
  /** Produce the CGST/SGST vs IGST breakup for an order (Req 9.4). */
  taxBreakup(order: InvoiceOrder): Result<TaxBreakup, InvoiceError>;
  /** Generate an invoice iff the order is paid and none already exists (Req 9.5, 9.8). */
  generateInvoice(
    order: InvoiceOrder,
    ctx: GenerateInvoiceContext,
  ): Result<GeneratedInvoice, InvoiceError>;
}

/** Sum a list of line net amounts using validated paise arithmetic. */
function sumLineNets(
  lines: readonly InvoiceOrderLine[],
): Result<Paise, InvoiceError> {
  const zero = makePaise(0);
  if (isErr(zero)) return err(moneyErr(zero.error));
  let acc: Paise = zero.value;
  for (const line of lines) {
    const next = add(acc, line.net);
    if (isErr(next)) return err(moneyErr(next.error));
    acc = next.value;
  }
  return ok(acc);
}

/**
 * Split a total GST amount into equal CGST and SGST halves such that their sum
 * always equals the original total (Req 9.4). CGST takes the half-up half so
 * that an odd number of paise is never lost:
 *   cgst = ceil(total / 2), sgst = total - cgst.
 */
function splitCgstSgst(total: Paise): Result<CgstSgst, InvoiceError> {
  const totalNum = total as number;
  const cgstResult = makePaise(Math.ceil(totalNum / 2));
  if (isErr(cgstResult)) return err(moneyErr(cgstResult.error));
  const sgstResult = makePaise(totalNum - (cgstResult.value as number));
  if (isErr(sgstResult)) return err(moneyErr(sgstResult.error));
  return ok({ kind: 'CGST_SGST', cgst: cgstResult.value, sgst: sgstResult.value });
}

function normalizeState(state: string): string {
  return state.trim().toLowerCase();
}

/** Build the invoice number: `INV-{YYYY}-{zero-padded sequence}` (Req 9.5). */
function buildInvoiceNumber(sequence: number, now: Date): string {
  const year = now.getUTCFullYear();
  const seq = Math.trunc(sequence);
  const padded = String(seq).padStart(6, '0');
  return `INV-${year}-${padded}`;
}

/**
 * Create an Invoice_Service bound to a Config_Service. Configuration (GST rate,
 * GSTIN, HSN, seller state, legal entity) is read lazily on each call so admin
 * edits take effect without recreating the service.
 */
export function createInvoiceService(
  cfg: Config_Service = defaultConfig,
): Invoice_Service {
  function computeLineTax(
    lineNet: Paise,
    ratePercent: number,
  ): Result<Paise, InvoiceError> {
    const rateCheck = validateGstRatePercent(ratePercent);
    if (isErr(rateCheck)) return rateCheck;
    const taxed = applyRatePercentHalfUp(lineNet, ratePercent);
    if (isErr(taxed)) return err(moneyErr(taxed.error));
    return ok(taxed.value);
  }

  function computeOrderTax(
    lines: readonly InvoiceOrderLine[],
    ratePercent: number,
  ): Result<Paise, InvoiceError> {
    const rateCheck = validateGstRatePercent(ratePercent);
    if (isErr(rateCheck)) return rateCheck;

    const zero = makePaise(0);
    if (isErr(zero)) return err(moneyErr(zero.error));
    let acc: Paise = zero.value;
    // GST is computed per line item (Req 9.3), then summed.
    for (const line of lines) {
      const lineTax = computeLineTax(line.net, ratePercent);
      if (isErr(lineTax)) return lineTax;
      const next = add(acc, lineTax.value);
      if (isErr(next)) return err(moneyErr(next.error));
      acc = next.value;
    }
    return ok(acc);
  }

  function taxBreakup(order: InvoiceOrder): Result<TaxBreakup, InvoiceError> {
    const ratePercent = cfg.gstRatePercent();
    const totalTax = computeOrderTax(order.lines, ratePercent);
    if (isErr(totalTax)) return totalTax;

    const sellerState = cfg.sellerState();
    if (sellerState.trim().length === 0) {
      return err({
        kind: 'MISSING_CONFIG',
        message: 'Seller state is not configured; cannot determine CGST/SGST vs IGST',
      });
    }

    const intraState =
      normalizeState(order.deliveryState) === normalizeState(sellerState);

    if (intraState) {
      return splitCgstSgst(totalTax.value);
    }
    return ok({ kind: 'IGST', igst: totalTax.value });
  }

  function generateInvoice(
    order: InvoiceOrder,
    ctx: GenerateInvoiceContext,
  ): Result<GeneratedInvoice, InvoiceError> {
    // Generate only when the order is paid (Req 9.8).
    if (order.status !== 'PAID') {
      return err({
        kind: 'ORDER_NOT_PAID',
        message: `Cannot generate an invoice for order ${order.id} in status ${order.status}; order must be PAID`,
      });
    }

    // Generate only when no invoice already exists (Req 9.8 — idempotent).
    if (ctx.existingInvoice != null) {
      return err({
        kind: 'INVOICE_EXISTS',
        message: `Order ${order.id} already has invoice ${ctx.existingInvoice.invoiceNumber}`,
      });
    }

    // Required Owner_Input invoice fields (Req 9.5, 9.6).
    const sellerGstin = cfg.sellerGstin();
    const hsn = cfg.garmentHsn();
    const legalEntityName = cfg.legalEntityName();
    const legalEntityAddress = cfg.legalEntityAddress();
    const missing: string[] = [];
    if (sellerGstin.trim().length === 0) missing.push('seller GSTIN');
    if (hsn.trim().length === 0) missing.push('garment HSN');
    if (legalEntityName.trim().length === 0) missing.push('legal entity name');
    if (legalEntityAddress.trim().length === 0) missing.push('legal entity address');
    if (missing.length > 0) {
      return err({
        kind: 'MISSING_CONFIG',
        message: `Cannot generate invoice; missing required configuration: ${missing.join(', ')}`,
      });
    }

    const taxableValue = sumLineNets(order.lines);
    if (isErr(taxableValue)) return taxableValue;

    const breakup = taxBreakup(order);
    if (isErr(breakup)) return breakup;

    const totalTax = totalTaxOf(breakup.value);
    if (isErr(totalTax)) return totalTax;

    const grandTotal = add(taxableValue.value, totalTax.value);
    if (isErr(grandTotal)) return err(moneyErr(grandTotal.error));

    const now = ctx.now ?? new Date();
    const invoiceNumber = buildInvoiceNumber(ctx.sequence, now);

    const display: InvoiceDisplay = {
      taxableValue: toINRString(taxableValue.value),
      totalTax: toINRString(totalTax.value),
      grandTotal: toINRString(grandTotal.value),
      ...(breakup.value.kind === 'CGST_SGST'
        ? {
            cgst: toINRString(breakup.value.cgst),
            sgst: toINRString(breakup.value.sgst),
          }
        : { igst: toINRString(breakup.value.igst) }),
    };

    return ok({
      invoiceNumber,
      orderId: order.id,
      sellerGstin,
      hsn,
      legalEntityName,
      legalEntityAddress,
      taxBreakup: breakup.value,
      taxableValue: taxableValue.value,
      totalTax: totalTax.value,
      grandTotal: grandTotal.value,
      createdAt: now,
      display,
    });
  }

  return { computeLineTax, computeOrderTax, taxBreakup, generateInvoice };
}

/** Total GST paise represented by a breakup (CGST+SGST or IGST). */
function totalTaxOf(breakup: TaxBreakup): Result<Paise, InvoiceError> {
  if (breakup.kind === 'IGST') return ok(breakup.igst);
  const sum = add(breakup.cgst, breakup.sgst);
  if (isErr(sum)) return err(moneyErr(sum.error));
  return ok(sum.value);
}

/** Default Invoice_Service bound to the default Config_Service. */
export const invoiceService: Invoice_Service = createInvoiceService();
