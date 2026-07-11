/**
 * /admin/login — single-password gate.
 *
 * If `ADMIN_PASSWORD` is unset, shows a clear configuration message instead of
 * the form. Otherwise renders a plain HTML form posting to the login server
 * action. If a valid session already exists, redirect straight to the dashboard.
 */

import { redirect } from 'next/navigation';

import { hasAdminSession, isAdminConfigured } from '@/server/admin-auth';
import { Field, Notice, inputClass, primaryButtonClass } from '../ui';
import { loginAction } from './actions';

export const dynamic = 'force-dynamic';

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  if (await hasAdminSession()) {
    redirect('/admin');
  }

  const configured = isAdminConfigured();
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Admin Login</h1>
          <p className="mt-1 text-sm text-muted">Out of Office store management.</p>
        </div>

        {!configured ? (
          <Notice kind="error">
            Admin access is not configured. Set the <code className="font-mono">ADMIN_PASSWORD</code>{' '}
            environment variable (and <code className="font-mono">ADMIN_SESSION_SECRET</code>) and
            restart the server.
          </Notice>
        ) : (
          <>
            {error === 'invalid' && (
              <Notice kind="error">Incorrect password. Try again.</Notice>
            )}
            {error === 'unconfigured' && (
              <Notice kind="error">Admin access is not configured.</Notice>
            )}
            <form action={loginAction} className="space-y-4">
              <Field label="Password" htmlFor="password">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
              </Field>
              <button type="submit" className={`${primaryButtonClass} w-full`}>
                Log in
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
