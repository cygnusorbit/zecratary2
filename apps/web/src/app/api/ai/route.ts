import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerAdminSettings } from '@/lib/serverSettings';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { 
      prompt, 
      answers, 
      preferences, 
      pantryItems, 
      userEmail: reqUserEmail,
      userId: reqUserId 
    } = body;

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

    if (provider === 'gemini') {
      let targetModel = sanitizeGeminiModel(initialModel);
      finalModelUsed = targetModel;

      const promptPayload = `User Request: ${prompt || 'Create a balanced culinary recommendation.'}\nIntake Questionnaire Answers: ${JSON.stringify(answers || {})}\nPreferences: ${JSON.stringify(preferences || {})}`;

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
            maxOutputTokens: maxTokens
          }
        };

        if (withTools && enableWebSearch) {
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
      let { res, data } = await generateGeminiContent(targetModel, enableWebSearch);

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
            { role: 'user', content: `Request: ${prompt || 'Suggest meal'}. Answers: ${JSON.stringify(answers || {})}` }
          ],
          temperature,
          max_tokens: maxTokens
        }),
        cache: 'no-store'
      });

      const openAiData = await openAiRes.json().catch(() => ({}));
      if (!openAiRes.ok) {
        throw new Error(openAiData?.error?.message || `OpenAI API returned status ${openAiRes.status}`);
      }

      replyText = openAiData?.choices?.[0]?.message?.content || '';
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
      recipe: null,
      plan: null,
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
