import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define seed fallback data path
function getFallbackDataPaths(): string[] {
  return [
    path.join(process.cwd(), 'apps/web/data/frontend_pages.json'),
    path.join(process.cwd(), 'data/frontend_pages.json'),
    path.join(process.cwd(), '.next/standalone/apps/web/data/frontend_pages.json'),
    path.join(__dirname, '../../../../data/frontend_pages.json'),
  ];
}

function readLocalPages(): any[] {
  const candidatePaths = getFallbackDataPaths();
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {}
    }
  }
  return [];
}

function writeLocalPages(pages: any[]): void {
  const targetDir = path.join(process.cwd(), 'apps/web/data');
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (e) {}
  }
  const targetPath = path.join(targetDir, 'frontend_pages.json');
  try {
    fs.writeFileSync(targetPath, JSON.stringify(pages, null, 2), 'utf-8');
  } catch (e) {}
}

export async function GET(req: NextRequest) {
  try {
    // 1. Check local file / standalone cache first
    let pages = readLocalPages();

    // 2. Dual Database Query (PostgreSQL / Supabase / MySQL)
    // If Supabase credentials are configured in Hostinger environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await supabase.from('frontend_pages').select('*').order('order_index', { ascending: true });
        if (!error && Array.isArray(data) && data.length > 0) {
          pages = data.map((row: any) => ({
            ...row,
            elements: typeof row.elements === 'string' ? JSON.parse(row.elements) : (row.elements || []),
            padding: typeof row.padding === 'string' ? JSON.parse(row.padding) : (row.padding || {}),
            footer: typeof row.footer === 'string' ? JSON.parse(row.footer) : (row.footer || {}),
          }));
          // Mirror to local disk cache
          writeLocalPages(pages);
        }
      } catch (dbErr) {
        console.warn('[API Frontend] Supabase query fallback to cached pages:', dbErr);
      }
    }

    // Ensure we always return at least the default home page
    if (!pages || pages.length === 0) {
      pages = [
        {
          id: 'page_home_default',
          title: 'Home',
          slug: '/',
          description: 'Zecratary AI Culinary Platform',
          status: 'published',
          is_default: true,
          is_published: true,
          show_in_nav: true,
          show_in_footer: true,
          order_index: 0,
          padding: { top: '2.5rem', bottom: '4rem', left: '1.5rem', right: '1.5rem', maxWidth: 'max-w-7xl' },
          footer: {
            enabled: true,
            aboutText: 'Zecratary empowers home chefs and professionals with intelligent recipe discovery and culinary AI.',
            copyrightText: '© 2026 Zecratary Inc. All rights reserved.',
            columns: [],
            socials: { twitter: 'https://twitter.com/zecratary', github: 'https://github.com/cygnusorbit/zecratary2' }
          },
          elements: [
            {
              id: 'elem_hero_title',
              type: 'title',
              title: 'Craft Culinary Wonders with AI Assistance',
              subtitle: 'Personalized recipes, real-time ingredient intelligence, and dietary optimization at your fingertips.',
              level: 'h1',
              alignment: 'center'
            }
          ]
        }
      ];
      writeLocalPages(pages);
    }

    return NextResponse.json({ success: true, pages });
  } catch (err: any) {
    console.error('[API Frontend GET Error]', err);
    return NextResponse.json({ success: false, error: err.message, pages: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, page, id } = body;

    let currentPages = readLocalPages();

    if (action === 'save_page' && page) {
      const idx = currentPages.findIndex((p: any) => p.id === page.id);
      if (idx >= 0) {
        currentPages[idx] = page;
      } else {
        currentPages.push(page);
      }
      writeLocalPages(currentPages);

      // Persist to PostgreSQL / Supabase if active
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase.from('frontend_pages').upsert({
            id: page.id,
            title: page.title,
            slug: page.slug,
            description: page.description,
            status: page.status,
            is_default: page.is_default,
            is_published: page.is_published,
            show_in_nav: page.show_in_nav,
            show_in_footer: page.show_in_footer,
            order_index: page.order_index,
            elements: page.elements,
            padding: page.padding,
            footer: page.footer,
            updated_at: new Date().toISOString(),
          });
        } catch (dbErr) {
          console.warn('[API Frontend POST] Supabase write skipped, saved locally:', dbErr);
        }
      }

      return NextResponse.json({ success: true, page });
    }

    if (action === 'set_default' && id) {
      currentPages = currentPages.map((p: any) => ({
        ...p,
        is_default: p.id === id,
      }));
      writeLocalPages(currentPages);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Invalid action specified' }, { status: 400 });
  } catch (err: any) {
    console.error('[API Frontend POST Error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
