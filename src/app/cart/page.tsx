/**
 * /cart — server-rendered guest cart (Requirement 5).
 *
 * Reads the guest cart via the httpOnly `cartSessionId` cookie and the isolated
 * `cart-data` layer, then renders each line with the product slogan, variant
 * (color/size/fit), unit price, quantity, and line total, plus the cart
 * subtotal — all money formatted paise→INR via the Money module. Quantity
 * updates and line removal use no-JS HTML forms bound to server actions.
 *
 * Degrades gracefully: when the DB is unavailable or the cart is empty, an
 * empty-cart message is shown rather than throwing (never crashes the build).
 */

import Link from 'next/link';

import { toINRString, makePaise } from '@/lib/money';
import { readCartSessionId } from '@/server/cart-session';
import { loadGuestCart, type LoadedCart } from '@/server/cart-data';
import { updateCartLineAction, removeCartLineAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your Cart',
};

/** Format an integer-paise amount as ₹ INR, falling back to ₹0.00 on bad data. */
function inr(paise: number): string {
  const validated = makePaise(paise);
  return `₹${validated.ok ? toINRString(validated.value) : '0.00'}`;
}

export default async function CartPage() {
  const sessionId = await readCartSessionId();
  const cart: LoadedCart =
    sessionId === undefined
      ? { cartId: null, lines: [], subtotal: 0 }
      : await loadGuestCart(sessionId);

  if (cart.lines.length === 0) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <h1 className="text-3xl font-black tracking-tight">Your cart</h1>
        <p className="text-muted">Your cart is empty.</p>
        <Link
          href="/shop"
          className="w-fit border border-ink px-4 py-2 text-sm font-bold uppercase tracking-wide"
        >
          Continue shopping
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-3xl font-black tracking-tight">Your cart</h1>

      <ul className="flex flex-col divide-y divide-ink/10 border-y border-ink/10">
        {cart.lines.map((line) => (
          <li key={line.lineId} className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/product/${line.productSlug}`}
                className="text-lg font-bold hover:underline"
              >
                {line.slogan}
              </Link>
              <span className="text-sm font-bold">{inr(line.lineTotal)}</span>
            </div>

            <p className="text-sm text-muted">
              {line.color} · {line.size} · {line.fit}
            </p>
            <p className="text-sm text-muted">
              Unit price {inr(line.unitPrice)}
            </p>

            <div className="flex flex-wrap items-center gap-4">
              {/* Update quantity — no-JS form. */}
              <form
                action={updateCartLineAction}
                className="flex items-center gap-2"
              >
                <input type="hidden" name="lineId" value={line.lineId} />
                <label
                  htmlFor={`qty-${line.lineId}`}
                  className="text-xs font-bold uppercase tracking-wide"
                >
                  Qty
                </label>
                <input
                  id={`qty-${line.lineId}`}
                  type="number"
                  name="qty"
                  min={1}
                  max={99}
                  defaultValue={line.qty}
                  className="w-16 border border-ink/20 dark:border-white/20 bg-transparent text-ink px-2 py-1 text-sm rounded"
                />
                <button
                  type="submit"
                  className="border border-ink dark:border-white/40 bg-transparent text-ink hover:bg-ink/5 dark:hover:bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors rounded"
                >
                  Update
                </button>
              </form>

              {/* Remove line — no-JS form. */}
              <form action={removeCartLineAction}>
                <input type="hidden" name="lineId" value={line.lineId} />
                <button
                  type="submit"
                  className="text-xs font-bold uppercase tracking-wide text-stamp-red underline"
                >
                  Remove
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-ink pt-4">
        <span className="text-lg font-bold uppercase tracking-wide">Subtotal</span>
        <span className="text-2xl font-black">{inr(cart.subtotal)}</span>
      </div>
      <p className="text-xs text-muted">
        Shipping and taxes are calculated at checkout.
      </p>

      <Link
        href="/checkout"
        className="w-fit bg-highlighter px-6 py-3 text-sm font-black uppercase tracking-wide text-ink"
      >
        Proceed to checkout
      </Link>
    </main>
  );
}
