import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  decryptUserSession,
  USER_SESSION_COOKIE,
} from "@/lib/user-session";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/api/jira/oauth/")) return true;
  if (pathname === "/api/me" || pathname === "/api/login") return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

function hasValidSession(request: NextRequest): boolean {
  const raw = request.cookies.get(USER_SESSION_COOKIE)?.value;
  if (!raw) return false;
  const session = decryptUserSession(raw);
  return Boolean(session?.email);
}

function safeNextPath(pathname: string, search: string): string {
  const full = `${pathname}${search}`;
  if (!full.startsWith("/") || full.startsWith("//")) return "/";
  if (full.startsWith("/login")) return "/";
  return full;
}

/**
 * Connexion utilisateur obligatoire à l’ouverture.
 * La sync Jira reste sur le token partagé (hors de ce gate).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    if (
      (pathname === "/login" || pathname.startsWith("/login/")) &&
      hasValidSession(request)
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (hasValidSession(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Connexion utilisateur requise." },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", safeNextPath(pathname, search));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
