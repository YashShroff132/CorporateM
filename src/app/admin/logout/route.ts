/**
 * POST /admin/logout — clear the admin session cookie and return to login.
 * A route handler (rather than a server action) so the shared AdminShell can
 * post to it from any admin page with a plain HTML form.
 */

import { NextResponse } from 'next/server';

import { clearAdminSession } from '@/server/admin-auth';

export async function POST(request: Request): Promise<NextResponse> {
  await clearAdminSession();
  return NextResponse.redirect(new URL('/admin/login', request.url));
}
