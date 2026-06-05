import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

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
  const { pathname } = request.nextUrl

  // Not logged in — redirect to login
  if (!user && !pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Logged in — check role for protected routes
  if (user && !pathname.startsWith('/auth')) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

    // Admin trying to access parent routes
    if (profile?.role === 'admin' && pathname.startsWith('/parent')) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }

    // Parent trying to access admin routes
    if (profile?.role === 'parent' && pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/parent/dashboard', request.url))
    }

    // Root redirect
    if (pathname === '/') {
      return NextResponse.redirect(new URL(
        profile?.role === 'admin' ? '/admin/dashboard' : '/parent/dashboard',
        request.url
      ))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|kumon-logo.png|centre.jpg).*)'],
}
