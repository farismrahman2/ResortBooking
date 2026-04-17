import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST /auth/signout — signs the user out and redirects to /login */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  await supabase.auth.signOut()

  return NextResponse.redirect(new URL('/login', request.url), {
    status: 303, // "See Other" — forces the browser to GET the redirect URL
  })
}
