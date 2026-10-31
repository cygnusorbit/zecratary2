import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

/**
 * Authoritative Next.js 16 Proxy / Middleware Entry Point
 * Refreshes Supabase Cloud sessions and maintains cookie persistence
 */
export async function proxy(request: NextRequest) {
  try {
    return createClient(request);
  } catch (err) {
    // Graceful fallback to avoid unhandled pipeline exceptions
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
}

// Backwards-compatible export for Next.js middleware callers
export async function middleware(request: NextRequest) {
  return proxy(request);
}

// Default export fallback
export default async function (request: NextRequest) {
  return proxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
