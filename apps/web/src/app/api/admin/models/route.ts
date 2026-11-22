import { NextRequest, NextResponse } from 'next/server';
import { isMasked } from '@/lib/adminGuard';
import { getStoredChefApiKey } from '@/lib/serverSettings';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider') || 'gemini';
    const apiKey = searchParams.get('apiKey') || '';

    let cleanKey = isMasked(apiKey) ? '' : apiKey.trim().replace(/^['"]|['"]$/g, '');
    if (!cleanKey) cleanKey = await getStoredChefApiKey(provider);
    if (!cleanKey) {
      return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 });
    }

    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({ success: false, error: err?.error?.message || 'Gemini API rejected request' }, { status: res.status });
      }

      const data = await res.json();
      const models = (data.models || [])
        .filter((m: any) => {
          const methods = m.supportedGenerationMethods || [];
          const name = (m.name || '').toLowerCase();
          return methods.includes('generateContent') || name.includes('gemini');
        })
        .map((m: any) => {
          const cleanId = (m.name || '').replace(/^models\//, '');
          return {
            id: cleanId,
            name: m.displayName || cleanId,
            description: m.description || ''
          };
        });

      return NextResponse.json({ success: true, count: models.length, models });
    } else {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({ success: false, error: err?.error?.message || 'OpenAI API rejected request' }, { status: res.status });
      }

      const data = await res.json();
      const models = (data.data || [])
        .filter((m: any) => {
          const id = (m.id || '').toLowerCase();
          return (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3')) &&
                 !id.includes('realtime') && !id.includes('audio') && !id.includes('embedding') &&
                 !id.includes('transcription') && !id.includes('tts') && !id.includes('moderation');
        })
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          description: ''
        }));

      return NextResponse.json({ success: true, count: models.length, models });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = body.provider || 'gemini';
    let cleanKey = isMasked(body.apiKey) ? '' : (body.apiKey || '').trim().replace(/^['"]|['"]$/g, '');
    if (!cleanKey) cleanKey = await getStoredChefApiKey(provider);

    if (!cleanKey) {
      return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 });
    }

    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`, {
        cache: 'no-store'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({ success: false, error: err?.error?.message || 'Gemini API error' }, { status: res.status });
      }

      const data = await res.json();
      const models = (data.models || [])
        .filter((m: any) => {
          const methods = m.supportedGenerationMethods || [];
          const name = (m.name || '').toLowerCase();
          return methods.includes('generateContent') || name.includes('gemini');
        })
        .map((m: any) => {
          const cleanId = (m.name || '').replace(/^models\//, '');
          return {
            id: cleanId,
            name: m.displayName || cleanId,
            description: m.description || ''
          };
        });

      return NextResponse.json({ success: true, count: models.length, models });
    } else {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${cleanKey}` },
        cache: 'no-store'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({ success: false, error: err?.error?.message || 'OpenAI API error' }, { status: res.status });
      }

      const data = await res.json();
      const models = (data.data || [])
        .filter((m: any) => {
          const id = (m.id || '').toLowerCase();
          return (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3')) &&
                 !id.includes('realtime') && !id.includes('audio') && !id.includes('embedding') &&
                 !id.includes('transcription') && !id.includes('tts') && !id.includes('moderation');
        })
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          description: ''
        }));

      return NextResponse.json({ success: true, count: models.length, models });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 });
  }
}
