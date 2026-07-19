/**
 * Shared, no-JS-friendly admin UI primitives, Tailwind-styled with brand
 * tokens (ink / paper / corporate / highlighter / stamp-red / muted). Kept
 * intentionally plain: standard HTML form controls, server-rendered.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { isFlagEnabled } from '@/server/security/feature-flags';

export const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600';

export const labelClass =
  'block text-xs font-bold uppercase tracking-wide text-slate-600';

export const primaryButtonClass =
  'inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white hover:bg-slate-800 shadow-sm';

export const secondaryButtonClass =
  'inline-flex items-center justify-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-slate-800 hover:bg-slate-100 shadow-sm';

export const dangerButtonClass =
  'inline-flex items-center justify-center rounded border border-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-600 hover:bg-red-600 hover:text-white';

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1" htmlFor={htmlFor}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint !== undefined && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  const styles: Record<string, string> = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`rounded border px-4 py-3 text-sm font-medium ${styles[kind]}`}>
      {children}
    </div>
  );
}

export function AdminShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 light font-sans">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="text-lg font-black uppercase tracking-tight text-slate-900">
              OOFO Admin
            </Link>
            <nav className="flex items-center gap-6 text-sm font-bold uppercase tracking-wide text-slate-600">
              <Link href="/admin/products" className="hover:text-slate-900 transition-colors">
                Products
              </Link>
              <Link href="/admin/collections" className="hover:text-slate-900 transition-colors">
                Collections
              </Link>
              <Link href="/admin/orders" className="hover:text-slate-900 transition-colors">
                Orders
              </Link>
              {/* AI Studio entry point is shown only when the aiStudio flag is
                  enabled (Req 22.3 — omit disabled capability entry points from
                  the UI). The route itself also 404s when off (Req 22.4). */}
              {isFlagEnabled('aiStudio') && (
                <Link href="/admin/ai" className="hover:text-slate-900 transition-colors">
                  AI Studio
                </Link>
              )}
            </nav>
          </div>
          <form action="/admin/logout" method="post">
            <button type="submit" className="text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-red-600 transition-colors">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
