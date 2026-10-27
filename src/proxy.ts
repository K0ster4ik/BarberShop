import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Быстрый редирект на страницу входа, если cookie сессии нет вовсе — без похода в БД.
// Это не защита: сессию и роль проверяют layout админки, каждая страница и каждый Server Action.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const loginUrl = new URL("/admin/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/admin") {
    loginUrl.searchParams.set("next", pathname + search);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)"],
};
