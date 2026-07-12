import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const { pathname } = request.nextUrl

  // Allow API routes and kiosk to handle their own auth
  if (pathname.startsWith('/api/') || pathname.startsWith('/kiosk')) {
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in — redirect to login
  if (!user && !pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Logged in on auth page — redirect to appropriate dashboard
  if (user && pathname.startsWith('/auth')) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    return NextResponse.redirect(new URL(
      profile?.role === 'admin' ? '/admin/dashboard' : '/parent/dashboard',
      request.url
    ))
  }

  // Protect admin routes
  if (user && pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/parent/dashboard', request.url))
    }
  }

  // Protect parent routes
  if (user && pathname.startsWith('/parent')) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
  }

  // Root redirect
  if (user && pathname === '/') {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    return NextResponse.redirect(new URL(
      profile?.role === 'admin' ? '/admin/dashboard' : '/parent/dashboard',
      request.url
    ))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|kumon-logo.png|centre.jpg).*)'],
}
