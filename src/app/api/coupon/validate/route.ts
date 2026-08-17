import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { applyCoupon, type Coupon, type OrderTotals } from '@/services/checkout';
import { makePaise, type Paise } from '@/lib/money';
import { isErr } from '@/lib/result';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, subtotalPaise } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ ok: false, error: 'Coupon code is required.' }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();

    // Look up coupon in Prisma DB
    let coupon: Coupon | null = null;
    try {
      const prisma = getPrisma();
      const dbCoupon = await prisma.coupon.findUnique({
        where: { code: cleanCode },
      });

      if (dbCoupon) {
        coupon = {
          code: dbCoupon.code,
          discountType: dbCoupon.discountType as 'FLAT' | 'PERCENT',
          discountValue: dbCoupon.discountValue,
          minSubtotal: (dbCoupon.minSubtotal ?? 0) as Paise,
          active: dbCoupon.active,
          expiresAt: dbCoupon.expiresAt,
        };
      }
    } catch {
      // If DB is offline, allow standard OOO10 fallback
    }

    // Fallback for standard advertised code OOO10 (10% OFF)
    if (!coupon && cleanCode === 'OOO10') {
      coupon = {
        code: 'OOO10',
        discountType: 'PERCENT',
        discountValue: 10,
        minSubtotal: 0 as Paise,
        active: true,
        expiresAt: null,
      };
    }

    if (!coupon) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired coupon code.' }, { status: 404 });
    }

    // Evaluate coupon against provided subtotal
    const subtotal = makePaise(Number(subtotalPaise || 0));
    const dummyTotals: OrderTotals = {
      subtotal: subtotal.ok ? subtotal.value : (0 as Paise),
      discount: 0 as Paise,
      shipping: 0 as Paise,
      tax: 0 as Paise,
      total: subtotal.ok ? subtotal.value : (0 as Paise),
    };

    const applied = applyCoupon(dummyTotals, coupon);

    if (isErr(applied)) {
      return NextResponse.json({ ok: false, error: applied.error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountPaise: applied.value.discount as number,
      },
    });
  } catch (err) {
    console.error('Coupon validation error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to validate coupon.' }, { status: 500 });
  }
}
