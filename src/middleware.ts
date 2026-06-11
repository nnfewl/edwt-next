import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const locale = request.cookies.get("NEXT_LOCALE")?.value;
  if (locale) {
    response.headers.set("x-next-intl-locale", locale);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next|monitoring|api|favicon.ico|health-authorities|.*\\..*).*)"],
};
