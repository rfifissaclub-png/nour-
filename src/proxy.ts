import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { BLOCKED_MESSAGE, COOKIE_NAME, COOKIE_OPTIONS, HOME, pathRole } from "@/lib/auth/constants";
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const isLogin = path === "/login";
  try {
    const session = await readSession(request.cookies.get(COOKIE_NAME)?.value);
    if (session.status !== "authenticated") {
      if (isLogin && session.status === "anonymous") {
        const response = NextResponse.next();
        if (request.cookies.has(COOKIE_NAME)) response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      const blocked = session.status === "blocked";
      const response = isApi
        ? NextResponse.json({ message: blocked ? BLOCKED_MESSAGE : "Veuillez vous connecter." }, { status: blocked ? 403 : 401 })
        : NextResponse.redirect(new URL(blocked ? "/login?reason=blocked" : "/login", request.url));
      response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const role = pathRole(path);
    if (isLogin || path === "/" || (role && role !== session.user.role)) {
      const response = isApi
        ? NextResponse.json({ message: "Accès non autorisé." }, { status: 403 })
        : NextResponse.redirect(new URL(HOME[session.user.role], request.url));
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return new NextResponse("Service temporairement indisponible. Merci de réessayer dans quelques instants.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/teacher/:path*", "/student/:path*", "/api/admin/:path*", "/api/teacher/:path*", "/api/student/:path*", "/api/resources/:path*"],
};
