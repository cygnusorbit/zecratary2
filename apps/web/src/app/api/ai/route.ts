import { NextRequest, NextResponse } from 'next/server';
import { gatherSourceRecipes, sourceRecipesToPrompt, findSourceImages, type SourceRecipe } from '@/lib/recipeSources';
import { query } from '@/lib/db';
import { getServerAdminSettings } from '@/lib/serverSettings';
import { scopeToSession } from '@/lib/requestUser';

// Asks Gemini (with Google Search) for real recipe page links. The links are only candidates: each one is fetched and must contain a readable recipe before it is used.
async function webSearchRecipeUrls(apiKey: string, model: string, query: string, skip: string[]): Promise<string[]> {
  try {
    let res: Response | null = null;
    let data: any = null;
    let current = resolveGeminiModel(model);
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${current}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Find 6 real recipe pages on the web for: ${query.slice(0, 300)}. Reply with ONLY the full page URLs, one per line, no other text. Use direct recipe pages (not search or category pages) from different well-known recipe websites.` }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400, ...fastThinking(current) },
        }),
      });
      data = await res.json().catch(() => null);
      if (res.ok) break;
      if (!isRetiredModelError(res.status, data?.error?.message || '')) return [];
      retiredGeminiModels.add(current);
      current = resolveGeminiModel(current);
    }
    if (!res || !res.ok) return [];
    const text: string = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('\n');
    const chunks: string[] = (data?.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((c: any) => c?.web?.uri || '').filter(Boolean);
    const skipHosts = new Set(skip.map((u) => { try { return new URL(u).hostname; } catch (_) { return ''; } }));
    const found: string[] = ((text.match(/https?:\/\/[^\s)>\]"']+/g) || []) as string[]).concat(chunks.filter((u) => !/vertexaisearch\.cloud\.google\.com/.test(u)));
    const out: string[] = [];
    for (const u of found) {
      const clean = u.replace(/[.,;]+$/, '');
      let host = '';
      try { host = new URL(clean).hostname; } catch (_) { continue; }
      if (skipHosts.has(host) || out.includes(clean)) continue;
      out.push(clean);
      if (out.length >= 6) break;
    }
    return out;
  } catch (_) {
    return [];
  }
}


export const dynamic = 'force-dynamic';

// Sanitize legacy or deprecated Gemini model identifiers
// Gemini 2.5 Flash "thinks" before answering by default, which adds many seconds. Chat, consults and recipe JSON do not need it.
function fastThinking(model: string): Record<string, any> {
  return /gemini-2\.5-flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {};
}

// Google retires models over time ("no longer available to new users"). Remember retired ones for this server run and move to the next candidate.
const GEMINI_FALLBACKS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
const retiredGeminiModels = new Set<string>();
function isRetiredModelError(status: number, message: string): boolean {
  return status === 404 || /no longer available|not found|deprecated|is not supported/i.test(message || '');
}
function resolveGeminiModel(model: string): string {
  if (!retiredGeminiModels.has(model)) return model;
  return GEMINI_FALLBACKS.find((m) => !retiredGeminiModels.has(m)) || model;
}

function sanitizeGeminiModel(rawModel: string): string {
  const m = (rawModel || '').trim();
  const lower = m.toLowerCase();
  if (!lower.includes('gemini') || lower.includes('gemini-1.5') || lower.includes('gemini-2.0')) {
    return 'gemini-2.5-flash';
  }
  return m;
}

function extractJson(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch (_) {} }
  return null;
}

function toStringList(v: any): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}

// Shape the model's answer into exactly what the /chef page renders (Card / Compact / Detailed views).
// A meal the AI based on a source recipe is replaced by that real recipe (text, times, photo, link). Anything else stays AI-generated.
function sourceFields(url: any, sources?: Map<string, SourceRecipe>) {
  const u = String(url || '').trim();
  const src = u && sources ? sources.get(u) : undefined;
  if (!src) return { sourceUrl: '', aiGenerated: true as const };
  let host = '';
  try { host = new URL(src.url).hostname.replace(/^www\./, ''); } catch (_) {}
  const o: any = {
    title: src.title,
    ingredients: src.ingredients,
    instructions: src.instructions,
    sourceUrl: src.url,
    sourceName: host,
    aiGenerated: false as const,
  };
  if (src.description) o.description = src.description;
  if (src.prepMinutes) o.prepMinutes = src.prepMinutes;
  if (src.cookMinutes) o.cookMinutes = src.cookMinutes;
  if (src.servings) o.servings = src.servings;
  if (src.calories) o.calories = src.calories;
  if (src.cuisine) o.cuisine = src.cuisine;
  if (src.image) o.image = src.image;
  o.imageQuery = src.title;
  return o;
}

function normalizePlan(raw: any, maxDays: number, servings: number, sources?: Map<string, SourceRecipe>): any | null {
  if (!raw || !Array.isArray(raw.meals)) return null;
  const stamp = Date.now();
  const meals = raw.meals
    .filter((m: any) => m && m.title)
    .map((m: any, i: number) => {
      const dayIndex = Math.max(1, Number(m.dayIndex) || 1);
      return {
        id: `meal_${stamp}_${i}`,
        dayIndex,
        dayLabel: String(m.dayLabel || `Day ${dayIndex}`),
        dateStr: String(m.dateStr || ''),
        mealType: String(m.mealType || 'Dinner'),
        title: String(m.title),
        description: String(m.description || ''),
        prepMinutes: Number(m.prepMinutes) || 15,
        cookMinutes: Number(m.cookMinutes) || 20,
        servings: Number(m.servings) || servings,
        calories: Number(m.calories) || undefined,
        isBatchCook: Boolean(m.isBatchCook),
        isLeftover: Boolean(m.isLeftover),
        leftoverFrom: m.leftoverFrom ? String(m.leftoverFrom) : undefined,
        ingredients: toStringList(m.ingredients),
        instructions: toStringList(m.instructions),
        cuisine: m.cuisine ? String(m.cuisine) : undefined,
        difficulty: m.difficulty ? String(m.difficulty) : undefined,
        tags: toStringList(m.tags),
        chefTip: m.chefTip ? String(m.chefTip) : undefined,
        ...sourceFields(m.sourceUrl, sources),
        imageQuery: m.imageQuery ? String(m.imageQuery).slice(0, 120) : String(m.title).slice(0, 120),
      };
    })
    .filter((m: any) => m.dayIndex <= maxDays);
  if (meals.length === 0) return null;
  const lastDay = Math.max(...meals.map((m: any) => m.dayIndex));
  return {
    title: String(raw.title || 'Your Meal Plan'),
    totalDays: Math.min(maxDays, Number(raw.totalDays) || lastDay),
    theme: String(raw.theme || 'Balanced'),
    budgetPerServing: String(raw.budgetPerServing || ''),
    meals,
  };
}

function normalizeRecipe(raw: any, servings: number, sources?: Map<string, SourceRecipe>): any | null {
  if (!raw || !raw.title) return null;
  return {
    title: String(raw.title),
    description: String(raw.description || ''),
    prepMinutes: Number(raw.prepMinutes) || 15,
    cookMinutes: Number(raw.cookMinutes) || 20,
    servings: Number(raw.servings) || servings,
    calories: Number(raw.calories) || undefined,
    mealType: raw.mealType ? String(raw.mealType) : undefined,
    cuisine: raw.cuisine ? String(raw.cuisine) : undefined,
    difficulty: raw.difficulty ? String(raw.difficulty) : undefined,
    tags: toStringList(raw.tags),
    ingredients: toStringList(raw.ingredients),
    instructions: toStringList(raw.instructions),
    chefTip: raw.chefTip ? String(raw.chefTip) : undefined,
    ...sourceFields(raw.sourceUrl, sources),
    imageQuery: raw.imageQuery ? String(raw.imageQuery).slice(0, 120) : String(raw.title).slice(0, 120),
  };
}

const PLAN_SCHEMA_PROMPT = `Respond with ONE JSON object only (no markdown, no commentary) in exactly this shape:
{
  "reply": "2-3 friendly sentences introducing the plan",
  "plan": {
    "title": "string", "totalDays": number, "theme": "string", "budgetPerServing": "e.g. $5.00/serving",
    "meals": [
      { "dayIndex": 1, "dayLabel": "Day 1", "dateStr": "", "mealType": "Breakfast|Lunch|Dinner|Snack",
        "title": "string", "description": "one sentence", "prepMinutes": number, "cookMinutes": number,
        "servings": number, "calories": number, "isBatchCook": false,
        "cuisine": "string", "difficulty": "Easy|Medium|Hard", "tags": ["diet or style tags"],
        "imageQuery": "2-5 word photo search phrase for the finished dish, e.g. coconut laksa noodle soup", "sourceUrl": "exact url of the SOURCE RECIPE this meal is based on, or empty string", "ingredients": ["quantity + ingredient"], "instructions": ["clear numbered-style cooking steps, 4-8 steps"], "chefTip": "string" }
    ]
  },
  "recommendedRecipe": {
    "title": "string", "description": "string", "prepMinutes": number, "cookMinutes": number, "servings": number,
    "calories": number, "mealType": "string", "cuisine": "string", "difficulty": "Easy|Medium|Hard", "tags": ["string"],
    "imageQuery": "2-5 word photo search phrase", "sourceUrl": "exact source recipe url or empty string", "ingredients": ["string"], "instructions": ["step"], "chefTip": "string"
  }
Every meal must be a complete, cookable recipe: real quantities in ingredients and real step-by-step instructions (never placeholders).
}
Respect every diet, allergy, avoided ingredient and taste preference given. Never include prohibited ingredients.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { 
      prompt, 
      answers, 
      preferences, 
      pantryItems: pantryItemsBody,
      pantry,
      userEmail: bodyUserEmail,
      userId: bodyUserId,
      isQuestionnaireComplete,
      topicTitle,
      questionnaireSummary,
      questionnaireAnswers,
      messages: history
    } = body as any;

    // Identity comes from the signed-in session (regular users cannot act as someone else).
    const scoped = scopeToSession(req, { email: bodyUserEmail, userId: bodyUserId });
    if (scoped.error) return scoped.error;
    const reqUserEmail = scoped.email || bodyUserEmail;
    const reqUserId = scoped.userId || bodyUserId;
    const pantryItems = pantryItemsBody || pantry;
    // Plan / recipe requests typed in the chef chat are answered as a structured result too, so they follow the admin "Final Results Appearance" setting.
    // forceGenerate: the page asks for NEW recipes after it already looked at the user's own recipes and books.
    const forceGenerate = Boolean((body as any)?.forceGenerate);
    let chatText = String(prompt || '');
    const chatPlanIntent = (body as any)?.source === 'chef'
      && /(meal\s*plan|\bmenu\b|meal\s*prep|\b\d+\s*-?\s*days?\b|\bweek(ly)?\b|\bplan\b|\brecipes?\b|how (do|to|can) (i )?(cook|make|prepare)|what (should|can) i (cook|eat|make))/i.test(chatText);
    let structured = Boolean(isQuestionnaireComplete) || chatPlanIntent || forceGenerate;

    // AI Saved Recipe Grounding Scope
    let savedRecipesContext = '';
    const enableSavedRecipeSearch = (body as any)?.enableSavedRecipeSearch !== undefined
      ? Boolean((body as any).enableSavedRecipeSearch)
      : true;

    if (enableSavedRecipeSearch) {
      try {
        const targetUserId = reqUserId || reqUserEmail || 'guest';
        if (targetUserId !== 'guest') {
          const savedResult: any = await query(
            'SELECT title, description, ingredients, tags FROM saved_recipes WHERE user_id = $1 OR user_email = $1 ORDER BY id DESC LIMIT 5',
            [targetUserId]
          );
          const rows = savedResult?.rows || (Array.isArray(savedResult) ? savedResult : []);
          if (rows.length > 0) {
            savedRecipesContext = `USER SAVED RECIPES (Reference these flavors if relevant):\n` +
              rows.map((r: any) => `- ${r.title}: ${r.description || ''} (${r.ingredients || ''})`).join('\n') + '\n\n';
          }
        }
      } catch (_) {
        // Non-blocking fallback if saved_recipes table is empty or unpopulated
      }
    }

    // 1. Fetch complete settings directly from PostgreSQL / MySQL admin_settings
    let serverSettings: any = {};
    try {
      serverSettings = await getServerAdminSettings();
    } catch (_) {}

    const chefSettings = serverSettings?.chefAiSettings || serverSettings?.aiSettings || {};

    // Small talk ("hello", "thanks", "bye") gets a short human reply: no recipes, no sources, no tokens.
    let smallTalkFallback = '';
    if ((body as any)?.source === 'chef' && !isQuestionnaireComplete) {
      const t = chatText.trim().toLowerCase().replace(/[!.,?~]+/g, ' ').replace(/\s+/g, ' ').trim();
      const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
      let quick = '';
      if (/^(hi|hello|hey|hiya|yo|hola|howdy|sup|good (morning|afternoon|evening)|greetings)( there| chef| foodie| chef foodie| everyone)?$/.test(t)) {
        quick = pick(['Hi! 👋 What shall we cook today?', 'Hello! What are you in the mood to eat?', 'Hey there! Hungry? Tell me what you feel like eating.']);
      } else if (/^(how are you|how are you doing|how r u|what s up|whats up)$/.test(t)) {
        quick = pick(["Doing great, thanks for asking! What would you like to eat today?", "All good here! Got something in mind to cook?"]);
      } else if (/^(thanks|thank you|thank you so much|thx|ty|cheers|great thanks|ok thanks)$/.test(t)) {
        quick = pick(["You're welcome! Anything else you'd like to cook?", 'Happy to help! Just say if you need more ideas.']);
      } else if (/^(ok|okay|cool|great|nice|got it|alright|sounds good|awesome)$/.test(t)) {
        quick = 'Great! Tell me whenever you want to plan something.';
      } else if (/^(bye|goodbye|see you|see ya|good night|goodnight)$/.test(t)) {
        quick = 'Bye for now! Happy cooking 🍳';
      }
      smallTalkFallback = quick;
    }

    
    // Extract individual controls configured in /admin/ai-settings
    const provider = (chefSettings.provider || serverSettings?.aiProvider || 'gemini').toLowerCase();
    
    // Resolve active API key
    let rawApiKey = (chefSettings.apiKey || '').trim();
    if (!rawApiKey) {
      if (provider === 'gemini') {
        rawApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
      } else {
        rawApiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';
      }
    }
    const apiKey = rawApiKey.replace(/^['"]|['"]$/g, '').trim();

    const initialModel = chefSettings.model || serverSettings?.aiModel || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o');
    const temperature = typeof chefSettings.temperature === 'number' ? chefSettings.temperature : 0.7;
    const maxTokens = typeof chefSettings.maxTokens === 'number' ? chefSettings.maxTokens : 4096;
    const systemPrompt = chefSettings.systemPrompt || 'You are Chef Foodie, an expert autonomous culinary AI assistant.';
    if (smallTalkFallback) {
      // Greetings are answered by the model too, so the admin "System Prompt / Autonomous Persona" (name, tone, language) is followed. The canned line is only the fallback.
      let reply = smallTalkFallback;
      try {
        if (apiKey) {
          const sys = `${systemPrompt}\n\nCHAT STYLE: you are chatting with a person. Reply in 1 or 2 short, natural sentences, plain text only (no markdown, no lists), in the language the user wrote. Greet them in your own persona and invite them to say what they would like to eat or cook. Do not list recipes.`;
          let text = '';
          if (provider === 'gemini') {
            let model = resolveGeminiModel(sanitizeGeminiModel(initialModel));
            for (let attempt = 0; attempt < 3 && !text; attempt++) {
              const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts: [{ text: chatText.slice(0, 200) }] }],
                  systemInstruction: { parts: [{ text: sys }] },
                  generationConfig: { temperature: 0.8, maxOutputTokens: 120, ...fastThinking(model) },
                }),
                signal: AbortSignal.timeout(6000),
                cache: 'no-store',
              });
              const d: any = await r.json().catch(() => ({}));
              if (r.ok) { text = (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim(); break; }
              if (!isRetiredModelError(r.status, d?.error?.message || '')) break;
              retiredGeminiModels.add(model);
              model = resolveGeminiModel(model);
            }
          } else {
            const r = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: initialModel || 'gpt-4o', messages: [{ role: 'system', content: sys }, { role: 'user', content: chatText.slice(0, 200) }], temperature: 0.8, max_tokens: 120 }),
              signal: AbortSignal.timeout(6000),
              cache: 'no-store',
            });
            const d: any = await r.json().catch(() => ({}));
            text = String(d?.choices?.[0]?.message?.content || '').trim();
          }
          if (text) reply = text.replace(/[*_#`]/g, '').slice(0, 400);
        }
      } catch (_) { /* keep the fallback line */ }
      return NextResponse.json({ success: true, reply: reply + '\u2064', consumedSystemTokens: 0, remainingBalance: null, sourcesUsed: [] });
    }

    const enableWebSearch = chefSettings.enableWebSearch !== false;
    const enablePantryContext = chefSettings.enablePantryContext !== false;
    const strictDiet = chefSettings.strictDietEnforcement !== false;
    const maxPlanDays = chefSettings.maxPlanDays || 7;
    const resultDisplayMode = chefSettings.resultDisplayMode || 'card';

    const knowledgeBases: string[] = Array.isArray(chefSettings.knowledgeBaseList) ? chefSettings.knowledgeBaseList : [];
    const customVocab: string[] = Array.isArray(chefSettings.customVocabularyList) ? chefSettings.customVocabularyList : [];
    const filterWords: string[] = Array.isArray(chefSettings.filterWordsList) ? chefSettings.filterWordsList : [];
    const recommendedUrls: string[] = Array.isArray(chefSettings.recommendedRecipeUrls) ? chefSettings.recommendedRecipeUrls.filter(Boolean) : [];
    // How the recommended websites are used: 'only' = just their recipes, 'first' = their recipes first and the AI fills gaps (default), 'off' = style reference only.
    const sourceMode: 'only' | 'first' | 'off' = ['only', 'first', 'off'].includes(chefSettings.recommendedSourceMode) ? chefSettings.recommendedSourceMode : 'first';

    // 2. Strict Filter Words Pre-flight Validation
    if (strictDiet && filterWords.length > 0) {
      // Only what the user asked for is checked. Their own "avoid" list is what they want left out, so it is not a violation.
      const userContent = JSON.stringify({ prompt, answers }).toLowerCase();
      for (const word of filterWords) {
        if (word && word.trim() && userContent.includes(word.trim().toLowerCase())) {
          return NextResponse.json({
            success: false,
            error: `Request contains prohibited ingredient or restricted term: "${word}". (Enforced by AI Settings)`,
            filterViolation: true
          }, { status: 400 });
        }
      }
    }

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: `No active ${provider === 'gemini' ? 'Google Gemini' : 'OpenAI'} API key configured in /admin/ai-settings or .env`
      }, { status: 500 });
    }

    // Guided chat: for a new food request the chef leads the user with ONE friendly question at a time
    // until it knows enough, then builds the complete plan. Question turns cost no tokens.
    // Switch off with chefAiSettings.askBeforeSuggesting = false.
    const CONSULT_MARK = '⁣';
    const askFirst = chefSettings.askBeforeSuggesting !== false;
    const historyArr: any[] = Array.isArray(history) ? history : [];
    const assistantTurns = historyArr.filter((m: any) => m?.role === 'assistant' && !/^\s*⚠️/.test(String(m?.content || '')));
    const lastAssistant = [...historyArr].reverse().find((m: any) => m?.role === 'assistant');
    const inConsult = Boolean(lastAssistant && String(lastAssistant.content || '').endsWith(CONSULT_MARK));
    const consultQuestions = assistantTurns.filter((m: any) => String(m?.content || '').endsWith(CONSULT_MARK)).length;
    // Greetings and consult questions are light turns; only a real answer (plan, recipe, advice) counts as the chat having started.
    const heavyAssistantTurns = assistantTurns.filter((m: any) => { const c = String(m?.content || ''); return !c.endsWith(CONSULT_MARK) && !c.endsWith('\u2064'); });
    const wantsSuggestion = (body as any)?.source === 'chef' && !isQuestionnaireComplete
      && /(meal\s*plan|\bmenu\b|meal\s*prep|recommend|suggest|\bideas?\b|what (should|can) i (cook|eat|make)|\brecipes?\b|\bdish(es)?\b|hungry|something to eat|what to eat|\bdinner\b|\blunch\b|\bbreakfast\b|craving|\bmeals?\b)/i.test(chatText)
      && !/^\s*how (do|to|can)\b/i.test(chatText);

    if (askFirst && !forceGenerate && (body as any)?.source === 'chef' && !isQuestionnaireComplete && (inConsult || (wantsSuggestion && heavyAssistantTurns.length === 0))) {
      const pr: any = preferences || {};
      const list = (v: any) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean).join(', ');
      const known = [
        list(pr.diet) && `diet: ${list(pr.diet)}`,
        list(pr.allergy) && `allergies: ${list(pr.allergy)}`,
        list(pr.avoid) && `avoiding: ${list(pr.avoid)}`,
        list(pr.tastes) && `taste: ${list(pr.tastes)}`,
        pr.servings && `servings: ${pr.servings}`,
        pr.country && `country: ${pr.country}`,
      ].filter(Boolean).join('; ');
      const capDays = Number(chefSettings.maxPlanDays) || 7;
      const userMsgs = historyArr.filter((m: any) => m?.role === 'user').slice(-5).map((m: any) => String(m?.content || '').slice(0, 300));
      const transcript = [...historyArr.slice(-6).map((m: any) => `${m?.role === 'assistant' ? 'Chef' : 'User'}: ${String(m?.content || '').replace(CONSULT_MARK, '').slice(0, 400)}`), `User: ${chatText.slice(0, 400)}`].join('\n');
      const consultSystem = `${systemPrompt}\n\nFor this chat, follow the persona above (name, tone, language). Your job now: chat with the user to work out what they want to cook. Your goal is to collect just enough to build a COMPLETE recipe plan.
Known profile (never repeat it back): ${known || 'none'}.
What you need, in this order: (1) WHAT they want to eat or cook (a dish, cuisine, craving, mood, or they let you decide); (2) FOR HOW MANY DAYS to plan (1 means just today; maximum ${capDays}); (3) optionally which meals, cooking time or skill, ingredients to leave out, budget. Never skip (1) or (2) unless the user already stated them.
Rules: ask exactly ONE short, warm question at a time (under 25 words), in plain text with no lists, no markdown and no asterisks. Skip anything already answered or implied. If the user says "you decide" or "anything", accept that and move on. Ask at most 3 questions in total (so far you asked ${consultQuestions}). You are ready only when both (1) what to eat and (2) how many days are known (accept "you decide" for (1)), or the user seems impatient.
Reply ONLY with JSON: {"ready": boolean, "reply": string}. When not ready, "reply" is your next question. When ready, "reply" is one short sentence saying you are putting it together.`;

      let ready = consultQuestions >= 3;
      let consultReply = '';
      try {
        const sig = AbortSignal.timeout(10000);
        let raw = '';
        if (provider === 'gemini') {
          let model = resolveGeminiModel(sanitizeGeminiModel(initialModel));
          let d: any = {};
          for (let attempt = 0; attempt < 3; attempt++) {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: transcript }] }],
                systemInstruction: { parts: [{ text: consultSystem }] },
                generationConfig: { temperature: 0.5, maxOutputTokens: 300, responseMimeType: 'application/json', ...fastThinking(model) },
              }),
              signal: sig,
              cache: 'no-store',
            });
            d = await r.json().catch(() => ({}));
            if (r.ok || !isRetiredModelError(r.status, d?.error?.message || '')) break;
            retiredGeminiModels.add(model);
            model = resolveGeminiModel(model);
          }
          raw = (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text).filter(Boolean).join('');
        } else {
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: initialModel || 'gpt-4o',
              messages: [{ role: 'system', content: consultSystem }, { role: 'user', content: transcript }],
              temperature: 0.5,
              max_tokens: 300,
              response_format: { type: 'json_object' },
            }),
            signal: sig,
            cache: 'no-store',
          });
          const d: any = await r.json().catch(() => ({}));
          raw = d?.choices?.[0]?.message?.content || '';
        }
        const parsedC = extractJson(raw);
        if (parsedC && typeof parsedC.reply === 'string') {
          consultReply = parsedC.reply.replace(/[*_#`]/g, '').trim();
          if (parsedC.ready === true) ready = true;
        }
      } catch (_) {}

      if (!ready) {
        if (!consultReply) {
          consultReply = consultQuestions === 0
            ? 'Sure! What would you like to eat today, or shall I plan a few days for you?'
            : 'Got it! Which meals should I include, and how many days?';
        }
        return NextResponse.json({
          success: true,
          reply: consultReply + CONSULT_MARK,
          awaitingAnswers: true,
          consumedSystemTokens: 0,
          remainingBalance: null,
          sourcesUsed: [],
        });
      }
      // Enough information. The page now checks the user's own recipes, books and pantry first, and calls back with forceGenerate if new recipes are needed.
      const requestText = [...userMsgs, chatText].join('. ').slice(0, 1200);
      return NextResponse.json({
        success: true,
        reply: consultReply || 'Great, let me check what you already have.',
        consultReady: true,
        request: requestText,
        consumedSystemTokens: 0,
        remainingBalance: null,
        sourcesUsed: [],
      });
    }

    // 3. Assemble Grounded System Instructions
    let fullSystemInstructions = `${systemPrompt}\n\n`;

    if (knowledgeBases.length > 0) {
      fullSystemInstructions += `PRIORITY KNOWLEDGE BASES:\n${knowledgeBases.map(k => `- ${k}`).join('\n')}\n\n`;
    }

    if (customVocab.length > 0) {
      fullSystemInstructions += `CUSTOM CULINARY VOCABULARY (Prioritize these concepts):\n${customVocab.join(', ')}\n\n`;
    }

    if (filterWords.length > 0) {
      fullSystemInstructions += `STRICTLY PROHIBITED INGREDIENTS & TERMS (Never suggest or include):\n${filterWords.join(', ')}\n\n`;
    }

    // Not enough tokens: stop BEFORE the AI runs (and before any website is read), instead of answering for free.
    try {
      const activeUserPre = reqUserEmail || reqUserId;
      if (activeUserPre) {
        const ts = await import('@/lib/tokenService');
        const tset: any = await ts.getTokenSettings();
        if (tset?.isEnabled) {
          const need = Math.max(Number(tset.chefCost) || 0, Number(tset.mealPlannerCost) || 0);
          const acct = await ts.getUserTokenAccount(reqUserId || activeUserPre, reqUserEmail || activeUserPre);
          if (acct.exists && need > 0 && acct.balance < need) {
            return NextResponse.json({
              success: false,
              insufficientTokens: true,
              error: `Insufficient ${tset.tokenName || 'tokens'}. You need ${need} ${tset.tokenSymbol || ''} and have ${acct.balance}.`,
              required: need,
              remainingBalance: acct.balance,
            }, { status: 402 });
          }
        }
      }
    } catch (_) { /* never block a chat because the token check itself failed */ }

    // Primary recipe sources: really read the configured sites and hand the model complete recipes from them.
    let sourceRecipes: SourceRecipe[] = [];
    if (recommendedUrls.length > 0 && sourceMode !== 'off' && structured) {
      const earlierAsks = Array.isArray(history) ? history.filter((m: any) => m?.role === 'user').slice(-3).map((m: any) => String(m?.content || '').slice(0, 300)).join(' ') : '';
      const requestText = `${chatText} ${earlierAsks} ${topicTitle || ''} ${JSON.stringify(questionnaireSummary || []).slice(0, 800)} ${JSON.stringify((preferences as any)?.diet || [])}`;
      const pr: any = preferences || {};
      const asList = (v: any) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);
      sourceRecipes = await gatherSourceRecipes(recommendedUrls, requestText, {
        meatFree: asList(pr.diet).some((d) => /vegetarian|vegan/i.test(d)),
        exclude: [...asList(pr.allergy), ...asList(pr.avoid)].filter((w) => !/^(none|other)$/i.test(w)),
      });
    }
    // Next tier: when the recommended websites did not give enough real recipes, search the web for real recipe pages (read and checked the same way). AI-written recipes stay the last option.
    if (structured && sourceMode !== 'only' && sourceMode !== 'off' && enableWebSearch && provider === 'gemini') {
      const dayMatch = chatText.match(/(\d+)\s*-?\s*days?\b/i) || (Array.isArray(history) ? history.map((m: any) => String(m?.content || '')).join(' ').match(/(\d+)\s*-?\s*days?\b/i) : null);
      const wanted = Math.min(6, Math.max(2, (dayMatch ? Number(dayMatch[1]) : 1) * 2));
      if (sourceRecipes.length < wanted) {
        try {
          const pr: any = preferences || {};
          const asList = (v: any) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);
          const webUrls = await webSearchRecipeUrls(apiKey, sanitizeGeminiModel(initialModel), `${chatText} ${asList(pr.diet).join(' ')}`.trim(), recommendedUrls);
          if (webUrls.length > 0) {
            const extra = await gatherSourceRecipes(webUrls, `${chatText} ${asList(pr.diet).join(' ')}`, {
              meatFree: asList(pr.diet).some((d) => /vegetarian|vegan/i.test(d)),
              exclude: [...asList(pr.allergy), ...asList(pr.avoid)].filter((w) => !/^(none|other)$/i.test(w)),
            });
            const have = new Set(sourceRecipes.map((r) => r.url));
            for (const r of extra) if (!have.has(r.url)) sourceRecipes.push(r);
          }
        } catch (_) { /* web search is a bonus tier; fall through to AI */ }
      }
    }
    const sourceMap = new Map<string, SourceRecipe>(sourceRecipes.map((r) => [r.url, r]));

    if (recommendedUrls.length > 0 && !structured) {
      // Plain chat: no source list, so the chef does not push recipes into a normal conversation.
    } else if (recommendedUrls.length > 0 && sourceMode === 'off') {
      fullSystemInstructions += `RECOMMENDED WEBSITES (style and flavour reference only; do not copy or invent links):\n${recommendedUrls.map(u => `- ${u}`).join('\n')}\n\n`;
    } else if (recommendedUrls.length > 0) {
      fullSystemInstructions += `PRIMARY RECIPE SOURCES (the administrator's preferred websites):\n${recommendedUrls.map(u => `- ${u}`).join('\n')}\n`;
      if (sourceRecipes.length > 0) {
        fullSystemInstructions += `\nSOURCE RECIPES found on those websites just now. Each was already checked against the user's diet, allergies and avoided ingredients:\n${sourceRecipesToPrompt(sourceRecipes)}\n\nRULES FOR SOURCE RECIPES: Build the answer from these real recipes first. For every meal choose the best fitting source recipe and copy its exact url into "sourceUrl"; the server then uses that recipe's real text and photo, so you only decide which recipe goes in which slot (use different recipes for different meals unless you plan leftovers). ${sourceMode === 'only' ? 'Use ONLY these source recipes. Do not write any original meal; if fewer fit, return fewer meals.' : 'Write an original meal only when no source recipe fits that slot, and leave "sourceUrl" empty for it.'} Never invent or alter a url.\n\n`;
      } else {
        fullSystemInstructions += `No source recipe could be read right now. Write original recipes in the style of these sources and leave "sourceUrl" empty. Never invent a url.\n\n`;
      }
    }

    if (enablePantryContext && Array.isArray(pantryItems) && pantryItems.length > 0) {
      fullSystemInstructions += `USER IN-STOCK PANTRY INVENTORY:\n${pantryItems.map((p: any) => `- ${p.name || p} (${p.quantity || 'available'})`).join('\n')}\nMark matching recipe ingredients with "Pantry ✓" where applicable.\n\n`;
    }

    if (savedRecipesContext) {
      fullSystemInstructions += savedRecipesContext;
    }

    if (!structured) {
      fullSystemInstructions += `CHAT STYLE (very important): Talk like a friendly person in a chat, not like a brochure. Keep replies short: 1 to 3 sentences for casual or simple messages. Never open with a long welcome, never repeat the user's profile or preferences back to them, and never list recipes or ideas unless the user asked for them. Ask at most one short question at a time. Use plain text only: no markdown, no asterisks, no headings, no bullet lists. Answer cooking questions directly and briefly.\n\n`;
    }

    fullSystemInstructions += `PLANNING CONSTRAINTS:\n- Maximum plan duration: ${maxPlanDays} days.\n- Preferred presentation mode: ${resultDisplayMode}.\n`;

    // 4. Zero-Dependency Native Fetch Execution (Google Gemini & OpenAI)
    let replyText = '';
    let finalModelUsed = initialModel;

    const historyText = !structured && Array.isArray(history)
      ? history.slice(-6).map((m: any) => `${m?.role === 'assistant' ? 'Chef' : 'User'}: ${String(m?.content || '').slice(0, 1500)}`).join('\n')
      : '';
    const structuredTask = isQuestionnaireComplete
      ? `Create the final result for the "${topicTitle || 'Standard Wizard'}" questionnaire.\nQuestionnaire Q&A: ${JSON.stringify(questionnaireSummary || [])}`
      : `${historyText ? `Conversation so far:\n${historyText}\n\n` : ''}User Request: ${chatText}`;
    const userPayload = structured
      ? `${structuredTask}\nPreferences: ${JSON.stringify(preferences || {})}\nMaximum plan days: ${maxPlanDays}\nPreferred presentation mode: ${resultDisplayMode}\n\n${PLAN_SCHEMA_PROMPT}\nIf the request is for a single dish or recipe, return exactly one meal on dayIndex 1.`
      : `${historyText ? `Conversation so far:\n${historyText}\n\n` : ''}User Request: ${prompt || 'Create a balanced culinary recommendation.'}\nIntake Questionnaire Answers: ${JSON.stringify(answers || questionnaireAnswers || {})}\nPreferences: ${JSON.stringify(preferences || {})}`;
    const effectiveMaxTokens = structured ? Math.max(maxTokens, 8192) : maxTokens;

    if (provider === 'gemini') {
      let targetModel = resolveGeminiModel(sanitizeGeminiModel(initialModel));
      finalModelUsed = targetModel;

      const promptPayload = userPayload;

      const generateGeminiContent = async (modelToCall: string, withTools: boolean) => {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToCall}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const payload: any = {
          contents: [
            {
              role: 'user',
              parts: [{ text: promptPayload }]
            }
          ],
          systemInstruction: {
            parts: [{ text: fullSystemInstructions }]
          },
          generationConfig: {
            temperature,
            maxOutputTokens: effectiveMaxTokens,
            ...fastThinking(modelToCall),
            ...(structured ? { responseMimeType: 'application/json' } : {})
          }
        };

        if (withTools && enableWebSearch && !structured) {
          payload.tools = [{ googleSearch: {} }];
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(payload),
          cache: 'no-store'
        });

        const data = await res.json().catch(() => ({}));
        return { res, data };
      };

      // Primary Attempt
      let { res, data } = await generateGeminiContent(targetModel, enableWebSearch && !structured);

      // Graceful Retry 1: If search tools caused a 400 error, retry without tools
      if (!res.ok && enableWebSearch && (data?.error?.message?.includes('tool') || res.status === 400)) {
        const retry = await generateGeminiContent(targetModel, false);
        res = retry.res;
        data = retry.data;
      }

      // Graceful Retry 2: model retired or not found: walk the fallback list until one answers.
      for (let hop = 0; hop < 3 && !res.ok && isRetiredModelError(res.status, data?.error?.message || ''); hop++) {
        retiredGeminiModels.add(finalModelUsed);
        const fallbackModel = resolveGeminiModel(finalModelUsed);
        if (fallbackModel === finalModelUsed) break;
        finalModelUsed = fallbackModel;
        const retryFallback = await generateGeminiContent(fallbackModel, false);
        res = retryFallback.res;
        data = retryFallback.data;
      }

      // Graceful Retry 3: quota / rate limit (429). Quota is counted per model and per tool, so try without web search, then a stable fallback model.
      if (!res.ok && (res.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED')) {
        if (enableWebSearch) {
          const noTools = await generateGeminiContent(targetModel, false);
          res = noTools.res;
          data = noTools.data;
        }
        if (!res.ok && (res.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED') && targetModel !== 'gemini-2.5-flash') {
          finalModelUsed = 'gemini-2.5-flash';
          const quotaFallback = await generateGeminiContent('gemini-2.5-flash', false);
          res = quotaFallback.res;
          data = quotaFallback.data;
        }
      }

      if (!res.ok) {
        throw new Error(data?.error?.message || `Google Gemini API returned status ${res.status}`);
      }

      const parts = data?.candidates?.[0]?.content?.parts || [];
      replyText = parts.map((p: any) => p.text).filter(Boolean).join('\n') || '';
    } else {
      // OpenAI REST Integration
      finalModelUsed = initialModel || 'gpt-4o';
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: finalModelUsed,
          messages: [
            { role: 'system', content: fullSystemInstructions },
            { role: 'user', content: userPayload }
          ],
          temperature,
          max_tokens: effectiveMaxTokens,
          ...(structured ? { response_format: { type: 'json_object' } } : {})
        }),
        cache: 'no-store'
      });

      const openAiData = await openAiRes.json().catch(() => ({}));
      if (!openAiRes.ok) {
        throw new Error(openAiData?.error?.message || `OpenAI API returned status ${openAiRes.status}`);
      }

      replyText = openAiData?.choices?.[0]?.message?.content || '';
    }

    // Structured result: turn the model's JSON into the plan / recipe the /chef page renders.
    let planOut: any = null;
    let recipeOut: any = null;
    if (structured) {
      const parsed = extractJson(replyText);
      const sv = Number(preferences?.servings) || 2;
      planOut = normalizePlan(parsed?.plan, Number(maxPlanDays) || 7, sv, sourceMap);
      recipeOut = normalizeRecipe(parsed?.recommendedRecipe, sv, sourceMap);
      // Photos: every dish gets the photo of the closest matching recipe on the configured sources. No close match = no photo (the page shows a neutral tile).
      if (recommendedUrls.length > 0 && sourceMode !== 'off') {
        const wanted: string[] = [];
        if (planOut) for (const m of planOut.meals) if (!m.image) wanted.push(m.title);
        if (recipeOut && !recipeOut.image) wanted.push(recipeOut.title);
        if (wanted.length > 0) {
          const found = await findSourceImages(recommendedUrls, Array.from(new Set(wanted)), sourceRecipes, 4000);
          if (planOut) for (const m of planOut.meals) { const f = !m.image ? found.get(m.title) : undefined; if (f) { m.image = f.image; m.imageFrom = f.pageUrl; } }
          if (recipeOut && !recipeOut.image) { const f = found.get(recipeOut.title); if (f) { recipeOut.image = f.image; recipeOut.imageFrom = f.pageUrl; } }
        }
      }
      if (sourceMode === 'only' && recommendedUrls.length > 0) {
        if (planOut) { planOut.meals = planOut.meals.filter((m: any) => !m.aiGenerated); if (planOut.meals.length === 0) planOut = null; }
        if (recipeOut && recipeOut.aiGenerated) recipeOut = null;
      }
      if (sourceMode === 'only' && recommendedUrls.length > 0 && !planOut && !recipeOut) {
        replyText = 'I could not find a matching recipe on your recommended websites for this request. Try different wording, or ask the administrator to allow other sources.';
      } else if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) replyText = parsed.reply.trim();
      else if (planOut) replyText = `Here is your ${planOut.title}.`;
      else if (isQuestionnaireComplete || /^\s*[{\[]/.test(replyText)) replyText = 'I could not format the plan this time. Please try again.';
    }

    // 5. Server-Side Token Deduction (Resilient, 1-argument options contract)
    let remainingTokens: number | null = null;
    let consumedTokens: number = 0;

    try {
      const activeUser = reqUserEmail || reqUserId;
      if (activeUser) {
        const tokenService = await import('@/lib/tokenService').catch(() => null);
        if (tokenService && typeof tokenService.deductUserTokens === 'function') {
          const settings = typeof tokenService.getTokenSettings === 'function' 
            ? await tokenService.getTokenSettings() 
            : null;
          // Charge what the user is shown on the token page: a plan costs the Meal Plan price, any other answer the AI Chef price.
          const chefCost = (planOut ? (settings?.mealPlannerCost ?? settings?.chefCost) : settings?.chefCost) || 8;
          const kindLabel = planOut ? 'Meal plan' : recipeOut ? 'Recipe' : 'Chat';
          const askSnippet = chatText.replace(/\s+/g, ' ').trim().slice(0, 60);
          consumedTokens = 0;

          // Single options object contract to satisfy TypeScript TS2554
          const deduction = await (tokenService.deductUserTokens as any)({
            userId: reqUserId || activeUser,
            userEmail: reqUserEmail || activeUser,
            cost: chefCost,
            amount: chefCost,
            tokens: chefCost,
            feature: 'chef',
            description: `Chef AI ${kindLabel}: "${askSnippet}"`
          });

          // Only report a charge when the deduction really happened.
          if (deduction && deduction.success && Number(deduction.deducted) > 0) {
            consumedTokens = Number(deduction.deducted);
          }
          if (deduction && typeof deduction.currentBalance === 'number') {
            remainingTokens = deduction.currentBalance;
          } else if (deduction && typeof deduction.balance === 'number') {
            remainingTokens = deduction.balance;
          } else if (deduction && typeof deduction.remainingTokens === 'number') {
            remainingTokens = deduction.remainingTokens;
          }
        }
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      reply: replyText,
      recipe: recipeOut,
      recommendedRecipe: recipeOut,
      plan: planOut,
      resultDisplayMode,
      remainingBalance: remainingTokens,
      consumedSystemTokens: consumedTokens,
      sourcesUsed: sourceRecipes.map((r) => ({ title: r.title, url: r.url })),
      appliedSettings: {
        provider,
        model: finalModelUsed,
        temperature,
        maxTokens,
        resultDisplayMode,
        strictDietEnforced: strictDiet,
        pantryContextApplied: enablePantryContext && Array.isArray(pantryItems) && pantryItems.length > 0,
        primarySourcesCount: recommendedUrls.length,
        tokensDeducted: consumedTokens,
        remainingBalance: remainingTokens
      }
    });

  } catch (err: any) {
    console.error('[/api/ai] Generation error:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Failed to process culinary generation request'
    }, { status: 500 });
  }
}
