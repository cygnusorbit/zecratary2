import { createBrowserClient } from "@supabase/ssr";

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
