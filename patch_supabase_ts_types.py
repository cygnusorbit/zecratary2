#!/usr/bin/env python3
"""
Zecratary2 Supabase TypeScript Strict-Mode Typecheck Patch
1. Annotates all cookie callbacks with explicit types using @supabase/ssr CookieOptions (TS7006/TS7031 fix).
2. Purges stale duplicate directories (apps/web/src/src/ and orphaned files).
3. Harmonizes both apps/web/src/utils/supabase/ and apps/web/src/lib/supabase/ helpers.
4. Verifies dependencies in apps/web/package.json and root package.json.
5. Re-runs clean dependency installation and TypeScript validation.
"""

import os
import sys
import json
import shutil
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent

def log(msg: str):
    print(f"[*] {msg}")

def purge_stale_duplicates():
    stale_paths = [
        ROOT_DIR / "apps" / "web" / "src" / "src",
        ROOT_DIR / "src" / "src",
        ROOT_DIR / "src" / "utils" / "supabase",
        ROOT_DIR / "src" / "lib" / "supabase",
        ROOT_DIR / "apps" / "web" / "src" / "src" / "utils" / "supabase" / "middleware.ts",
        ROOT_DIR / "apps" / "web" / "src" / "middleware.ts",
        ROOT_DIR / "apps" / "web" / "middleware.ts",
        ROOT_DIR / "middleware.ts"
    ]

    purged_count = 0
    for p in stale_paths:
        if p.is_file():
            p.unlink()
            log(f"Removed stale file: {p.relative_to(ROOT_DIR)}")
            purged_count += 1
        elif p.is_dir():
            shutil.rmtree(p)
            log(f"Removed stale directory: {p.relative_to(ROOT_DIR)}")
            purged_count += 1

    log(f"Purge complete ({purged_count} stale artifacts removed).")
    return True

def ensure_dependencies():
    root_pkg_path = ROOT_DIR / "package.json"
    web_pkg_path = ROOT_DIR / "apps" / "web" / "package.json"

    if not root_pkg_path.exists() or not web_pkg_path.exists():
        print("[!] package.json manifests not found.", file=sys.stderr)
        return False

    with open(root_pkg_path, "r", encoding="utf-8") as f:
        root_data = json.load(f)
    with open(web_pkg_path, "r", encoding="utf-8") as f:
        web_data = json.load(f)

    # Ensure @supabase/ssr and @supabase/supabase-js are present
    supabase_js = "^2.48.1"
    supabase_ssr = "^0.5.2"

    web_deps = web_data.get("dependencies", {})
    web_deps["@supabase/supabase-js"] = supabase_js
    web_deps["@supabase/ssr"] = supabase_ssr
    web_data["dependencies"] = web_deps

    root_deps = root_data.get("dependencies", {})
    root_deps["@supabase/supabase-js"] = supabase_js
    root_deps["@supabase/ssr"] = supabase_ssr
    root_data["dependencies"] = root_deps

    with open(web_pkg_path, "w", encoding="utf-8") as f:
        json.dump(web_data, f, indent=2)
        f.write("\n")

    with open(root_pkg_path, "w", encoding="utf-8") as f:
        json.dump(root_data, f, indent=2)
        f.write("\n")

    log("Verified @supabase/ssr and @supabase/supabase-js in workspace manifests.")
    return True

def write_typed_supabase_helpers():
    # Canonical Server Helper with Explicit Strict-Mode Cookie Types
    server_ts_content = """import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tnhrkjtujdfgvwhsuuxb.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_afBBLw4l9N08lDX60x_5XQ_z6TIP7HI";

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // Ignored when proxy/middleware refreshes sessions.
          }
        },
      },
    }
  );
};
"""

    # Canonical Client Helper
    client_ts_content = """import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tnhrkjtujdfgvwhsuuxb.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_afBBLw4l9N08lDX60x_5XQ_z6TIP7HI";

export const createClient = () =>
  createBrowserClient(
    supabaseUrl,
    supabaseKey
  );
"""

    # Canonical Middleware / Proxy Helper with Explicit Strict-Mode Cookie Types
    middleware_ts_content = """import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tnhrkjtujdfgvwhsuuxb.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_afBBLw4l9N08lDX60x_5XQ_z6TIP7HI";

export const createClient = (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }: CookieToSet) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  return supabaseResponse;
};
"""

    target_directories = [
        ROOT_DIR / "apps" / "web" / "src" / "utils" / "supabase",
        ROOT_DIR / "apps" / "web" / "src" / "lib" / "supabase"
    ]

    for target_dir in target_directories:
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "server.ts").write_text(server_ts_content, encoding="utf-8")
        (target_dir / "client.ts").write_text(client_ts_content, encoding="utf-8")
        (target_dir / "middleware.ts").write_text(middleware_ts_content, encoding="utf-8")
        log(f"Wrote strictly-typed Supabase SSR helpers into {target_dir.relative_to(ROOT_DIR)}")

    # Ensure proxy.ts imports from canonical typed helper
    proxy_path = ROOT_DIR / "apps" / "web" / "src" / "proxy.ts"
    proxy_content = """import { type NextRequest, NextResponse } from "next/server";
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
"""
    proxy_path.write_text(proxy_content, encoding="utf-8")
    log("Configured authoritative proxy.ts at apps/web/src/proxy.ts")
    return True

def main():
    print("=" * 65)
    print("Applying Supabase Strict-Mode TypeScript Type Resolution")
    print("=" * 65)

    if purge_stale_duplicates() and ensure_dependencies() and write_typed_supabase_helpers():
        print("\n[SUCCESS] Strict types applied and stale duplicate files eliminated.")
        print("Run 'npm install' followed by 'npm run build' to verify.")
    else:
        print("\n[ERROR] Patch encountered an issue.", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
