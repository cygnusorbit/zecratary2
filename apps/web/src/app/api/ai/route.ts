import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerAdminSettings } from '@/lib/serverSettings';
import { scopeToSession } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

// Sanitize legacy or deprecated Gemini model identifiers
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
function normalizePlan(raw: any, maxDays: number, servings: number): any | null {
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
        sourceUrl: m.sourceUrl ? String(m.sourceUrl) : '',
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

function normalizeRecipe(raw: any, servings: number): any | null {
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
    sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : undefined,
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
        "ingredients": ["quantity + ingredient"], "instructions": ["clear numbered-style cooking steps, 4-8 steps"], "chefTip": "string" }
    ]
  },
  "recommendedRecipe": {
    "title": "string", "description": "string", "prepMinutes": number, "cookMinutes": number, "servings": number,
    "calories": number, "mealType": "string", "cuisine": "string", "difficulty": "Easy|Medium|Hard", "tags": ["string"],
    "ingredients": ["string"], "instructions": ["step"], "chefTip": "string"
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
    const chatText = String(prompt || '');
    const chatPlanIntent = (body as any)?.source === 'chef'
      && /(meal\s*plan|\bmenu\b|meal\s*prep|\b\d+\s*-?\s*days?\b|\bweek(ly)?\b|\bplan\b|\brecipes?\b|how (do|to|can) (i )?(cook|make|prepare)|what (should|can) i (cook|eat|make))/i.test(chatText);
    const structured = Boolean(isQuestionnaireComplete) || chatPlanIntent;

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
    const enableWebSearch = chefSettings.enableWebSearch !== false;
    const enablePantryContext = chefSettings.enablePantryContext !== false;
    const strictDiet = chefSettings.strictDietEnforcement !== false;
    const maxPlanDays = chefSettings.maxPlanDays || 7;
    const resultDisplayMode = chefSettings.resultDisplayMode || 'card';

    const knowledgeBases: string[] = Array.isArray(chefSettings.knowledgeBaseList) ? chefSettings.knowledgeBaseList : [];
    const customVocab: string[] = Array.isArray(chefSettings.customVocabularyList) ? chefSettings.customVocabularyList : [];
    const filterWords: string[] = Array.isArray(chefSettings.filterWordsList) ? chefSettings.filterWordsList : [];
    const recommendedUrls: string[] = Array.isArray(chefSettings.recommendedRecipeUrls) ? chefSettings.recommendedRecipeUrls.filter(Boolean) : [];

    // 2. Strict Filter Words Pre-flight Validation
    if (strictDiet && filterWords.length > 0) {
      const userContent = JSON.stringify({ prompt, answers, preferences }).toLowerCase();
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

    if (recommendedUrls.length > 0) {
      fullSystemInstructions += `RECOMMENDED PRIMARY RECIPE SOURCE URLS (Prioritize culinary style, flavor profiles, and link references from these websites):\n${recommendedUrls.map(u => `- ${u}`).join('\n')}\n\n`;
    }

    if (enablePantryContext && Array.isArray(pantryItems) && pantryItems.length > 0) {
      fullSystemInstructions += `USER IN-STOCK PANTRY INVENTORY:\n${pantryItems.map((p: any) => `- ${p.name || p} (${p.quantity || 'available'})`).join('\n')}\nMark matching recipe ingredients with "Pantry ✓" where applicable.\n\n`;
    }

    if (savedRecipesContext) {
      fullSystemInstructions += savedRecipesContext;
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
      let targetModel = sanitizeGeminiModel(initialModel);
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

      // Graceful Retry 2: If model is deprecated or not found (404), auto-fallback to gemini-2.5-flash / gemini-3.6-flash
      if (!res.ok && (res.status === 404 || data?.error?.message?.includes('not found') || data?.error?.message?.includes('no longer available'))) {
        const fallbackModel = targetModel === 'gemini-2.5-flash' ? 'gemini-3.6-flash' : 'gemini-2.5-flash';
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
      planOut = normalizePlan(parsed?.plan, Number(maxPlanDays) || 7, sv);
      recipeOut = normalizeRecipe(parsed?.recommendedRecipe, sv);
      if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) replyText = parsed.reply.trim();
      else if (planOut) replyText = `Here is your ${planOut.title}.`;
      else if (isQuestionnaireComplete || /^\s*[{\[]/.test(replyText)) replyText = 'I could not format the plan this time. Please try again.';
    }

    // 5. Server-Side Token Deduction (Resilient, 1-argument options contract)
    let remainingTokens: number | null = null;
    let consumedTokens: number = 8;

    try {
      const activeUser = reqUserEmail || reqUserId;
      if (activeUser) {
        const tokenService = await import('@/lib/tokenService').catch(() => null);
        if (tokenService && typeof tokenService.deductUserTokens === 'function') {
          const settings = typeof tokenService.getTokenSettings === 'function' 
            ? await tokenService.getTokenSettings() 
            : null;
          consumedTokens = settings?.chefCost || 8;

          // Single options object contract to satisfy TypeScript TS2554
          const deduction = await (tokenService.deductUserTokens as any)({
            userId: reqUserId || activeUser,
            userEmail: reqUserEmail || activeUser,
            cost: consumedTokens,
            amount: consumedTokens,
            tokens: consumedTokens,
            feature: 'chef',
            description: 'Chef AI Assistant Query'
          });

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
