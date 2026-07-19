'use client';

import { useState } from 'react';
import type { AdminOrderRow } from '@/server/order-data';
import { inputClass, secondaryButtonClass } from '../ui';

function formatInr(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

const STATUS_STYLES: Record<string, string> = {
  CREATED: 'bg-slate-100 text-slate-700',
  PAID: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  FULFILLING: 'bg-amber-100 text-amber-900 border border-amber-300',
  SHIPPED: 'bg-blue-100 text-blue-800 border border-blue-300',
  DELIVERED: 'bg-emerald-100 text-emerald-900 border border-emerald-400',
  CANCELLED: 'bg-slate-200 text-slate-700',
  REFUNDED: 'bg-red-100 text-red-800 border border-red-300',
};

export function AdminOrdersTable({
  orders,
  markShippedAction,
}: {
  orders: readonly AdminOrderRow[];
  markShippedAction: (formData: FormData) => Promise<void>;
}) {
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedOrders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyQikinkText = (o: AdminOrderRow) => {
    const addr = o.address;
    const name = addr?.name || 'N/A';
    const line1 = addr?.line1 || '';
    const line2 = addr?.line2 ? ` ${addr.line2}` : '';
    const city = addr?.city || '';
    const state = addr?.state || '';
    const pincode = addr?.pincode || '';
    const phone = addr?.phone || o.phone || 'N/A';
    const email = addr?.email || o.email || 'N/A';

    const itemsText = o.items
      .map(
        (it, idx) =>
          `Item ${idx + 1}: "${it.slogan || 'Tee'}" | Color: ${it.color.toUpperCase()} | Size: ${it.size} | Fit: ${it.fit} | Qty: ${it.quantity} | Line Total: ₹${formatInr(it.lineTotal)}`,
      )
      .join('\n');

    const text = [
      `ORDER ID: ${o.id}`,
      `PAYMENT ID: ${o.razorpayPaymentId || 'N/A'}`,
      `TOTAL PAID: ₹${formatInr(o.total)}`,
      `--------------------------------------------------`,
      `CUSTOMER SHIPPING ADDRESS:`,
      `Name: ${name}`,
      `Address: ${line1}${line2}`,
      `City/State/Pin: ${city}, ${state} - ${pincode}`,
      `Phone: ${phone}`,
      `Email: ${email}`,
      `--------------------------------------------------`,
      `ITEMS TO PRINT & SHIP:`,
      itemsText,
    ].join('\n');

    void navigator.clipboard.writeText(text);
    setCopiedId(o.id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm font-sans">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="border-b border-slate-200 bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-700">
          <tr>
            <th className="px-4 py-3">Order & Payment IDs</th>
            <th className="px-4 py-3">Customer Contact</th>
            <th className="px-4 py-3">Items Summary</th>
            <th className="px-4 py-3">Total (₹)</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Order Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white text-slate-900">
          {orders.map((o) => {
            const isExpanded = expandedOrders[o.id] === true;
            const canShip = o.status === 'PAID' || o.status === 'FULFILLING';
            const addr = o.address;

            return (
              <tr key={o.id} className="group flex-col">
                <td colSpan={6} className="p-0">
                  {/* Primary Row Header */}
                  <div
                    onClick={() => toggleExpand(o.id)}
                    className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    {/* Order & Payment IDs */}
                    <div className="min-w-[180px]">
                      <div className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="text-slate-400 text-[10px]">#{o.id.slice(-8)}</span>
                        <span>{o.id}</span>
                      </div>
                      {o.razorpayPaymentId ? (
                        <div className="font-mono text-xs font-bold text-blue-700 mt-0.5">
                          Pay ID: {o.razorpayPaymentId}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">Pending payment</div>
                      )}
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {o.createdAt.toISOString().slice(0, 10)}
                      </div>
                    </div>

                    {/* Customer Contact */}
                    <div className="min-w-[160px] text-xs">
                      <div className="font-bold text-slate-900">{addr?.name || o.email || 'Guest Customer'}</div>
                      <div className="text-slate-600">{o.email || '—'}</div>
                      <div className="text-slate-500 font-mono">{o.phone || ''}</div>
                    </div>

                    {/* Items Summary */}
                    <div className="min-w-[180px] text-xs">
                      <div className="font-semibold text-slate-900">
                        {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                      </div>
                      <div className="text-slate-600 truncate max-w-[220px]">
                        {o.items.map((i) => `${i.slogan || 'Tee'} (${i.color}/${i.size})`).join(', ')}
                      </div>
                    </div>

                    {/* Total */}
                    <div className="font-bold text-slate-900 text-sm">
                      ₹{formatInr(o.total)}
                    </div>

                    {/* Status Badge */}
                    <div>
                      <span
                        className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold ${
                          STATUS_STYLES[o.status] ?? 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {o.status}
                      </span>
                    </div>

                    {/* Expand Toggle Button */}
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(o.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 transition-colors shadow-xs"
                      >
                        <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
                        <span className="text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Order Details Drawer */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50/90 p-5 space-y-5">
                      {/* Top Action Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                        <div className="text-xs text-slate-600 font-medium">
                          Order ID: <strong className="font-mono text-slate-900">{o.id}</strong>
                          {o.razorpayPaymentId && (
                            <span className="ml-3">
                              Razorpay Payment ID: <strong className="font-mono text-blue-700">{o.razorpayPaymentId}</strong>
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => copyQikinkText(o)}
                          className="inline-flex items-center gap-2 rounded bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs"
                        >
                          <span>📋</span>
                          <span>{copiedId === o.id ? 'Copied to Clipboard!' : 'Copy Details for Qikink'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* 1. Itemized Products Card */}
                        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-100 pb-2">
                            📦 Products to Print & Ship ({o.items.length})
                          </h4>
                          {o.items.length === 0 ? (
                            <p className="text-xs text-slate-400">No item details recorded.</p>
                          ) : (
                            <div className="space-y-3">
                              {o.items.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-md border border-slate-200 bg-slate-50/50 p-3 text-xs space-y-1.5"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="font-bold text-slate-900 text-sm">
                                      {item.slogan ? `"${item.slogan}"` : 'T-Shirt'}
                                    </div>
                                    <div className="font-bold text-slate-900">
                                      ₹{formatInr(item.lineTotal)}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1 border-t border-slate-200/60">
                                    <div>
                                      Color: <strong className="uppercase text-slate-900">{item.color}</strong>
                                    </div>
                                    <div>
                                      Size: <strong className="text-slate-900">{item.size}</strong>
                                    </div>
                                    <div>
                                      Fit: <strong className="text-slate-900">{item.fit}</strong>
                                    </div>
                                    <div>
                                      Quantity: <strong className="text-slate-900">{item.quantity}</strong>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. Full Shipping Address Card */}
                        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-100 pb-2">
                            📍 Customer & Delivery Address
                          </h4>
                          {addr ? (
                            <div className="text-xs space-y-1.5 text-slate-800">
                              <div className="font-bold text-slate-900 text-sm">{addr.name}</div>
                              <div className="text-slate-700">{addr.line1}</div>
                              {addr.line2 && <div className="text-slate-700">{addr.line2}</div>}
                              <div className="font-bold text-slate-900 pt-1">
                                {addr.city}, {addr.state} - {addr.pincode}
                              </div>
                              <div className="pt-2 border-t border-slate-100 mt-2 space-y-1 text-slate-600">
                                <div>📞 Mobile Phone: <strong className="font-mono text-slate-900">{addr.phone || o.phone || 'N/A'}</strong></div>
                                <div>✉️ Email: <strong className="text-slate-900">{addr.email || o.email || 'N/A'}</strong></div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-600 space-y-1">
                              <div>Email: {o.email || '—'}</div>
                              <div>Phone: {o.phone || '—'}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bottom Fulfillment / Mark Shipped Controls */}
                      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                            Order Status & Tracking
                          </h4>
                          <p className="text-xs text-slate-600 mt-1">
                            Status: <strong className="text-slate-900 uppercase">{o.status}</strong>
                            {o.trackingId && (
                              <span className="ml-3">
                                Tracking ID: <strong className="font-mono text-slate-900">{o.trackingId}</strong>
                              </span>
                            )}
                          </p>
                        </div>

                        {canShip ? (
                          <form action={markShippedAction} className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            <input type="hidden" name="orderId" value={o.id} />
                            <input
                              name="trackingId"
                              placeholder="Tracking ID"
                              required
                              className={inputClass}
                            />
                            <input
                              name="trackingUrl"
                              placeholder="Tracking URL"
                              type="url"
                              required
                              className={inputClass}
                            />
                            <button type="submit" className={secondaryButtonClass}>
                              Mark Shipped
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">
                            {o.status === 'SHIPPED' || o.status === 'DELIVERED'
                              ? '✅ Order is marked shipped'
                              : 'Order not in shippable state'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
