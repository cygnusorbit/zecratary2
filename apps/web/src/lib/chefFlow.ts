// Helpers for the guided /chef flow:
//   existing recipes/books -> pantry check -> planner -> meal blueprint or shopping list.
// They use the same browser storage keys and API endpoints as the /planner, /shopping and /templates pages,
// so whatever the chef adds shows up there.

export interface FlowRecipe {
  id?: string;
  title: string;
  image?: string;
  ingredients: string[];
  instructions?: string[];
  mealType?: string;
  dayIndex?: number;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  calories?: number;
  description?: string;
  sourceUrl?: string;
  book?: string;          // name of the recipe book it belongs to, if any
  fromSaved: boolean;     // true = already in /recipes
}

export interface MissingItem { line: string; recipeId?: string; recipeTitle?: string }

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'plan', 'meal', 'meals', 'day', 'days', 'give', 'make', 'recipe', 'recipes', 'please', 'want', 'need', 'cook', 'dish', 'dishes', 'that', 'this', 'some', 'any', 'today', 'tomorrow', 'something', 'like', 'would', 'also', 'just', 'eat', 'dinner', 'lunch', 'breakfast', 'snack', 'snacks', 'yes', 'you', 'decide', 'anything', 'whatever', 'good', 'nice', 'light', 'easy', 'quick']);
const MEAT = /\b(chicken|beef|pork|lamb|mutton|duck|turkey|bacon|ham|sausages?|steak|fish|salmon|tuna|cod|shrimps?|prawns?|crab|squid|seafood|anchov(y|ies)|oyster sauce|fish sauce|gelatin|lard)\b/i;

export function tokensOf(text: string): string[] {
  return Array.from(new Set(
    String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w))
  ));
}

export function parseDays(request: string, cap = 7): number {
  const m = String(request || '').toLowerCase().match(/(\d+)\s*-?\s*(day|days|night|nights)\b/) || String(request || '').toLowerCase().match(/\b(\d+)\s*d\b/);
  if (m) return Math.max(1, Math.min(cap, Number(m[1])));
  if (/\bweek(ly)?\b/i.test(request) && !/\bweekend\b/i.test(request)) return Math.min(cap, 7);
  if (/\bweekend\b/i.test(request)) return 2;
  return 1;
}

const asLines = (v: any): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/\n/) : [])
  .map((x: any) => (typeof x === 'string' ? x : x?.name || x?.text || x?.item || ''))
  .map((x: string) => String(x).trim()).filter(Boolean);

// Looks through the user's saved recipes (/recipes) and recipe books (/books) for dishes that fit the request, diet, allergies and avoided ingredients.
export function matchExisting(
  request: string,
  recipes: any[],
  books: any[],
  opts: { meatFree?: boolean; exclude?: string[]; limit?: number; pantry?: string[] } = {}
): FlowRecipe[] {
  const want = tokensOf(request);
  if (want.length === 0) return [];
  const limit = opts.limit ?? 6;
  const bookName = (r: any): string | undefined => {
    for (const b of books || []) {
      if (r.bookId === b.id || r.book_id === b.id || (Array.isArray(r.bookIds) && r.bookIds.includes(b.id))) return b.title || b.name;
    }
    return undefined;
  };
  const scored: { score: number; r: FlowRecipe }[] = [];
  for (const raw of recipes || []) {
    const title = String(raw.title || raw.name || '').trim();
    if (!title) continue;
    const ingredients = asLines(raw.ingredients);
    const instructions = asLines(raw.instructions || raw.directions || raw.steps);
    const text = `${title} ${ingredients.join(' ')}`.toLowerCase();
    if (opts.meatFree && MEAT.test(text)) continue;
    if ((opts.exclude || []).some((w) => { const x = String(w || '').trim().toLowerCase(); return x.length >= 3 && text.includes(x.replace(/s$/, '')); })) continue;
    const titleLow = title.toLowerCase();
    const tags = asLines(raw.tags).join(' ').toLowerCase();
    let score = 0;
    for (const w of want) {
      if (titleLow.includes(w)) score += 3;
      else if (tags.includes(w)) score += 2;
      else if (text.includes(w)) score += 1;
    }
    if (score < 2) continue;
    if (opts.pantry && opts.pantry.length) {
      const pc = opts.pantry.map((x) => coreWords(x).join(' ')).filter(Boolean);
      const hits = ingredients.filter((ing) => { const k = coreWords(ing).join(' '); return k && pc.some((q) => q === k || k.includes(q) || q.includes(k)); }).length;
      score += Math.min(3, hits * 0.5);
    }
    scored.push({
      score,
      r: {
        id: raw.id,
        title,
        image: raw.imageUrl || raw.image || raw.image_url || undefined,
        ingredients,
        instructions,
        mealType: raw.mealType || raw.recipeType || raw.category || undefined,
        servings: Number(raw.servings) || undefined,
        prepMinutes: Number(raw.prepMinutes ?? raw.prep_time) || undefined,
        cookMinutes: Number(raw.cookMinutes ?? raw.cook_time) || undefined,
        calories: Number(raw.calories) || undefined,
        description: raw.description || undefined,
        sourceUrl: raw.sourceUrl || raw.source_url || undefined,
        book: bookName(raw),
        fromSaved: true,
      },
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.r);
}

const norm = (s: string) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const UNITS = new Set(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'cups', 'oz', 'lb', 'lbs', 'clove', 'cloves', 'pinch', 'piece', 'pieces', 'slice', 'slices', 'can', 'cans', 'large', 'medium', 'small', 'fresh', 'chopped', 'sliced', 'diced', 'minced', 'finely', 'cut', 'into', 'and', 'of', 'a', 'the']);

function coreWords(line: string): string[] {
  return norm(line).split(' ').filter((w) => w.length >= 3 && !UNITS.has(w)).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}

// Which ingredient lines are already covered by the pantry, and which still need buying.
export function comparePantry(recipes: FlowRecipe[], pantryNames: string[]): { have: string[]; missing: MissingItem[] } {
  const pantry = pantryNames.map((p) => coreWords(p).join(' ')).filter(Boolean);
  const have: string[] = [];
  const missing: MissingItem[] = [];
  const seen = new Set<string>();
  for (const r of recipes) {
    for (const line of r.ingredients) {
      const core = coreWords(line);
      if (core.length === 0) continue;
      const key = core.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      const inPantry = pantry.some((p) => p === key || key.includes(p) || p.includes(key) || core.every((w) => p.includes(w)));
      if (inPantry) have.push(line);
      else missing.push({ line, recipeId: r.id, recipeTitle: r.title });
    }
  }
  return { have, missing };
}

export function isoDate(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function startDateFor(choice: 'today' | 'tomorrow' | 'monday'): string {
  const d = new Date();
  if (choice === 'tomorrow') d.setDate(d.getDate() + 1);
  if (choice === 'monday') { const add = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + add); }
  return isoDate(d);
}

const rid = (p: string) => p + '_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
const TIME: Record<string, string> = { breakfast: '08:00', lunch: '12:30', dinner: '19:00', snack: '16:00' };

function cleanMealType(t?: string): string {
  const s = String(t || '').toLowerCase();
  if (s.includes('breakfast')) return 'Breakfast';
  if (s.includes('lunch')) return 'Lunch';
  if (s.includes('snack')) return 'Snack';
  return 'Dinner';
}

// Planner entries in the same shape /planner stores them.
export function buildPlannedMeals(userId: string, recipes: FlowRecipe[], startISO: string): any[] {
  const start = new Date(startISO + 'T00:00:00');
  return recipes.map((r, i) => {
    const offset = r.dayIndex ? Math.max(0, r.dayIndex - 1) : (recipes.some((x) => x.dayIndex) ? 0 : i);
    const d = new Date(start); d.setDate(d.getDate() + offset);
    const mt = cleanMealType(r.mealType);
    return {
      id: rid('meal'),
      userId,
      date: isoDate(d),
      mealType: mt,
      recipeId: r.id,
      recipeName: r.title,
      time: TIME[mt.toLowerCase()] || '19:00',
      servings: r.servings || 2,
      notes: 'Planned by Chef Foodie',
      isLeftover: false,
      calories: r.calories || undefined,
    };
  });
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Meal blueprint (/templates) built from the chosen recipes.
export function buildTemplate(userId: string, title: string, recipes: FlowRecipe[]): any {
  const meals = recipes.map((r, i) => ({
    id: rid('tm'),
    dayIndex: r.dayIndex ? r.dayIndex - 1 : (recipes.some((x) => x.dayIndex) ? 0 : i),
    mealType: cleanMealType(r.mealType),
    recipeId: r.id,
    recipeName: r.title,
    title: r.title,
    image: r.image,
    imageUrl: r.image,
    time: TIME[cleanMealType(r.mealType).toLowerCase()] || '19:00',
    servings: r.servings || 2,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    ingredients: r.ingredients,
    instructions: r.instructions || [],
  }));
  const totalDays = Math.max(1, ...meals.map((m) => m.dayIndex + 1));
  const days = Array.from({ length: totalDays }, (_, di) => ({
    dayName: DAY_NAMES[di % 7],
    meals: meals.filter((m) => m.dayIndex === di).map((m) => ({ ...m })),
  }));
  const now = new Date().toISOString();
  return { id: rid('tmpl'), userId, title, description: 'Created by Chef Foodie', category: 'Chef AI', totalDays, durationDays: totalDays, isPublic: false, meals, days, createdAt: now, updatedAt: now };
}

const UNIT_RE = /^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|\d+\s+\d+\/\d+)\s*(g|kg|ml|l|tsp|tbsp|cups?|oz|lbs?|cloves?|pieces?|slices?|cans?)?\b\s*(.*)$/i;

// Shopping list entries in the same shape /shopping stores them.
export function buildShoppingItems(userId: string, missing: MissingItem[]): any[] {
  return missing.map((m) => {
    const x = m.line.match(UNIT_RE);
    return {
      id: rid('shop'),
      userId,
      name: (x && x[3] ? x[3] : m.line).trim() || m.line,
      item: (x && x[3] ? x[3] : m.line).trim() || m.line,
      amount: x ? x[1] : '',
      unit: x && x[2] ? x[2].toLowerCase() : '',
      category: 'Produce',
      staple: false,
      checked: false,
      recipeId: m.recipeId,
      recipeTitle: m.recipeTitle,
    };
  });
}

// Adds entries to a browser-storage list (read, append, write) the way the pages do.
export function appendLocalList(keys: string[], entries: any[], uniqueBy?: (e: any) => string): void {
  if (typeof window === 'undefined') return;
  let base: any[] = [];
  for (const k of keys) {
    try { const raw = localStorage.getItem(k); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) { base = p; break; } } } catch (_) {}
  }
  const seen = new Set(uniqueBy ? base.map(uniqueBy) : []);
  const add = uniqueBy ? entries.filter((e) => !seen.has(uniqueBy(e))) : entries;
  const merged = [...base, ...add];
  for (const k of keys) { try { localStorage.setItem(k, JSON.stringify(merged)); } catch (_) {} }
}
