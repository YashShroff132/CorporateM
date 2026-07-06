'use server';

/**
 * Admin login/logout server actions. The login action verifies the submitted
 * password against `ADMIN_PASSWORD` (constant-time) and, on success, writes the
 * signed session cookie then redirects to the dashboard. On failure it
 * redirects back to the login page with an error flag (no password echoed).
 */

import { redirect } from 'next/navigation';

import {
  establishAdminSession,
  clearAdminSession,
  isAdminConfigured,
  verifyPassword,
} from '@/server/admin-auth';

export async function loginAction(formData: FormData): Promise<void> {
  if (!isAdminConfigured()) {
    redirect('/admin/login?error=unconfigured');
  }
  const password = formData.get('password');
  const candidate = typeof password === 'string' ? password : '';
  if (!verifyPassword(candidate)) {
    redirect('/admin/login?error=invalid');
  }
  await establishAdminSession();
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  await clearAdminSession();
  redirect('/admin/login');
}
