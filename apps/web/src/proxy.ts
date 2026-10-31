import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  try {
    return createClient(request);
  } catch (err) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
}

export async function middleware(request: NextRequest) {
  return proxy(request);
}

export default async function (request: NextRequest) {
  return proxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
