import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';

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

    // 2. Active database (settings store) — local, no cloud round trip
    try {
      const stored = await getJsonSetting<any[]>('frontend_pages');
      if (Array.isArray(stored) && stored.length > 0) {
        pages = stored;
        writeLocalPages(pages);
      }
    } catch (dbErr) {
      console.warn('[API Frontend] DB read fallback to cached pages:', dbErr);
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
    try {
      const stored = await getJsonSetting<any[]>('frontend_pages');
      if (Array.isArray(stored) && stored.length > 0) currentPages = stored;
    } catch {}

    if (action === 'save_page' && page) {
      const idx = currentPages.findIndex((p: any) => p.id === page.id);
      if (idx >= 0) {
        currentPages[idx] = page;
      } else {
        currentPages.push(page);
      }
      writeLocalPages(currentPages);

      try {
        await setJsonSetting('frontend_pages', currentPages, 'cms');
      } catch (dbErr) {
        console.warn('[API Frontend POST] DB write skipped, saved locally:', dbErr);
      }

      return NextResponse.json({ success: true, page });
    }

    if (action === 'set_default' && id) {
      currentPages = currentPages.map((p: any) => ({
        ...p,
        is_default: p.id === id,
      }));
      writeLocalPages(currentPages);
      try { await setJsonSetting('frontend_pages', currentPages, 'cms'); } catch {}
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Invalid action specified' }, { status: 400 });
  } catch (err: any) {
    console.error('[API Frontend POST Error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
