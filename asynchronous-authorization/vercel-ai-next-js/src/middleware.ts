import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

const APP_SESSION_COOKIE = "appSession";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/auth")) {
    return auth0.middleware(request);
  }

  try {
    const session = await auth0.getSession(request);
    if (!session) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    return NextResponse.next();
  } catch {
    const redirect = NextResponse.redirect(new URL("/auth/login", request.url));
    redirect.cookies.set(APP_SESSION_COOKIE, "", {
      path: "/",
      httpOnly: true,
      maxAge: 0,
    });
    return redirect;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|images|favicon\\.(?:ico|png)|sitemap\\.xml|robots\\.txt|$).*)",
  ],
};
