import { NextResponse } from 'next/server';

const PUBLIC_ROUTES = ['/', '/login', '/forgot-password', '/reset-password', '/enterprise', '/features', '/pricing', '/product', '/resources'];
const ADMIN_ROUTES = ['/admin', '/dashboard/admin', '/audit'];
const SUPERIOR_ROUTES = ['/recommendations'];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => route === '/' ? pathname === '/' : pathname.startsWith(route))) {
    return NextResponse.next();
  }


  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Read auth cookies set by authStore on login
  const hasToken = request.cookies.get('accessToken');
  const isAdmin = request.cookies.get('auth_is_admin')?.value === 'true';
  const roleLevel = parseInt(request.cookies.get('auth_role_level')?.value || '10');

  // No token — redirect to login with return URL
  if (!hasToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  if (ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Superior-only routes
  if (SUPERIOR_ROUTES.some(route => pathname.startsWith(route))) {
    if (roleLevel > 5 && !isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};