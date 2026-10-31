import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
