/**
 * Shared, no-JS-friendly admin UI primitives, Tailwind-styled with brand
 * tokens (ink / paper / corporate / highlighter / stamp-red / muted). Kept
 * intentionally plain: standard HTML form controls, server-rendered.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { isFlagEnabled } from '@/server/security/feature-flags';

export const inputClass =
  'w-full rounded border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-corporate focus:ring-1 focus:ring-corporate';

export const labelClass =
  'block text-xs font-bold uppercase tracking-wide text-muted';

export const primaryButtonClass =
  'inline-flex items-center justify-center rounded bg-corporate px-4 py-2 text-sm font-bold uppercase tracking-wide text-white hover:bg-ink';

export const secondaryButtonClass =
  'inline-flex items-center justify-center rounded border border-ink/20 bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-ink hover:border-ink';

export const dangerButtonClass =
  'inline-flex items-center justify-center rounded border border-stamp-red px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-stamp-red hover:bg-stamp-red hover:text-white';

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
      {hint !== undefined && <span className="block text-xs text-muted">{hint}</span>}
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
    info: 'border-corporate/30 bg-corporate/5 text-corporate',
    error: 'border-stamp-red/40 bg-stamp-red/10 text-stamp-red',
    success: 'border-success/40 bg-success/10 text-success',
  };
  return (
    <div className={`rounded border px-4 py-3 text-sm ${styles[kind]}`}>
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
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-base font-black uppercase tracking-tight">
              Admin
            </Link>
            <nav className="flex items-center gap-4 text-sm font-bold uppercase tracking-wide text-muted">
              <Link href="/admin/products" className="hover:text-ink">
                Products
              </Link>
              <Link href="/admin/collections" className="hover:text-ink">
                Collections
              </Link>
              <Link href="/admin/orders" className="hover:text-ink">
                Orders
              </Link>
              {/* AI Studio entry point is shown only when the aiStudio flag is
                  enabled (Req 22.3 — omit disabled capability entry points from
                  the UI). The route itself also 404s when off (Req 22.4). */}
              {isFlagEnabled('aiStudio') && (
                <Link href="/admin/ai" className="hover:text-ink">
                  AI Studio
                </Link>
              )}
            </nav>
          </div>
          <form action="/admin/logout" method="post">
            <button type="submit" className="text-xs font-bold uppercase tracking-wide text-muted hover:text-stamp-red">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-black uppercase tracking-tight">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
