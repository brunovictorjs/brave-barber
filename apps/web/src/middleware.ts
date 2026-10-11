import { NextResponse, type NextRequest } from 'next/server';

/**
 * Áreas que exigem login: sem o cookie de sessão, vai direto para /entrar
 * (a checagem de papel acontece na API e nos layouts).
 */
const PROTECTED = ['/barbeiro', '/admin', '/pedidos', '/perfil', '/favoritos', '/agendar', '/pagamento'];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (req.cookies.has('bb_session')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/entrar';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|uploads|_next|brand|favicon).*)'],
};
