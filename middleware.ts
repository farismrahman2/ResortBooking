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
  const { supabase, response } = createMiddlewareClient(request)

  // IMPORTANT: this refreshes the session cookie if needed
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  const isLoginPage  = pathname === '/login'
  const isAuthRoute  = pathname.startsWith('/auth/')
  const isApiRoute   = pathname.startsWith('/api/')

  // Not authenticated
  if (!user && !isLoginPage && !isAuthRoute) {
    // API routes: return 401 JSON instead of redirect
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Pages: redirect to /login with a ?next= param to preserve destination
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname + search)
    }
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user visiting /login → send them to the dashboard
  if (user && isLoginPage) {
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
