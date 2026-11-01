import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getCandidatePaths(): string[] {
  return [
    path.join(process.cwd(), 'apps/web/data/admin_settings.json'),
    path.join(process.cwd(), 'data/admin_settings.json'),
    path.join(process.cwd(), '.next/standalone/apps/web/data/admin_settings.json'),
    path.join(process.cwd(), '.next/standalone/data/admin_settings.json'),
  ];
}

function readLocalSettings(): any {
  for (const p of getCandidatePaths()) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (e) {}
    }
  }
  return null;
}

function writeLocalSettings(data: any): void {
  const targetDir = path.join(process.cwd(), 'apps/web/data');
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (e) {}
  }
  const targetFile = path.join(targetDir, 'admin_settings.json');
  try {
    fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {}
}

export async function GET(req: NextRequest) {
  try {
    let settings = readLocalSettings();

    // Query PostgreSQL / Supabase if environment variables are registered
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await supabase.from('admin_settings').select('*').eq('id', 'site_config').single();
        if (!error && data && data.data) {
          const dbData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
          settings = { ...(settings || {}), ...dbData };
          writeLocalSettings(settings);
        }
      } catch (dbErr) {
        // Quiet fallback to disk settings
      }
    }

    if (!settings) {
      settings = {
        siteName: 'Zecratary',
        siteTagline: 'Autonomous Culinary Intelligence & Precision Meal Planning',
        titlebarEmoji: '👨‍🍳',
        titlebarImage: '',
        faviconEmoji: '👨‍🍳',
        faviconImage: '',
        fontFamily: 'Inter, sans-serif',
        themeColors: {
          primary: '#E05638',
          primaryHover: '#c94529',
          accentEmerald: '#10b981',
          background: '#070b13',
          card: '#0d131f',
          innerDark: '#080d16',
          border: '#1a2234',
          text: '#ffffff',
          textSecondary: '#94a3b8'
        }
      };
      writeLocalSettings(settings);
    }

    return NextResponse.json({ success: true, settings }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const current = readLocalSettings() || {};
    const merged = { ...current, ...payload };
    writeLocalSettings(merged);

    // Persist to PostgreSQL / Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('admin_settings').upsert({
          id: 'site_config',
          data: merged,
          updated_at: new Date().toISOString()
        });
      } catch (dbErr) {
        console.warn('[API Settings POST] Supabase write skipped, saved locally:', dbErr);
      }
    }

    return NextResponse.json({ success: true, settings: merged });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
