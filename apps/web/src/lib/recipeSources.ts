import dns from 'dns/promises';
import net from 'net';

// Reads the "Recommended Recipes Url" sources the admin configured, so /chef can build on real recipes.
// - Server-side only. Every request is checked so it can never reach private or internal addresses.
// - A page with a schema.org Recipe gives a complete recipe. An index/blog page gives links to recipe pages, which are read on demand.
// - Results are cached in memory (sites are not hit on every chat message).

export interface SourceRecipe {
  title: string;
  url: string;
  image?: string;
  description?: string;
  ingredients: string[];
  instructions: string[];
  prepMinutes?: number;
  cookMinutes?: number;
  servings?: number;
  calories?: number;
  cuisine?: string;
  category?: string;
}
export interface SourceLink { title: string; url: string }
export interface SourceInspection {
  url: string;
  ok: boolean;
  kind: 'recipe' | 'index' | 'unknown' | 'error';
  title?: string;
  recipe?: SourceRecipe;
  links?: SourceLink[];
  error?: string;
}

const UA = 'Mozilla/5.0 (compatible; ZecratarySourceReader/1.0; +https://zecratary.com)';
const MAX_BYTES = 1_500_000;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb')) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return true;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch (_) { throw new Error('That is not a valid web address.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http and https addresses are allowed.');
  if (u.username || u.password) throw new Error('Addresses with a username or password are not allowed.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('Only the standard web ports are allowed.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !net.isIP(host)) {
    throw new Error('Internal addresses are not allowed.');
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('That site could not be found.');
  if (addrs.some((a: any) => isPrivateIp(a.address))) throw new Error('Internal addresses are not allowed.');
  return u;
}

async function fetchHtml(startUrl: string, timeoutMs = 8000): Promise<{ html: string; finalUrl: string }> {
  let current = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location') as string, u).toString();
      continue;
    }
    if (!res.ok) throw new Error(`The site answered with status ${res.status}.`);
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type && !type.includes('html') && !type.includes('xml')) throw new Error('That address is not a web page.');
    const reader = res.body?.getReader();
    if (!reader) return { html: await res.text(), finalUrl: u.toString() };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) { try { await reader.cancel(); } catch (_) {} break; }
      chunks.push(value);
    }
    return { html: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8'), finalUrl: u.toString() };
  }
  throw new Error('Too many redirects.');
}

function stripHtml(s: any): string {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

function minutes(iso: any): number | undefined {
  const m = String(iso || '').match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const v = (Number(m[1] || 0) * 60) + Number(m[2] || 0);
  return v > 0 ? v : undefined;
}

function firstText(v: any): string | undefined {
  if (Array.isArray(v)) v = v[0];
  if (v && typeof v === 'object') v = v.name || v.url;
  const t = stripHtml(v);
  return t || undefined;
}

function flattenSteps(v: any, out: string[] = []): string[] {
  if (!v) return out;
  if (typeof v === 'string') { const t = stripHtml(v); if (t) out.push(t); return out; }
  if (Array.isArray(v)) { v.forEach((x) => flattenSteps(x, out)); return out; }
  if (typeof v === 'object') {
    if (v.itemListElement) return flattenSteps(v.itemListElement, out);
    const t = stripHtml(v.text || v.name);
    if (t) out.push(t);
  }
  return out;
}

function findRecipeNode(node: any): any | null {
  if (!node) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipeNode(n); if (r) return r; } return null; }
  if (typeof node !== 'object') return null;
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipeNode(node['@graph']);
  return null;
}

export function extractRecipe(html: string, pageUrl: string): SourceRecipe | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let json: any;
    try { json = JSON.parse(m[1].trim()); } catch (_) { continue; }
    const node = findRecipeNode(json);
    if (!node) continue;
    const title = firstText(node.name);
    const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : []).map(stripHtml).filter(Boolean);
    const instructions = flattenSteps(node.recipeInstructions);
    if (!title) continue;
    const yieldNum = Number(String(Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield || '').match(/\d+/)?.[0]) || undefined;
    return {
      title,
      url: pageUrl,
      image: firstText(node.image),
      description: firstText(node.description)?.slice(0, 300),
      ingredients,
      instructions,
      prepMinutes: minutes(node.prepTime),
      cookMinutes: minutes(node.cookTime),
      servings: yieldNum,
      calories: Number(String(node.nutrition?.calories || '').match(/\d+/)?.[0]) || undefined,
      cuisine: firstText(node.recipeCuisine),
      category: firstText(node.recipeCategory),
    };
  }
  return null;
}

const SKIP_PATH = /(^|\/)(tag|tags|category|categories|page|author|search|cart|checkout|login|register|account|about|contact|privacy|terms|wp-[a-z]+|feed|comments?|shop|store|newsletter|subscribe)(\/|$)/i;
const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|css|js|pdf|zip|xml|ico|mp4)$/i;

export function extractLinks(html: string, baseUrl: string): SourceLink[] {
  const base = new URL(baseUrl);
  const baseHost = base.hostname.replace(/^www\./, '');
  const seen = new Set<string>();
  const out: (SourceLink & { score: number })[] = [];
  const re = /<a\s[^>]*href=["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 400) {
    let u: URL;
    try { u = new URL(m[1], base); } catch (_) { continue; }
    if (u.hostname.replace(/^www\./, '') !== baseHost) continue;
    if (SKIP_PATH.test(u.pathname) || SKIP_EXT.test(u.pathname) || u.search.includes('s=')) continue;
    if (u.pathname === '/' || u.pathname === base.pathname) continue;
    u.hash = '';
    const clean = u.toString();
    if (seen.has(clean)) continue;
    const slug = u.pathname.split('/').filter(Boolean).pop() || '';
    const hyphens = (slug.match(/-/g) || []).length;
    if (hyphens < 1) continue;
    const text = stripHtml(m[2]);
    const title = text.length >= 4 && text.length <= 120 ? text : slug.replace(/-/g, ' ');
    seen.add(clean);
    out.push({ title, url: clean, score: hyphens });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 60).map(({ title, url }) => ({ title, url }));
}

const inspectCache = new Map<string, { at: number; value: SourceInspection }>();
const pageCache = new Map<string, { at: number; value: SourceRecipe | null }>();
const OK_TTL = 6 * 3600 * 1000;
const ERR_TTL = 10 * 60 * 1000;
const PAGE_TTL = 24 * 3600 * 1000;

function trimCache(map: Map<string, any>, max = 300) {
  if (map.size <= max) return;
  const first = map.keys().next().value;
  if (first) map.delete(first);
}

export async function inspectSource(url: string, force = false): Promise<SourceInspection> {
  const hit = inspectCache.get(url);
  if (!force && hit && Date.now() - hit.at < (hit.value.ok ? OK_TTL : ERR_TTL)) return hit.value;
  let value: SourceInspection;
  try {
    const { html, finalUrl } = await fetchHtml(url);
    const recipe = extractRecipe(html, finalUrl);
    const pageTitle = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 120);
    if (recipe) {
      value = { url, ok: true, kind: 'recipe', title: recipe.title, recipe };
    } else {
      const links = extractLinks(html, finalUrl);
      value = links.length > 0
        ? { url, ok: true, kind: 'index', title: pageTitle, links }
        : { url, ok: false, kind: 'unknown', title: pageTitle, error: 'The page loaded, but no recipes or recipe links were found on it.' };
    }
  } catch (e: any) {
    value = { url, ok: false, kind: 'error', error: String(e?.message || 'Could not read this site.').slice(0, 200) };
  }
  inspectCache.set(url, { at: Date.now(), value });
  trimCache(inspectCache);
  return value;
}

async function readRecipePage(url: string): Promise<SourceRecipe | null> {
  const hit = pageCache.get(url);
  if (hit && Date.now() - hit.at < PAGE_TTL) return hit.value;
  let value: SourceRecipe | null = null;
  try {
    const { html, finalUrl } = await fetchHtml(url, 7000);
    value = extractRecipe(html, finalUrl);
  } catch (_) {}
  pageCache.set(url, { at: Date.now(), value });
  trimCache(pageCache);
  return value;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'plan', 'meal', 'meals', 'day', 'days', 'give', 'make', 'recipe', 'recipes', 'please', 'want', 'need', 'cook', 'dish', 'dishes', 'that', 'this', 'matching', 'preferences', 'primary', 'sources', 'source', 'recommend', 'any', 'some', 'week', 'weekly']);

function tokens(text: string): string[] {
  return Array.from(new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w))));
}

// Reads the configured sources and returns real, complete recipes that fit the request best.
export async function gatherSourceRecipes(
  urls: string[],
  requestText: string,
  opts: { maxSources?: number; maxRecipes?: number; budgetMs?: number } = {}
): Promise<SourceRecipe[]> {
  const maxSources = opts.maxSources ?? 6;
  const maxRecipes = opts.maxRecipes ?? 6;
  const budgetMs = opts.budgetMs ?? 9000;
  const clean = Array.from(new Set(urls.map((u) => String(u || '').trim()).filter(Boolean))).slice(0, maxSources);
  if (!clean.length) return [];

  const work = (async () => {
    const inspected = await Promise.all(clean.map((u) => inspectSource(u)));
    const want = tokens(requestText);
    const direct: SourceRecipe[] = [];
    const candidates: { link: SourceLink; score: number; order: number }[] = [];
    let order = 0;
    for (const s of inspected) {
      if (s.kind === 'recipe' && s.recipe) direct.push(s.recipe);
      if (s.kind === 'index' && s.links) {
        for (const l of s.links) {
          const hay = `${l.title} ${l.url}`.toLowerCase();
          const score = want.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
          candidates.push({ link: l, score, order: order++ });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.order - b.order);
    const picks = candidates.slice(0, Math.max(0, maxRecipes + 2 - direct.length)).map((c) => c.link);
    const pages = await Promise.all(picks.map((l) => readRecipePage(l.url)));
    const all = [...direct, ...(pages.filter(Boolean) as SourceRecipe[])];
    const seen = new Set<string>();
    return all
      .filter((r) => r.ingredients.length >= 3 && r.instructions.length >= 2 && !seen.has(r.url) && (seen.add(r.url), true))
      .slice(0, maxRecipes);
  })();

  const timeout = new Promise<SourceRecipe[]>((resolve) => setTimeout(() => resolve([]), budgetMs));
  try { return await Promise.race([work, timeout]); } catch (_) { return []; }
}

export function sourceRecipesToPrompt(recipes: SourceRecipe[]): string {
  if (!recipes.length) return '';
  const lines = recipes.map((r, i) => {
    const ing = r.ingredients.slice(0, 14).join('; ');
    const steps = r.instructions.slice(0, 4).map((s) => s.slice(0, 160)).join(' | ');
    return `[${i + 1}] ${r.title}\n  url: ${r.url}\n  ingredients: ${ing}\n  method (${r.instructions.length} steps): ${steps}`;
  });
  return lines.join('\n').slice(0, 7000);
}
