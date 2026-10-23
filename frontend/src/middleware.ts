import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import {
  getPostLoginFallback,
  resolveSafeRedirectPath,
} from "@/kernel/core/auth/redirect-path";
import { ACCESS_TOKEN_COOKIE } from "@/kernel/core/auth/tokens";
import { normalizeModulePath } from "@/kernel/core/permissions/route-permissions";
import { routing } from "@/kernel/i18n/routing";
import { isRouteFeatureEnabled } from "@/kernel/platform/features/route-feature.utils";

import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

const handleI18n = createMiddleware(routing);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(`${p}/`) ||
      pathname === `/vi${p}` ||
      pathname === `/en${p}`,
  );
}

function redirectToSalesModule(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const localeMatch = pathname.match(/^\/(vi|en)(?=\/|$)/);
  const targetPath = localeMatch ? `/${localeMatch[1]}/sales` : "/sales";
  return NextResponse.redirect(new URL(targetPath, request.url));
}

function redirectAfterLogin(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;
  const targetPath = resolveSafeRedirectPath(
    searchParams.get("from"),
    getPostLoginFallback(pathname),
  );
  return NextResponse.redirect(new URL(targetPath, request.url));
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (isPublicPath(pathname)) {
    // A signed-in reader has no business on any of these; bounce them the way /login does.
    if (token) {
      return redirectAfterLogin(request);
    }
    return handleI18n(request);
  }

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    // Keep the query: a shared list link carries its filters there.
    loginUrl.searchParams.set("from", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const normalizedPath = normalizeModulePath(pathname);
  if (
    normalizedPath.startsWith("/sales/") &&
    normalizedPath !== "/sales" &&
    !isRouteFeatureEnabled(pathname)
  ) {
    return redirectToSalesModule(request);
  }

  // i18n handling
  return handleI18n(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts/|brand/).*)"],
};
