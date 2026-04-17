import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware'

/**
 * Auth middleware — runs on every request (except static assets and Next internals).
 * - Refreshes the Supabase session cookie
 * - Redirects unauthenticated users to /login
 * - Redirects authenticated users away from /login
 * - Returns 401 JSON for unauthenticated /api/* requests
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isLoginRoute = pathname === '/login' || pathname.startsWith('/login/')
  const isAuthRoute  = pathname.startsWith('/auth/')
  const isApiRoute   = pathname.startsWith('/api/')

  // Fail open for the login + diagnose routes if env vars are missing so the
  // user can still see diagnostic info instead of an opaque 500.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (isLoginRoute || isAuthRoute) return NextResponse.next()
    // For everything else, redirect to the diagnose page
    return NextResponse.redirect(new URL('/login/diagnose', request.url))
  }

  const { supabase, response } = createMiddlewareClient(request)

  let user = null
  try {
    // IMPORTANT: this refreshes the session cookie if needed
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // If Supabase is unreachable, allow login routes through so user can still see diagnose
    if (isLoginRoute || isAuthRoute) return NextResponse.next()
    if (isApiRoute) return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 })
    return NextResponse.redirect(new URL('/login/diagnose', request.url))
  }

  // Not authenticated
  if (!user && !isLoginRoute && !isAuthRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname + search)
    }
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user visiting /login (but not /login/diagnose) → send them to the dashboard
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico and common image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
