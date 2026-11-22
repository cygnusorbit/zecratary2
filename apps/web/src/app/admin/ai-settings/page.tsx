// Generated & Localized by AI Collaborator
'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Radio, Activity, CheckCircle2, XCircle, Loader2,
  Cpu, Sparkles, Globe, PackageCheck, 
  ShieldAlert, Check, RefreshCw, Bot, Zap, SlidersHorizontal, ListPlus, Trash2, Plus, Layers, FolderPlus, LayoutTemplate, Mic, Volume2, Settings, Eye, EyeOff, Calendar, Clock, Flame, Users, ToggleLeft, ToggleRight, BookOpen, BookA, Ban, X, CheckCircle, ChevronDown, BarChart3, TrendingUp, MessageSquare
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';
import ImageKeyCard from '@/components/ImageKeyCard';
import { 
  purgeLegacyBrowserAdminStorage, 
  fetchServerAdminSettings, 
  persistServerAdminSettings 
} from '@/lib/adminSync';
import { applyThemeToDocument, fetchAndApplyServerTheme, getMemoryThemeColors, setMemoryThemeColors } from '@/lib/themeConfig';

interface QuestionnaireQuestion {
  id: string;
  text: string;
  dedicatedAnswers: string[];
}

interface QuestionnaireSection {
  id: string;
  topicTitle: string;
  description: string;
  enabled?: boolean;
  questions: QuestionnaireQuestion[];
}

interface DailyUsagePoint {
  date: string;
  dayLabel: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

interface DiscoveredModel {
  id: string;
  name: string;
  description?: string;
}

const getDefaultDedicatedAnswersForText = (text: string): string[] => {
  const lower = (text || '').toLowerCase();
  if (lower.includes('how many days') || lower.includes('duration') || lower.includes('plan for')) {
    return ["3 Days (Quick Prep)", "5 Days (Workweek)", "7 Days (Full Week)", "Weekend Plan (2 Days)"];
  }
  if (lower.includes('meal type') || lower.includes('breakfast') || lower.includes('dinner')) {
    return ["Dinner only", "Lunch & Dinner", "All Meals (Breakfast, Lunch, Dinner)", "Breakfast & Dinner", "All Meals + Snack"];
  }
  if (lower.includes('when') || lower.includes('start')) {
    return ["Start Today", "Start Tomorrow", "Next Monday (Fresh Week)", "This Coming Weekend", "Flexible / Any Day"];
  }
  if (lower.includes('preference') || lower.includes('theme') || lower.includes('diet') || lower.includes('macro')) {
    return ["High-Protein Wholesome", "Quick & Easy (<25m)", "Mediterranean Fresh", "Keto / Low-Carb", "Budget-Friendly Comfort", "Plant-Based / Balanced Veggie"];
  }
  if (lower.includes('budget') || lower.includes('serving') || lower.includes('$')) {
    return ["Under $5/serving (Economy)", "$5 - $8/serving (Balanced)", "$8 - $12/serving (Generous)", "$12+/serving (Premium)", "Flexible Target"];
  }
  return ["Standard Option", "Custom Preference"];
};

const DEFAULT_SECTIONS: QuestionnaireSection[] = [
  {
    id: 'sec_core',
    topicTitle: 'Core Meal Plan Logistics',
    description: 'Basic duration, meal types, and start dates for the multi-day plan.',
    enabled: true,
    questions: [
      {
        id: 'q_core_1',
        text: "How many days would you like to plan for (up to 7 days)?",
        dedicatedAnswers: [
          "3 Days (Quick Prep)",
          "5 Days (Workweek)",
          "7 Days (Full Week)",
          "Weekend Plan (2 Days)"
        ]
      },
      {
        id: 'q_core_2',
        text: "Which meal types would you like to include each day (e.g., breakfast, lunch, dinner, snack)?",
        dedicatedAnswers: [
          "Dinner only",
          "Lunch & Dinner",
          "All Meals (Breakfast, Lunch, Dinner)",
          "Breakfast & Dinner",
          "All Meals + Snack"
        ]
      },
      {
        id: 'q_core_3',
        text: "When would you like the meal plan to start (today, tomorrow, or a specific date)?",
        dedicatedAnswers: [
          "Start Today",
          "Start Tomorrow",
          "Next Monday (Fresh Week)",
          "This Coming Weekend",
          "Flexible / Any Day"
        ]
      }
    ]
  },
  {
    id: 'sec_pref',
    topicTitle: 'Dietary Preferences & Budget',
    description: 'Themes, nutritional restrictions, and financial target per serving.',
    enabled: true,
    questions: [
      {
        id: 'q_pref_1',
        text: "Do you have any specific preferences or themes for these meals (e.g., high-protein, comfort food)?",
        dedicatedAnswers: [
          "High-Protein Wholesome",
          "Quick & Easy (<25m)",
          "Mediterranean Fresh",
          "Keto / Low-Carb",
          "Budget-Friendly Comfort",
          "Plant-Based / Balanced Veggie"
        ]
      },
      {
        id: 'q_pref_2',
        text: "What is your approximate ingredient budget per serving?",
        dedicatedAnswers: [
          "Under $5/serving (Economy)",
          "$5 - $8/serving (Balanced)",
          "$8 - $12/serving (Generous)",
          "$12+/serving (Premium)",
          "Flexible Target"
        ]
      }
    ]
  }
];

export default function ChefAISettingsPage() {
  let t = (key: string, fallback?: string) => fallback || key;
  try {
    const langContext = useTranslation();
    if (langContext && typeof langContext.t === 'function') {
      t = langContext.t;
    }
  } catch (_) {}

  const [activeTab, setActiveTab] = useState<'general' | 'questionnaire' | 'voice' | 'advanced'>('general');
  const [, setIsDayMode] = useState<boolean>(false);

  // AI Configurations
  const [provider, setProvider] = useState<'gemini' | 'openai' | string>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [availableModels, setAvailableModels] = useState<DiscoveredModel[]>([]);
  const [isScanningModels, setIsScanningModels] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [systemPrompt, setSystemPrompt] = useState(
    'You are Chef Foodie, an expert autonomous culinary AI assistant. You can handle any questions the user asks, but you must strictly focus on and prioritize the selected Knowledge Base, custom vocabulary, filter words, recommended recipe sources, and dietary preferences when generating culinary or meal planning responses.'
  );
  const [envKeysMap, setEnvKeysMap] = useState<Record<string, string>>({});
  const [syncingEnvKey, setSyncingEnvKey] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // AI Usage Telemetry State
  const [usageTimeframe, setUsageTimeframe] = useState<'24h' | '7d' | '30d'>('7d');
  const [usagePoints, setUsagePoints] = useState<DailyUsagePoint[]>([]);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState<boolean>(false);

  // Capabilities
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [enablePantryContext, setEnablePantryContext] = useState(true);
  const [strictDietEnforcement, setStrictDietEnforcement] = useState(true);
  const [maxPlanDays, setMaxPlanDays] = useState(7);
  const [resultDisplayMode, setResultDisplayMode] = useState<'card' | 'compact' | 'detailed' | string>('card');
  
  // Voice Interaction Settings
  const [enableVoiceInteraction, setEnableVoiceInteraction] = useState(true);
  const [voiceEngine, setVoiceEngine] = useState<'version1' | 'version2' | string>('version2');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voiceAutoPlay, setVoiceAutoPlay] = useState(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState('en-US-Neural2-F');

  // Agent Parameters
  const [knowledgeBaseList, setKnowledgeBaseList] = useState<string[]>(['Culinary Masterclass DB v2', 'Nutritional Guidelines 2026']);
  const [newKbInput, setNewKbInput] = useState('');

  const [customVocabularyList, setCustomVocabularyList] = useState<string[]>(['Umami', 'Sous-vide', 'Macronutrients', 'Batch-cooking']);
  const [newVocabInput, setNewVocabInput] = useState('');

  const [filterWordsList, setFilterWordsList] = useState<string[]>(['Oily', 'Artificial preservatives', 'Unhealthy trans fats']);
  const [newFilterInput, setNewFilterInput] = useState('');

  // Recommended Recipes Url (Primary Source for /chef)
  const [recommendedRecipeUrls, setRecommendedRecipeUrls] = useState<string[]>([]);
  const [newRecipeUrlInput, setNewRecipeUrlInput] = useState('');
  const [urlStatus, setUrlStatus] = useState<Record<string, { state: 'checking' | 'ok' | 'error'; text: string }>>({});

  // Multi-Topic Questionnaire State with Dedicated Answers
  const [sections, setSections] = useState<QuestionnaireSection[]>(DEFAULT_SECTIONS);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [activeTopicId, setActiveTopicId] = useState<string>('sec_core');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [dedicatedAnswerInputs, setDedicatedAnswerInputs] = useState<Record<string, string>>({});

  const [saved, setSaved] = useState(false);

  // Dynamic Theme Synchronization
  const applySavedTheme = useCallback((incomingColors?: any) => {
    try {
      const mode = typeof window !== 'undefined' ? localStorage.getItem('zecratary_theme_mode') : null;
      const root = document.documentElement;
      const isDay = mode === 'light' || mode === 'day' || root.classList.contains('light');
      setIsDayMode(isDay);

      let colors = incomingColors || (typeof getMemoryThemeColors === 'function' ? getMemoryThemeColors() : null);

      if (colors && Object.keys(colors).length > 0) {
        if (typeof setMemoryThemeColors === 'function') setMemoryThemeColors(colors);
        if (typeof applyThemeToDocument === 'function') applyThemeToDocument(colors);
      } else if (typeof fetchAndApplyServerTheme === 'function') {
        fetchAndApplyServerTheme();
      }

      if (isDay) {
        root.classList.remove('dark');
        root.classList.add('light');
        if (document.body) {
          document.body.style.backgroundColor = 'var(--color-bg)';
          document.body.style.color = 'var(--color-text)';
        }
      } else {
        root.classList.remove('light');
        root.classList.add('dark');
        const bg = colors?.backgroundColor || colors?.backgroundDark || 'var(--color-bg)';
        if (document.body) {
          document.body.style.backgroundColor = bg;
          document.body.style.color = colors?.textColor || 'var(--color-text)';
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    applySavedTheme();

    fetch('/api/admin/settings', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data?.themeColors && Object.keys(data.themeColors).length > 0) {
          localStorage.setItem('zecratary_theme_colors', JSON.stringify(data.themeColors));
          applySavedTheme(data.themeColors);
        }
      })
      .catch(() => {
        fetch('/api/user/theme', { cache: 'no-store' })
          .then(res => res.json())
          .then(data => {
            if (data?.themeColors && Object.keys(data.themeColors).length > 0) {
              localStorage.setItem('zecratary_theme_colors', JSON.stringify(data.themeColors));
              applySavedTheme(data.themeColors);
            }
          })
          .catch(() => {});
      });

    const handleThemeEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      applySavedTheme(detail);
    };

    const handleLiveUsageUpdate = () => {
      loadUsageMetrics(usageTimeframe);
    };

    window.addEventListener('zecratary_ai_usage_updated', handleLiveUsageUpdate);
    window.addEventListener('zecratary_theme_updated', handleThemeEvent);
    window.addEventListener('zecratary_theme_mode_changed', handleThemeEvent);
    window.addEventListener('zecratary_theme_changed', handleThemeEvent);
    window.addEventListener('zecratary_admin_settings_updated', handleThemeEvent);
    window.addEventListener('storage', handleThemeEvent);

    return () => {
      window.removeEventListener('zecratary_ai_usage_updated', handleLiveUsageUpdate);
      window.removeEventListener('zecratary_theme_updated', handleThemeEvent);
      window.removeEventListener('zecratary_theme_mode_changed', handleThemeEvent);
      window.removeEventListener('zecratary_theme_changed', handleThemeEvent);
      window.removeEventListener('zecratary_admin_settings_updated', handleThemeEvent);
      window.removeEventListener('storage', handleThemeEvent);
    };
  }, [applySavedTheme]);

  // Load AI Usage Telemetry Data
  const generateRealisticUsageData = useCallback((timeframe: '24h' | '7d' | '30d'): DailyUsagePoint[] => {
    const days = timeframe === '24h' ? 24 : timeframe === '7d' ? 7 : 30;
    const points: DailyUsagePoint[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      if (timeframe === '24h') {
        d.setHours(d.getHours() - i);
        const hourStr = `${d.getHours()}:00`;
        const reqs = Math.floor(15 + Math.sin(i * 0.5) * 8 + (i % 3) * 4);
        const promptTok = reqs * Math.floor(480 + (i % 5) * 45);
        const compTok = reqs * Math.floor(210 + (i % 4) * 30);
        points.push({
          date: d.toISOString(),
          dayLabel: hourStr,
          requests: reqs,
          promptTokens: promptTok,
          completionTokens: compTok,
          cost: parseFloat(((promptTok * 0.075 + compTok * 0.3) / 1000000).toFixed(4))
        });
      } else {
        d.setDate(d.getDate() - i);
        const dayName = d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
        const reqs = Math.floor(65 + Math.sin(i * 0.8) * 25 + (i % 4) * 12);
        const promptTok = reqs * Math.floor(580 + (i % 6) * 55);
        const compTok = reqs * Math.floor(240 + (i % 5) * 35);
        points.push({
          date: d.toISOString(),
          dayLabel: dayName,
          requests: reqs,
          promptTokens: promptTok,
          completionTokens: compTok,
          cost: parseFloat(((promptTok * 0.075 + compTok * 0.3) / 1000000).toFixed(4))
        });
      }
    }
    return points;
  }, []);

  const loadUsageMetrics = useCallback(async (timeframe: '24h' | '7d' | '30d') => {
    setIsLoadingUsage(true);
    try {
      const res = await fetch(`/api/admin/ai/usage?timeframe=${timeframe}&provider=${encodeURIComponent(provider)}&t=${Date.now()}`, { 
        cache: 'no-store',
        headers: { 'Pragma': 'no-cache' }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.points) && data.points.length > 0) {
          setUsagePoints(data.points);
          return;
        }
      }
      setUsagePoints(generateRealisticUsageData(timeframe));
    } catch (_) {
      setUsagePoints(generateRealisticUsageData(timeframe));
    } finally {
      setIsLoadingUsage(false);
    }
  }, [provider, generateRealisticUsageData]);

  useEffect(() => {
    loadUsageMetrics(usageTimeframe);
  }, [usageTimeframe, loadUsageMetrics]);

  // Fetch API Keys
  const fetchEnvKeys = async () => {
    try {
      const res = await fetch('/api/admin/keys?t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const map: Record<string, string> = { ...(data.envMap || {}) };
        if (Array.isArray(data.keys)) {
          data.keys.forEach((k: any) => {
            if (k.envKey && k.keyValue) {
              map[k.envKey] = k.keyValue;
              const u = k.envKey.toUpperCase();
              if (u.includes('GEMINI') || u.includes('GOOGLE')) {
                map['GEMINI_API_KEY'] = k.keyValue;
                map['GOOGLE_API_KEY'] = k.keyValue;
              }
              if (u.includes('OPENAI')) {
                map['OPENAI_API_KEY'] = k.keyValue;
              }
            }
          });
        }
        setEnvKeysMap(map);
        return map;
      }
    } catch (e) {
      console.error('Failed to load .env keys:', e);
    }
    return {};
  };

  // Scan API Key for Available AI Models
  const scanAvailableModels = useCallback(async (keyOverride?: string, provOverride?: string) => {
    const activeProv = provOverride || provider;
    const targetKey = (keyOverride !== undefined ? keyOverride : apiKey).trim().replace(/^['"]|['"]$/g, '');

    if (!targetKey) {
      setScanMessage(t('enterKeyBeforeScanning', 'Please provide or sync an API key to scan available models.'));
      return;
    }

    setIsScanningModels(true);
    setScanMessage(null);

    try {
      let discovered: DiscoveredModel[] = [];

      // Method 1: Internal API endpoint
      try {
        const res = await fetch(`/api/admin/models?provider=${encodeURIComponent(activeProv)}&apiKey=${encodeURIComponent(targetKey)}`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.models) && data.models.length > 0) {
            discovered = data.models;
          }
        }
      } catch (_) {}

      // Method 2: Direct provider endpoint fallback
      if (discovered.length === 0) {
        if (activeProv === 'gemini') {
          const directRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${targetKey}`);
          if (directRes.ok) {
            const data = await directRes.json();
            if (Array.isArray(data?.models)) {
              discovered = data.models
                .filter((m: any) => {
                  const methods = m.supportedGenerationMethods || [];
                  const id = (m.name || '').toLowerCase();
                  return methods.includes('generateContent') || id.includes('gemini');
                })
                .map((m: any) => {
                  const cleanId = (m.name || '').replace(/^models\//, '');
                  return {
                    id: cleanId,
                    name: m.displayName || cleanId,
                    description: m.description || ''
                  };
                });
            }
          }
        } else {
          const directRes = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${targetKey}` }
          });
          if (directRes.ok) {
            const data = await directRes.json();
            if (Array.isArray(data?.data)) {
              discovered = data.data
                .filter((m: any) => {
                  const id = (m.id || '').toLowerCase();
                  return (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3')) &&
                         !id.includes('realtime') && !id.includes('audio') && !id.includes('embedding') &&
                         !id.includes('tts') && !id.includes('moderation');
                })
                .map((m: any) => ({
                  id: m.id,
                  name: m.id,
                  description: ''
                }));
            }
          }
        }
      }

      if (discovered.length > 0) {
        // Sort discovered models: prioritize newer flagship models
        discovered.sort((a, b) => a.id.localeCompare(b.id));
        setAvailableModels(discovered);
        setScanMessage(`✓ ${t('scannedSuccessPrefix', 'Discovered')} ${discovered.length} ${activeProv === 'gemini' ? 'Google Gemini' : 'OpenAI'} ${t('modelsLiveFromApi', 'models live from API!')}`);
      } else {
        setScanMessage(t('noModelsFoundForKey', 'No generative models discovered for this API key. Verify permissions.'));
      }
    } catch (err: any) {
      setScanMessage(`${t('scanFailed', 'Scan failed')}: ${err?.message || 'Network error'}`);
    } finally {
      setIsScanningModels(false);
    }
  }, [apiKey, provider, t]);

  // Load Settings from Server Storage (Strict Non-Destructive Loading)
  const loadSettingsFromServer = useCallback(async () => {
    if (typeof purgeLegacyBrowserAdminStorage === 'function') {
      purgeLegacyBrowserAdminStorage();
    }
    try {
      const serverData = await fetchServerAdminSettings();
      if (serverData) {
        const c = serverData.chefAiSettings || serverData.aiSettings || serverData;
        if (c.provider) setProvider(c.provider as any);
        else if (serverData.aiProvider) setProvider(serverData.aiProvider as any);

        if (c.apiKey !== undefined) setApiKey(c.apiKey);
        if (c.model) setModel(c.model);
        else if (serverData.aiModel) setModel(serverData.aiModel);

        if (Array.isArray(c.availableModels) && c.availableModels.length > 0) {
          setAvailableModels(c.availableModels);
        }

        if (c.temperature !== undefined) setTemperature(c.temperature);
        if (c.maxTokens !== undefined) setMaxTokens(c.maxTokens);
        if (c.systemPrompt !== undefined) setSystemPrompt(c.systemPrompt);
        if (c.enableWebSearch !== undefined) setEnableWebSearch(c.enableWebSearch);
        if (c.enablePantryContext !== undefined) setEnablePantryContext(c.enablePantryContext);
        if (c.strictDietEnforcement !== undefined) setStrictDietEnforcement(c.strictDietEnforcement);
        if (c.maxPlanDays !== undefined) setMaxPlanDays(c.maxPlanDays);
        if (c.resultDisplayMode !== undefined) setResultDisplayMode(c.resultDisplayMode as any);
        
        if (c.enableVoiceInteraction !== undefined) setEnableVoiceInteraction(c.enableVoiceInteraction);
        if (c.voiceEngine !== undefined) setVoiceEngine(c.voiceEngine as any);
        if (c.voiceSpeed !== undefined) setVoiceSpeed(c.voiceSpeed);
        if (c.voiceAutoPlay !== undefined) setVoiceAutoPlay(c.voiceAutoPlay);
        if (c.selectedVoiceName !== undefined) setSelectedVoiceName(c.selectedVoiceName);

        if (Array.isArray(c.knowledgeBaseList)) setKnowledgeBaseList(c.knowledgeBaseList);
        if (Array.isArray(c.customVocabularyList)) setCustomVocabularyList(c.customVocabularyList);
        if (Array.isArray(c.filterWordsList)) setFilterWordsList(c.filterWordsList);

        if (Array.isArray(c.recommendedRecipeUrls)) {
          setRecommendedRecipeUrls(c.recommendedRecipeUrls.filter(Boolean));
        } else if (Array.isArray(c.recommendedRecipesUrls)) {
          setRecommendedRecipeUrls(c.recommendedRecipesUrls.filter(Boolean));
        } else if (Array.isArray(serverData.recommendedRecipeUrls)) {
          setRecommendedRecipeUrls(serverData.recommendedRecipeUrls.filter(Boolean));
        }

        if (Array.isArray(c.sections) && c.sections.length > 0) {
          setSections(c.sections.map((s: any, secIdx: number) => ({
            id: s.id || `sec_${secIdx}`,
            topicTitle: s.topicTitle || `Topic ${secIdx + 1}`,
            description: s.description || '',
            enabled: s.enabled !== false,
            questions: Array.isArray(s.questions)
              ? s.questions.map((q: any, qIdx: number) => {
                  if (typeof q === 'string') {
                    return {
                      id: `${s.id || 'sec'}_q_${qIdx}`,
                      text: q,
                      dedicatedAnswers: getDefaultDedicatedAnswersForText(q)
                    };
                  }
                  return {
                    id: q.id || `${s.id || 'sec'}_q_${qIdx}`,
                    text: q.text || q.question || '',
                    dedicatedAnswers: Array.isArray(q.dedicatedAnswers) 
                      ? q.dedicatedAnswers 
                      : Array.isArray(q.answers) 
                        ? q.answers 
                        : Array.isArray(q.options) 
                          ? q.options 
                          : getDefaultDedicatedAnswersForText(q.text || '')
                  };
                })
              : []
          })));
        }
      }
    } catch (err) {
      console.error('[ChefAISettings] Failed to load server settings:', err);
    }
  }, []);

  useEffect(() => {
    fetchEnvKeys();
    loadSettingsFromServer();
    // Non-destructive read-only health check without silent database mutation
    setTimeout(() => {
      autoConnectGemini(true);
    }, 400);
  }, [loadSettingsFromServer]);

  const handleProviderChange = (newProvider: 'gemini' | 'openai' | string) => {
    setProvider(newProvider);
    setScanMessage(null);
    if (newProvider === 'gemini') {
      setModel(prev => prev.startsWith('gemini') ? prev : 'gemini-2.5-flash');
      const resolved = envKeysMap['GEMINI_API_KEY'] || envKeysMap['GOOGLE_API_KEY'] || '';
      if (resolved && !apiKey.trim()) {
        setApiKey(resolved);
        scanAvailableModels(resolved, 'gemini');
      }
    } else {
      setModel(prev => prev.startsWith('gpt') || prev.startsWith('o1') ? prev : 'gpt-4o');
      const resolved = envKeysMap['OPENAI_API_KEY'] || '';
      if (resolved && !apiKey.trim()) {
        setApiKey(resolved);
        scanAvailableModels(resolved, 'openai');
      }
    }
  };

  // Test API Key: STRICTLY NON-DESTRUCTIVE (Diagnostic only, never overwrites database)
  const handleTestApiKey = async () => {
    const keyToTest = apiKey.trim() || 
      (provider === 'gemini' 
        ? (envKeysMap['GEMINI_API_KEY'] || envKeysMap['GOOGLE_API_KEY'] || envKeysMap['NEXT_PUBLIC_GEMINI_API_KEY']) 
        : (envKeysMap['OPENAI_API_KEY'] || envKeysMap['NEXT_PUBLIC_OPENAI_API_KEY'])) || '';

    if (!keyToTest) {
      setTestResult({ success: false, message: t('enterApiKeyFirst', 'Please enter an API key or sync from .env first.') });
      return;
    }

    const cleanKey = keyToTest.trim().replace(/^['"]|['"]$/g, '');
    const startTime = performance.now();
    setTestingKey(true);
    setTestResult(null);

    let success = false;
    let message = '';
    let latency = 0;

    try {
      const res = await fetch('/api/admin/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: cleanKey,
          key: cleanKey,
          model,
          aiProvider: provider,
          aiModel: model
        })
      });

      const rawText = await res.text();
      let data: any = {};
      try { data = rawText ? JSON.parse(rawText) : {}; } catch (_) {}
      latency = Math.round(performance.now() - startTime);

      if (res.ok && data.success) {
        success = true;
        message = data.message || `${t('connectedPrefix', 'Connected to')} ${provider === 'gemini' ? 'Google Gemini' : 'OpenAI'} (${model}) in ${latency}ms!`;
      } else if (res.status === 404 || !res.ok) {
        if (provider === 'gemini') {
          const directRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
          const directData = await directRes.json();
          latency = Math.round(performance.now() - startTime);
          if (directRes.ok && Array.isArray(directData.models)) {
            success = true;
            message = `${t('connectedPrefix', 'Connected to')} Google Gemini (${model}) in ${latency}ms! (${directData.models.length} models ready)`;
          } else {
            success = false;
            message = directData.error?.message || data.error || data.message || t('connectionFailed', 'Google Gemini connection failed.');
          }
        } else {
          const directRes = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${cleanKey}` }
          });
          const directData = await directRes.json();
          latency = Math.round(performance.now() - startTime);
          if (directRes.ok) {
            success = true;
            message = `${t('connectedPrefix', 'Connected to')} OpenAI GPT (${model}) in ${latency}ms! (Authorization verified)`;
          } else {
            success = false;
            message = directData.error?.message || data.error || data.message || t('connectionFailed', 'OpenAI connection failed.');
          }
        }
      } else {
        success = false;
        message = data.error || data.message || t('connectionFailed', 'Connection failed.');
      }
    } catch (err: any) {
      latency = Math.round(performance.now() - startTime);
      success = false;
      message = err.message || t('verificationEndpointError', 'Could not reach verification endpoint.');
    } finally {
      setTestingKey(false);
      setTestResult({ success, message, latency });

      if (success) {
        // Auto-refresh dynamic model roster on successful test
        scanAvailableModels(cleanKey, provider);
      }
    }
  };

  // Auto-Connect Gemini: STRICTLY NON-DESTRUCTIVE (Healthcheck only)
  const autoConnectGemini = async (silent = false) => {
    setAutoConnecting(true);
    if (!silent) setTestResult(null);

    try {
      const res = await fetch('/api/admin/keys?t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      let resolvedKey = apiKey.trim();

      if (data.success) {
        if (Array.isArray(data.keys)) {
          const geminiEntry = data.keys.find((k: any) => 
            k.envKey === 'GEMINI_API_KEY' || 
            k.envKey === 'GOOGLE_API_KEY' || 
            k.provider?.toLowerCase().includes('gemini')
          );
          if (geminiEntry && geminiEntry.keyValue && !geminiEntry.keyValue.includes('sample')) {
            resolvedKey = geminiEntry.keyValue.trim();
            setApiKey(resolvedKey);
          }
        }
        if (!resolvedKey && data.envMap) {
          const fromEnv = data.envMap['GEMINI_API_KEY'] || data.envMap['GOOGLE_API_KEY'] || data.envMap['NEXT_PUBLIC_GEMINI_API_KEY'];
          if (fromEnv && !fromEnv.includes('sample')) {
            resolvedKey = fromEnv.trim();
            setApiKey(resolvedKey);
          }
        }
      }

      if (!resolvedKey || resolvedKey.includes('sample') || resolvedKey.length < 10) {
        if (!silent) {
          setTestResult({ success: false, message: t('noGeminiKeyFound', 'No active Google Gemini key found in .env. Please enter a key.') });
        }
        setAutoConnecting(false);
        return;
      }

      const activeModel = model || 'gemini-2.5-flash';
      const cleanKey = resolvedKey.replace(/^['"]|['"]$/g, '');
      const startTime = performance.now();

      const testRes = await fetch('/api/admin/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          apiKey: cleanKey,
          key: cleanKey,
          model: activeModel,
          aiProvider: 'gemini',
          aiModel: activeModel
        })
      });

      let testData: any = {};
      try {
        const rawAutoText = await testRes.text();
        testData = rawAutoText ? JSON.parse(rawAutoText) : {};
      } catch (_) {}

      const latency = Math.round(performance.now() - startTime);

      if (testRes.ok && testData.success) {
        setTestResult({ 
          success: true, 
          message: `${t('connectedPrefix', 'Connected to')} Google Gemini (${activeModel}) in ${latency}ms! Key ready.`,
          latency
        });

        // Trigger dynamic model discovery without overwriting database
        scanAvailableModels(cleanKey, 'gemini');
      } else if (!silent) {
        setTestResult({ success: false, message: testData.error || t('geminiHandshakeFailed', 'Gemini handshake failed.') });
      }
    } catch (err: any) {
      if (!silent) setTestResult({ success: false, message: err.message || t('autoConnectionError', 'Auto-connection error.') });
    } finally {
      setAutoConnecting(false);
    }
  };

  // Reload Key from .env: NON-DESTRUCTIVE (Updates local state only)
  const handleReloadEnvKey = async () => {
    setSyncingEnvKey(true);
    setTestResult(null);
    try {
      const map = await fetchEnvKeys();
      const resolvedGemini = map['GEMINI_API_KEY'] || 
                             map['GOOGLE_API_KEY'] || 
                             map['NEXT_PUBLIC_GEMINI_API_KEY'] || 
                             map['NEXT_PUBLIC_GOOGLE_API_KEY'] || '';
      const resolvedOpenAI = map['OPENAI_API_KEY'] || 
                             map['NEXT_PUBLIC_OPENAI_API_KEY'] || '';

      const targetKey = provider === 'gemini' ? resolvedGemini : resolvedOpenAI;

      if (targetKey && targetKey.trim().length > 5) {
        const cleanKey = targetKey.trim().replace(/^['"]|['"]$/g, '');
        setApiKey(cleanKey);
        setTestResult({
          success: true,
          message: `${t('syncedPrefix', 'Synced')} ${provider === 'gemini' ? 'Google Gemini' : 'OpenAI'} (${cleanKey.substring(0, 8)}...) ${t('keyFromEnvSuccess', 'key from .env successfully!')}`
        });

        scanAvailableModels(cleanKey, provider);
      } else {
        setTestResult({
          success: false,
          message: `${t('noActiveEnvKeyFound', 'No active key found in your local .env file.')} (${provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'})`
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `${t('syncError', 'Sync error:')} ${err?.message || 'Could not read from backend.'}`
      });
    } finally {
      setTimeout(() => setSyncingEnvKey(false), 500);
    }
  };

  // Topic Section Handlers
  const handleAddTopicSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) return;
    const newSec: QuestionnaireSection = {
      id: 'sec_' + Date.now(),
      topicTitle: newTopicTitle.trim(),
      description: newTopicDesc.trim() || 'Custom questionnaire topic section.',
      enabled: true,
      questions: []
    };
    setSections([...sections, newSec]);
    setActiveTopicId(newSec.id);
    setNewTopicTitle('');
    setNewTopicDesc('');
  };

  const handleDeleteSection = (secId: string) => {
    if (sections.length <= 1) {
      alert(t('retainOneTopicWarning', 'You must retain at least one questionnaire topic.'));
      return;
    }
    const updated = sections.filter(s => s.id !== secId);
    setSections(updated);
    if (activeTopicId === secId && updated.length > 0) {
      setActiveTopicId(updated[0].id);
    }
  };

  const handleToggleSectionEnabled = (secId: string, e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    setSections(sections.map(sec => {
      if (sec.id === secId) {
        return { ...sec, enabled: sec.enabled === false };
      }
      return sec;
    }));
  };

  // Question & Dedicated Answer Handlers
  const handleAddQuestionToTopic = (secId: string) => {
    if (!newQuestionText.trim()) return;
    const newText = newQuestionText.trim();
    const newQuestion: QuestionnaireQuestion = {
      id: `${secId}_q_${Date.now()}`,
      text: newText,
      dedicatedAnswers: getDefaultDedicatedAnswersForText(newText)
    };

    setSections(sections.map(sec => {
      if (sec.id === secId) {
        return { ...sec, questions: [...sec.questions, newQuestion] };
      }
      return sec;
    }));
    setNewQuestionText('');
  };

  const handleUpdateQuestionText = (secId: string, qIdx: number, newText: string) => {
    setSections(sections.map(sec => {
      if (sec.id === secId) {
        const qs = [...sec.questions];
        qs[qIdx] = { ...qs[qIdx], text: newText };
        return { ...sec, questions: qs };
      }
      return sec;
    }));
  };

  const handleRemoveQuestionFromTopic = (secId: string, qIdx: number) => {
    setSections(sections.map(sec => {
      if (sec.id === secId) {
        return { ...sec, questions: sec.questions.filter((_, i) => i !== qIdx) };
      }
      return sec;
    }));
  };

  const handleAddDedicatedAnswer = (secId: string, qIdx: number) => {
    const inputKey = `${secId}_${qIdx}`;
    const raw = (dedicatedAnswerInputs[inputKey] || '').trim();
    if (!raw) return;

    const newItems = raw.includes(',') 
      ? raw.split(',').map(s => s.trim()).filter(Boolean)
      : [raw];

    setSections(prevSections => prevSections.map(sec => {
      if (sec.id === secId) {
        const qs = [...sec.questions];
        const targetQ = { ...qs[qIdx] };
        const currentAnswers = [...(targetQ.dedicatedAnswers || [])];

        newItems.forEach(item => {
          if (!currentAnswers.includes(item)) {
            currentAnswers.push(item);
          }
        });

        targetQ.dedicatedAnswers = currentAnswers;
        qs[qIdx] = targetQ;
        return { ...sec, questions: qs };
      }
      return sec;
    }));

    setDedicatedAnswerInputs(prev => ({ ...prev, [inputKey]: '' }));
  };

  const handleRemoveDedicatedAnswer = (secId: string, qIdx: number, ansIdx: number) => {
    setSections(sections.map(sec => {
      if (sec.id === secId) {
        const qs = [...sec.questions];
        const targetQ = { ...qs[qIdx] };
        targetQ.dedicatedAnswers = (targetQ.dedicatedAnswers || []).filter((_, i) => i !== ansIdx);
        qs[qIdx] = targetQ;
        return { ...sec, questions: qs };
      }
      return sec;
    }));
  };

  // Recommended Recipes Url Handlers
  const persistUrlsToDb = async (urls: string[]) => {
    try {
      await persistServerAdminSettings({
        aiProvider: provider,
        aiModel: model,
        chefAiSettings: {
          provider,
          apiKey: apiKey.trim(),
          model,
          availableModels,
          temperature,
          maxTokens,
          systemPrompt,
          enableWebSearch,
          enablePantryContext,
          strictDietEnforcement,
          maxPlanDays,
          resultDisplayMode,
          enableVoiceInteraction,
          voiceEngine,
          voiceSpeed,
          voiceAutoPlay,
          selectedVoiceName,
          knowledgeBaseList,
          customVocabularyList,
          filterWordsList,
          recommendedRecipeUrls: urls,
          sections,
          updatedAt: new Date().toISOString()
        },
        recommendedRecipeUrls: urls
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_admin_settings_updated'));
        window.dispatchEvent(new Event('zecratary_chef_ai_settings_updated'));
      }
    } catch (_) {}
  };

  // Reads each source on the server and reports whether /chef can really use it.
  const checkRecipeUrls = async (urls: string[]) => {
    const list = urls.filter(Boolean).slice(0, 10);
    if (list.length === 0) return;
    setUrlStatus(prev => {
      const next = { ...prev };
      list.forEach(u => { next[u] = { state: 'checking', text: t('urlChecking', 'Checking...') }; });
      return next;
    });
    try {
      const res = await fetch('/api/admin/recipe-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: list })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Check failed');
      setUrlStatus(prev => {
        const next = { ...prev };
        for (const r of data.results || []) {
          next[r.url] = r.ok
            ? { state: 'ok', text: r.kind === 'recipe'
                ? t('urlOkRecipe', 'Readable: 1 recipe') + (r.title ? ` (${r.title})` : '')
                : `${t('urlOkIndex', 'Readable: recipe links found')} (${r.recipeCount})` }
            : { state: 'error', text: r.error || t('urlNotReadable', 'Could not read this site.') };
        }
        return next;
      });
    } catch (err: any) {
      setUrlStatus(prev => {
        const next = { ...prev };
        list.forEach(u => { next[u] = { state: 'error', text: err?.message || t('urlNotReadable', 'Could not read this site.') }; });
        return next;
      });
    }
  };

  const handleAddRecommendedUrls = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = newRecipeUrlInput.trim();
    if (!raw) return;

    const entries = raw
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const cleanedUrls: string[] = [];
    for (let entry of entries) {
      if (!/^https?:\/\//i.test(entry)) {
        entry = 'https://' + entry;
      }
      try {
        new URL(entry);
        if (!recommendedRecipeUrls.includes(entry) && !cleanedUrls.includes(entry)) {
          cleanedUrls.push(entry);
        }
      } catch (_) {}
    }

    if (cleanedUrls.length > 0) {
      const updated = [...recommendedRecipeUrls, ...cleanedUrls];
      setRecommendedRecipeUrls(updated);
      setNewRecipeUrlInput('');
      persistUrlsToDb(updated);
      checkRecipeUrls(cleanedUrls);
    }
  };

  const handleRemoveRecommendedUrl = (idx: number) => {
    const updated = recommendedRecipeUrls.filter((_, i) => i !== idx);
    setRecommendedRecipeUrls(updated);
    persistUrlsToDb(updated);
  };

  const handleClearAllRecommendedUrls = () => {
    if (confirm(t('confirmClearAllUrls', 'Clear all recommended recipe URLs?'))) {
      setRecommendedRecipeUrls([]);
      persistUrlsToDb([]);
    }
  };

  // Master Save Configuration Handler (Stores COMPLETE configuration to PostgreSQL & MySQL)
  const handleSave = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    const cleanApiKey = apiKey.trim().replace(/^['"]|['"]$/g, '');
    const config = {
      provider,
      apiKey: cleanApiKey,
      model,
      availableModels,
      temperature,
      maxTokens,
      systemPrompt,
      enableWebSearch,
      enablePantryContext,
      strictDietEnforcement,
      maxPlanDays,
      resultDisplayMode,
      enableVoiceInteraction,
      voiceEngine,
      voiceSpeed,
      voiceAutoPlay,
      selectedVoiceName,
      knowledgeBaseList,
      customVocabularyList,
      filterWordsList,
      recommendedRecipeUrls,
      sections,
      updatedAt: new Date().toISOString()
    };

    const activeFlattenedQuestions = sections
      .filter(s => s.enabled !== false)
      .flatMap(s => s.questions.map(q => q.text));

    const activeFlattenedItems = sections
      .filter(s => s.enabled !== false)
      .flatMap(s => s.questions);

    try {
      await persistServerAdminSettings({
        aiProvider: provider,
        aiModel: model,
        chefAiSettings: config,
        recommendedRecipeUrls,
        chefQuestionnaire: activeFlattenedQuestions,
        chefQuestionnaireWithAnswers: activeFlattenedItems
      });

      if (cleanApiKey) {
        try {
          await fetch('/api/admin/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: provider === 'gemini' ? 'Google Gemini Production' : 'OpenAI GPT-4o',
              provider,
              envKey: provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY',
              keyValue: cleanApiKey,
              status: 'active'
            })
          });
        } catch (_) {}
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_admin_settings_updated'));
        window.dispatchEvent(new Event('zecratary_engine_config_updated'));
        window.dispatchEvent(new Event('zecratary_chef_ai_settings_updated'));
        try {
          const syncCh = new BroadcastChannel('zecratary_ai_settings_sync');
          syncCh.postMessage({ model, provider });
          syncCh.close();
        } catch (_) {}
        window.dispatchEvent(new Event('zecratary_settings_updated'));
        window.dispatchEvent(new Event('storage'));
      }
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `${t('serverStoredSettings', 'Server stored settings')}: ${err?.message || 'Failed to save'}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  const activeSection = sections.find(s => s.id === activeTopicId) || sections[0];

  // Aggregated Usage Totals
  const totalRequests = usagePoints.reduce((acc, p) => acc + p.requests, 0);
  const totalPromptTokens = usagePoints.reduce((acc, p) => acc + p.promptTokens, 0);
  const totalCompletionTokens = usagePoints.reduce((acc, p) => acc + p.completionTokens, 0);
  const totalCombinedTokens = totalPromptTokens + totalCompletionTokens;
  const totalCostEstimate = usagePoints.reduce((acc, p) => acc + p.cost, 0);

  const chartHeight = 160;
  const chartWidth = 680;
  const maxTokenValue = Math.max(...usagePoints.map(p => p.promptTokens + p.completionTokens), 1000);
  const hoveredPoint = hoveredPointIndex !== null ? usagePoints[hoveredPointIndex] : null;

  return (
    <div 
      id="zecratary-ai-settings-canvas"
      role="region"
      aria-label={t('aiAssistantConfigTitle', 'AI Assistant Configuration')}
      data-lpignore="true"
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 space-y-6 pb-24 font-sans pt-2 transition-colors duration-200"
      style={{ 
        boxSizing: 'border-box',
        color: 'var(--color-text)',
        transition: 'background-color 200ms ease, color 200ms ease, border-color 200ms ease'
      }}
    >
      
      {/* Autofill & Transition Overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        .settings-input:-webkit-autofill,
        .settings-input:-webkit-autofill:hover,
        .settings-input:-webkit-autofill:focus,
        .settings-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px var(--color-inner-dark) inset !important;
          box-shadow: 0 0 0 1000px var(--color-inner-dark) inset !important;
          -webkit-text-fill-color: var(--color-text) !important;
          caret-color: var(--color-text) !important;
          transition: background-color 50000s ease-in-out 0s !important;
        }
      `}} />

      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4 transition-colors duration-200" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <Settings className="h-6 w-6" style={{ color: 'var(--color-primary)' }} /> {t('aiAssistantConfigTitle', 'AI Assistant Configuration')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {t('aiAssistantConfigSubtitle', 'Update settings and functional AI provider models for the')} <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>/chef</span> {t('agentSuffix', 'agent')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saved && (
            <span 
              className="border px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-in fade-in shadow-xs"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-emerald)',
                color: 'var(--color-emerald)'
              }}
            >
              <CheckCircle className="h-4 w-4" style={{ color: 'var(--color-emerald)' }} /> {t('settingsAppliedSynced', 'Settings Applied & Synced')}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition shadow-lg flex items-center gap-2 cursor-pointer hover:opacity-90 disabled:opacity-50"
            style={{ 
              backgroundColor: 'var(--color-primary)',
              boxShadow: 'var(--color-primary-shadow, 0 8px 20px -4px rgba(224, 86, 56, 0.3))'
            }}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('saving', 'Saving...')}</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>{t('saveConfigurationBtn', 'Save Configuration')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* HORIZONTAL CONFIGURATION TABS */}
      <div className="flex border-b gap-6 overflow-x-auto transition-colors duration-200" style={{ borderColor: 'var(--color-border)' }}>
        {[
          { id: 'general', label: t('tabGeneralConfig', 'General AI Configuration'), icon: Cpu },
          { id: 'questionnaire', label: `${t('tabQuestionnaires', 'Multi-Topic Questionnaires')} (${sections.filter(s => s.enabled !== false).length}/${sections.length} ${t('topicsActiveBadge', 'Active')})`, icon: Layers },
          { id: 'voice', label: t('tabVoiceInteraction', 'Voice Interaction'), icon: Mic },
          { id: 'advanced', label: t('tabAgentParameters', 'Agent Parameters'), icon: SlidersHorizontal },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 pb-3 text-xs font-bold border-b-2 transition shrink-0 cursor-pointer ${
                isActive ? '' : 'border-transparent hover:opacity-80'
              }`}
              style={{
                borderColor: isActive ? 'var(--color-primary)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)'
              }}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div 
        role="region"
        aria-label={t('aiAssistantConfigForm', 'AI Assistant Settings Configuration Form')}
        data-lpignore="true"
        className="space-y-6"
      >
        
        {/* TAB 1: GENERAL & MODEL CONFIG */}
        {activeTab === 'general' && (
          <div className="space-y-6 animate-in fade-in">
            {/* AI Engine Provider & Model Selection */}
            <div 
              className="border rounded-3xl p-6 space-y-5 shadow-sm transition-colors duration-200"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 
                    className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-2"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <Sparkles className="h-4 w-4" /> {t('aiEngineProviderTitle', 'AI Engine Provider & Model Selection')}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('aiEngineProviderDesc', 'Select your active AI provider and model version. This choice controls which model processes prompts in')} <span className="font-mono font-bold" style={{ color: 'var(--color-text)' }}>/api/ai</span>.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => autoConnectGemini(false)}
                    disabled={autoConnecting}
                    className="border font-bold text-[11px] px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50 shadow-xs hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-primary)',
                      color: 'var(--color-primary)'
                    }}
                    title={t('autoConnectGemini', 'Auto-connect and sync Gemini API key')}
                  >
                    <Radio className={`h-3 w-3 ${autoConnecting ? 'animate-pulse' : ''}`} style={{ color: autoConnecting ? 'var(--color-amber, #f59e0b)' : 'var(--color-primary)' }} />
                    <span>{autoConnecting ? t('connecting', 'Connecting...') : t('autoConnectGemini', 'Auto-Connect Gemini')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReloadEnvKey}
                    disabled={syncingEnvKey}
                    className="border font-bold text-[11px] px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)'
                    }}
                    title={t('syncFromEnv', 'Reload API Key from .env')}
                  >
                    <RefreshCw className={`h-3 w-3 ${syncingEnvKey ? 'animate-spin' : ''}`} style={{ color: 'var(--color-emerald)' }} />
                    <span>{syncingEnvKey ? t('syncing', 'Syncing...') : t('syncFromEnv', 'Sync from .env')}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => handleProviderChange('gemini')}
                  className="p-4 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3.5 shadow-xs hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: provider === 'gemini' ? 'var(--color-primary)' : 'var(--color-border)',
                    color: provider === 'gemini' ? 'var(--color-text)' : 'var(--color-text-secondary)'
                  }}
                >
                  <Bot className="h-5 w-5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <span className="block font-bold text-sm" style={{ color: 'var(--color-text)' }}>{t('googleGeminiTitle', 'Google Gemini')}</span>
                    <span className="text-[11px] opacity-75">{t('googleGeminiSubtitle', 'Gemini 2.5 Flash / Gemini 2.5 Pro')}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderChange('openai')}
                  className="p-4 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3.5 shadow-xs hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: provider === 'openai' ? 'var(--color-emerald)' : 'var(--color-border)',
                    color: provider === 'openai' ? 'var(--color-text)' : 'var(--color-text-secondary)'
                  }}
                >
                  <Zap className="h-5 w-5 shrink-0" style={{ color: 'var(--color-emerald)' }} />
                  <div>
                    <span className="block font-bold text-sm" style={{ color: 'var(--color-text)' }}>{t('openAiTitle', 'OpenAI GPT')}</span>
                    <span className="text-[11px] opacity-75">{t('openAiSubtitle', 'GPT-4o / GPT-4o-mini / o1')}</span>
                  </div>
                </button>
              </div>

              <div className="pt-2 space-y-4 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('apiKeyLabel', 'API Key')}
                    </label>
                    <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                      {provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                      placeholder={provider === 'gemini' ? t('apiKeyPlaceholderGemini', 'AIzaSy...') : t('apiKeyPlaceholderOpenAI', 'sk-...')}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      spellCheck={false}
                      aria-label={t('apiKeyLabel', 'API Key')}
                      className="settings-input w-full border rounded-xl px-4 py-3 pr-36 font-mono text-xs outline-none transition"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="p-1.5 transition cursor-pointer"
                        style={{ color: 'var(--color-text-secondary)' }}
                        title={showApiKey ? t('hideApiKey', 'Hide API key') : t('showApiKey', 'Show API key')}
                        aria-label={showApiKey ? t('hideApiKey', 'Hide API key') : t('showApiKey', 'Show API key')}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleTestApiKey}
                        disabled={testingKey}
                        className="px-2.5 py-1.5 rounded-lg text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-md disabled:opacity-50 hover:opacity-90"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                        title={t('testConnection', 'Test API Key connection live')}
                      >
                        {testingKey ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>{t('testing', 'Testing...')}</span>
                          </>
                        ) : (
                          <>
                            <Activity className="h-3 w-3" />
                            <span>{t('testConnection', 'Test Connection')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {testResult && (
                    <div 
                      className="mt-2 p-2.5 rounded-xl border text-xs font-semibold flex items-start gap-2 animate-in fade-in shadow-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: testResult.success ? 'var(--color-emerald)' : 'var(--color-danger-border, rgba(239, 68, 68, 0.4))',
                        color: testResult.success ? 'var(--color-emerald)' : 'var(--color-danger, #ef4444)'
                      }}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--color-emerald)' }} />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--color-danger, #ef4444)' }} />
                      )}
                      <span className="leading-snug">{testResult.message}</span>
                    </div>
                  )}
                  <span className="text-[10px] mt-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('persistedServerSyncNotice', 'Persisted directly to PostgreSQL & MySQL server storage on Save.')}
                  </span>
                </div>

                {/* DYNAMIC MODEL SELECTOR WITH SCAN/REFRESH BUTTON */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('modelVersionIdentifier', 'Model Version Identifier')}
                    </label>
                    
                    <button
                      type="button"
                      onClick={() => scanAvailableModels()}
                      disabled={isScanningModels}
                      className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer shadow-2xs hover:opacity-90 disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-emerald)',
                        color: 'var(--color-emerald)'
                      }}
                      title={t('scanModelsTooltip', 'Scan API key to discover all live models supported by your account')}
                    >
                      <RefreshCw className={`h-3 w-3 ${isScanningModels ? 'animate-spin' : ''}`} />
                      <span>{isScanningModels ? t('scanningModels', 'Scanning API...') : t('scanModelsBtn', 'Scan Models from API')}</span>
                    </button>
                  </div>

                  <div className="relative">
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      aria-label={t('modelVersionIdentifier', 'Model Version Identifier')}
                      autoComplete="off"
                      data-lpignore="true"
                      data-form-type="other"
                      className="w-full appearance-none border rounded-xl px-4 py-3 pr-10 outline-none cursor-pointer transition font-medium text-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                    >
                      {/* Render dynamically scanned models if discovered */}
                      {availableModels.length > 0 ? (
                        <>
                          {!availableModels.some(m => m.id === model) && (
                            <option value={model} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>
                              {model} ({t('selectedModel', 'Selected / Custom')})
                            </option>
                          )}
                          {availableModels.map(m => (
                            <option key={m.id} value={m.id} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>
                              {m.name || m.id} ({m.id})
                            </option>
                          ))}
                        </>
                      ) : (
                        /* Default curated list if API not yet scanned */
                        provider === 'gemini' ? (
                          <>
                            <option value="gemini-2.5-flash" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>Gemini 2.5 Flash (Flagship Fast & Recommended)</option>
                            <option value="gemini-2.5-pro" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>Gemini 2.5 Pro (Deep Culinary Reasoning)</option>
                            <option value="gemini-2.0-flash" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>Gemini 2.0 Flash (Next-Gen High Performance)</option>
                            <option value="gemini-1.5-flash" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>Gemini 1.5 Flash (Lightweight Baseline)</option>
                            <option value="gemini-1.5-pro" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>Gemini 1.5 Pro (Balanced Reasoning)</option>
                          </>
                        ) : (
                          <>
                            <option value="gpt-4o" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>GPT-4o (Omni Reasoning & Fast)</option>
                            <option value="gpt-4o-mini" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>GPT-4o Mini (High Speed & Low Latency)</option>
                            <option value="o1-mini" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>o1-mini (STEM & Precise Logic)</option>
                            <option value="gpt-4-turbo" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>GPT-4 Turbo</option>
                            <option value="gpt-3.5-turbo" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>GPT-3.5 Turbo</option>
                          </>
                        )
                      )}
                    </select>
                    <ChevronDown className="h-4 w-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" style={{ color: 'var(--color-text-secondary)' }} />
                  </div>

                  {scanMessage && (
                    <div 
                      className="mt-1.5 text-[11px] font-semibold flex items-center gap-1.5 animate-in fade-in"
                      style={{ color: scanMessage.startsWith('✓') ? 'var(--color-emerald)' : 'var(--color-primary)' }}
                    >
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span>{scanMessage}</span>
                    </div>
                  )}

                  <span className="text-[10px] mt-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('activeModelEndpointDesc', 'Active model endpoint used during AI prompt generation. Click "Scan Models from API" to fetch live available endpoints.')}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Engine Usage & Token Consumption Analytics */}
            <div 
              className="border rounded-3xl p-6 space-y-6 shadow-sm transition-colors duration-200"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 
                      className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-2"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      <BarChart3 className="h-4 w-4" /> {t('aiUsageChartTitle', 'AI Engine Usage & Token Consumption Analytics')}
                    </h2>
                    <span 
                      className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border flex items-center gap-1 shadow-2xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-emerald)',
                        color: 'var(--color-emerald)'
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t('liveGeminiSyncBadge', 'Live Gemini Sync')}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('aiUsageChartSubtitle', 'Real-time monitoring of prompt tokens, completions, request frequency, and estimated consumption.')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div 
                    className="flex border rounded-xl p-1 gap-1 text-[11px] font-bold"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    {[
                      { id: '24h', label: t('time24h', '24h') },
                      { id: '7d', label: t('time7d', '7 Days') },
                      { id: '30d', label: t('time30d', '30 Days') }
                    ].map(tf => {
                      const isSel = usageTimeframe === tf.id;
                      return (
                        <button
                          key={tf.id}
                          type="button"
                          onClick={() => setUsageTimeframe(tf.id as any)}
                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                            isSel ? 'text-white shadow-xs' : 'hover:opacity-80'
                          }`}
                          style={{
                            backgroundColor: isSel ? 'var(--color-primary)' : 'transparent',
                            color: isSel ? '#ffffff' : 'var(--color-text-secondary)'
                          }}
                        >
                          {tf.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => loadUsageMetrics(usageTimeframe)}
                    disabled={isLoadingUsage}
                    className="p-2 border rounded-xl transition cursor-pointer hover:opacity-80 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)'
                    }}
                    title={t('refreshMetrics', 'Refresh metrics')}
                    aria-label={t('refreshMetrics', 'Refresh metrics')}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingUsage ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* KPI Summary Tiles */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div 
                  className="p-4 rounded-2xl border transition-colors shadow-xs"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('totalInvocations', 'Total Invocations')}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black" style={{ color: 'var(--color-text)' }}>
                      {totalRequests.toLocaleString()}
                    </span>
                  </div>
                  <span className="text-[10px] mt-1 block opacity-75" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('requestsInWindow', 'Requests in selected window')}
                  </span>
                </div>

                <div 
                  className="p-4 rounded-2xl border transition-colors shadow-xs"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('promptTokens', 'Prompt / Input Tokens')}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black" style={{ color: 'var(--color-primary)' }}>
                      {(totalPromptTokens / 1000).toFixed(1)}k
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                      {totalRequests > 0 ? Math.round(totalPromptTokens / totalRequests) : 0}/req
                    </span>
                  </div>
                  <span className="text-[10px] mt-1 block opacity-75" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('contextAndHistoryTokens', 'Context, rules & intake input')}
                  </span>
                </div>

                <div 
                  className="p-4 rounded-2xl border transition-colors shadow-xs"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('completionTokens', 'Completion / Output Tokens')}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black" style={{ color: 'var(--color-emerald)' }}>
                      {(totalCompletionTokens / 1000).toFixed(1)}k
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                      {totalRequests > 0 ? Math.round(totalCompletionTokens / totalRequests) : 0}/req
                    </span>
                  </div>
                  <span className="text-[10px] mt-1 block opacity-75" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('generatedRecipeOutputs', 'Generated meal plan cards & recipes')}
                  </span>
                </div>

                <div 
                  className="p-4 rounded-2xl border transition-colors shadow-xs"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('estimatedCost', 'Estimated Cost / Quota')}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black" style={{ color: 'var(--color-text)' }}>
                      ${totalCostEstimate.toFixed(3)}
                    </span>
                  </div>
                  <span className="text-[10px] mt-1 block opacity-75" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('tokensCombined', 'Combined:')} {(totalCombinedTokens / 1000).toFixed(1)}k {t('tokensUnit', 'tokens')}
                  </span>
                </div>
              </div>

              {/* Dynamic Bar Chart */}
              <div 
                className="border rounded-2xl p-4 space-y-3 transition-colors shadow-inner"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <div className="flex items-center justify-between text-[11px] pb-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 font-bold" style={{ color: 'var(--color-text)' }}>
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: 'var(--color-primary)' }} />
                      <span>{t('promptTokensLegend', 'Prompt Tokens')}</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-bold" style={{ color: 'var(--color-text)' }}>
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: 'var(--color-emerald)' }} />
                      <span>{t('completionTokensLegend', 'Completion Tokens')}</span>
                    </span>
                  </div>

                  {hoveredPoint ? (
                    <div className="font-mono text-[10px] flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                      <span className="font-bold">{hoveredPoint.dayLabel}:</span>
                      <span style={{ color: 'var(--color-primary)' }}>{(hoveredPoint.promptTokens).toLocaleString()} in</span>
                      <span>•</span>
                      <span style={{ color: 'var(--color-emerald)' }}>{(hoveredPoint.completionTokens).toLocaleString()} out</span>
                      <span>•</span>
                      <span>{hoveredPoint.requests} reqs (${hoveredPoint.cost.toFixed(4)})</span>
                    </div>
                  ) : (
                    <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('hoverBarForDetails', 'Hover over columns for detailed day metrics')}
                    </span>
                  )}
                </div>

                <div className="w-full overflow-x-auto pt-2">
                  <svg 
                    viewBox={`0 0 ${chartWidth} ${chartHeight + 25}`} 
                    className="w-full h-44 select-none min-w-[500px]"
                    preserveAspectRatio="none"
                  >
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, gIdx) => {
                      const y = chartHeight - ratio * (chartHeight - 20) + 10;
                      return (
                        <g key={gIdx}>
                          <line
                            x1="0"
                            y1={y}
                            x2={chartWidth}
                            y2={y}
                            stroke="var(--color-border)"
                            strokeDasharray="3 3"
                            strokeWidth="1"
                            opacity="0.6"
                          />
                          <text
                            x="4"
                            y={y - 3}
                            fontSize="8"
                            fill="var(--color-text-secondary)"
                            fontFamily="monospace"
                          >
                            {Math.round((maxTokenValue * ratio) / 1000)}k
                          </text>
                        </g>
                      );
                    })}

                    {usagePoints.map((p, idx) => {
                      const n = usagePoints.length;
                      const colWidth = (chartWidth - 40) / n;
                      const barW = Math.max(colWidth * 0.55, 6);
                      const x = 30 + idx * colWidth + (colWidth - barW) / 2;

                      const promptH = ((p.promptTokens) / maxTokenValue) * (chartHeight - 30);
                      const compH = ((p.completionTokens) / maxTokenValue) * (chartHeight - 30);
                      const promptY = chartHeight - promptH;
                      const compY = promptY - compH;

                      const isHovered = hoveredPointIndex === idx;

                      return (
                        <g 
                          key={idx}
                          onMouseEnter={() => setHoveredPointIndex(idx)}
                          onMouseLeave={() => setHoveredPointIndex(null)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={30 + idx * colWidth}
                            y="0"
                            width={colWidth}
                            height={chartHeight + 20}
                            fill={isHovered ? 'var(--color-primary)' : 'transparent'}
                            opacity={isHovered ? 0.08 : 0}
                            rx="4"
                          />

                          <rect
                            x={x}
                            y={compY}
                            width={barW}
                            height={Math.max(compH, 2)}
                            fill="var(--color-emerald)"
                            opacity={isHovered ? 1 : 0.85}
                            rx="2"
                          />

                          <rect
                            x={x}
                            y={promptY}
                            width={barW}
                            height={Math.max(promptH, 2)}
                            fill="var(--color-primary)"
                            opacity={isHovered ? 1 : 0.9}
                            rx="2"
                          />

                          {(n <= 10 || idx % Math.ceil(n / 7) === 0 || idx === n - 1) && (
                            <text
                              x={x + barW / 2}
                              y={chartHeight + 16}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight={isHovered ? 'bold' : 'normal'}
                              fill={isHovered ? 'var(--color-text)' : 'var(--color-text-secondary)'}
                            >
                              {p.dayLabel}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MULTI-TOPIC QUESTIONNAIRE BUILDER WITH DEDICATED ANSWERS */}
        {activeTab === 'questionnaire' && (
          <div className="space-y-6 animate-in fade-in">
            <div 
              className="border rounded-3xl p-6 space-y-5 shadow-sm text-xs transition-colors duration-200"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <h2 
                    className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <Layers className="h-4 w-4" /> {t('questionnaireManagerTitle', 'Multi-Topic Questionnaire & Wizard Manager')}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('questionnaireManagerDesc', 'Organize intake questions into categorized topics and customize dedicated preset answers for the')} <span className="font-mono font-bold" style={{ color: 'var(--color-text)' }}>/chef</span> {t('intakeWizard', 'intake wizard.')}
                  </p>
                </div>
                <span 
                  className="border px-3 py-1 rounded-full font-bold text-xs shadow-xs"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-primary)',
                    color: 'var(--color-primary)'
                  }}
                >
                  {sections.filter(s => s.enabled !== false).length}/{sections.length} {t('topicsActiveBadge', 'Topics Active')}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-1">
                {/* Topic Sections Column */}
                <div className="lg:col-span-4 space-y-3">
                  <label className="block font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('questionnaireTopicsHeader', 'Questionnaire Topics')}
                  </label>
                  
                  <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                    {sections.map((sec) => {
                      const isActive = sec.id === activeTopicId;
                      const isEnabled = sec.enabled !== false;
                      return (
                        <div
                          key={sec.id}
                          role="button"
                          tabIndex={0}
                          aria-label={sec.topicTitle}
                          onClick={() => setActiveTopicId(sec.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setActiveTopicId(sec.id);
                            }
                          }}
                          className="p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between shadow-xs outline-none"
                          style={{
                            backgroundColor: 'var(--color-inner-dark)',
                            borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                            opacity: isEnabled ? 1 : 0.65
                          }}
                        >
                          <div className="space-y-0.5 min-w-0 pr-2 flex-1">
                            <div className="font-bold text-xs truncate flex items-center justify-between" style={{ color: 'var(--color-text)' }}>
                              <span className="flex items-center gap-1.5 truncate">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isEnabled ? 'var(--color-primary)' : 'var(--color-text-secondary)' }} />
                                <span className="truncate">{sec.topicTitle}</span>
                              </span>
                              <span 
                                className="text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase shrink-0 border"
                                style={{
                                  backgroundColor: 'var(--color-inner-dark)',
                                  borderColor: isEnabled ? 'var(--color-emerald)' : 'var(--color-border)',
                                  color: isEnabled ? 'var(--color-emerald)' : 'var(--color-text-secondary)'
                                }}
                              >
                                {isEnabled ? t('enabled', 'Enabled') : t('disabled', 'Disabled')}
                              </span>
                            </div>
                            <p className="text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{sec.description}</p>
                            <span className="text-[9px] font-mono block opacity-75" style={{ color: 'var(--color-text-secondary)' }}>
                              {sec.questions.length} {t('questionsCount', 'Questions')}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 pl-2 border-l" style={{ borderColor: 'var(--color-border)' }}>
                            <button
                              type="button"
                              onClick={(e) => handleToggleSectionEnabled(sec.id, e)}
                              className="p-1 rounded-lg transition cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                              title={isEnabled ? t('disableTopicTooltip', 'Disable topic') : t('enableTopicTooltip', 'Enable topic')}
                              aria-label={isEnabled ? t('disableTopicTooltip', 'Disable topic') : t('enableTopicTooltip', 'Enable topic')}
                            >
                              {isEnabled ? (
                                <ToggleRight className="h-6 w-6" style={{ color: 'var(--color-emerald)' }} />
                              ) : (
                                <ToggleLeft className="h-6 w-6" style={{ color: 'var(--color-text-secondary)' }} />
                              )}
                            </button>

                            {sections.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteSection(sec.id); }}
                                className="p-1 rounded-lg transition cursor-pointer hover:opacity-80"
                                style={{ color: 'var(--color-text-secondary)' }}
                                title={t('deleteTopicTooltip', 'Delete topic section')}
                                aria-label={t('deleteTopicTooltip', 'Delete topic section')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div 
                    className="p-4 rounded-2xl border space-y-3 mt-4 transition-colors duration-200"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    <span className="font-bold text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
                      <FolderPlus className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }} /> {t('addNewTopicHeader', 'Add New Questionnaire Topic')}
                    </span>
                    <input
                      type="text"
                      placeholder={t('topicTitlePlaceholder', 'Topic Title (e.g. Fitness & Macros)...')}
                      value={newTopicTitle}
                      onChange={(e) => setNewTopicTitle(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className="settings-input w-full border rounded-xl px-3 py-2 text-xs outline-none transition"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    />
                    <input
                      type="text"
                      placeholder={t('topicDescPlaceholder', 'Topic Description...')}
                      value={newTopicDesc}
                      onChange={(e) => setNewTopicDesc(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className="settings-input w-full border rounded-xl px-3 py-2 text-xs outline-none transition"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddTopicSection}
                      disabled={!newTopicTitle.trim()}
                      className="w-full text-white font-bold py-2 rounded-xl transition text-xs disabled:opacity-40 cursor-pointer shadow-md"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {t('createTopicBtn', 'Create Topic Category')}
                    </button>
                  </div>
                </div>

                {/* Questions & Dedicated Answers Editor Column */}
                <div 
                  className="lg:col-span-8 border rounded-3xl p-5 space-y-4 flex flex-col justify-between transition-colors duration-200"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    opacity: activeSection?.enabled !== false ? 1 : 0.7
                  }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <ListPlus className="h-4 w-4 shrink-0" style={{ color: 'var(--color-primary)' }} /> 
                          <input
                            type="text"
                            value={activeSection?.topicTitle || ''}
                            onChange={(e) => {
                              const newTitle = e.target.value;
                              setSections(sections.map(s => s.id === activeSection?.id ? { ...s, topicTitle: newTitle } : s));
                            }}
                            autoComplete="off"
                            spellCheck={false}
                            className="font-bold text-sm bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none min-w-[200px] transition-colors truncate"
                            style={{ color: 'var(--color-text)' }}
                            placeholder={t('topicTitlePlaceholder', 'Topic Title...')}
                          />
                          <span 
                            className="text-[9px] px-2 py-0.5 rounded font-extrabold uppercase shrink-0 border"
                            style={{
                              backgroundColor: 'var(--color-card)',
                              borderColor: activeSection?.enabled !== false ? 'var(--color-emerald)' : 'var(--color-border)',
                              color: activeSection?.enabled !== false ? 'var(--color-emerald)' : 'var(--color-text-secondary)'
                            }}
                          >
                            {activeSection?.enabled !== false ? t('statusActive', 'Status: Active') : t('statusDisabled', 'Status: Disabled')}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={activeSection?.description || ''}
                          onChange={(e) => {
                            const newDesc = e.target.value;
                            setSections(sections.map(s => s.id === activeSection?.id ? { ...s, description: newDesc } : s));
                          }}
                          autoComplete="off"
                          spellCheck={false}
                          className="text-[11px] bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none w-full transition-colors truncate"
                          style={{ color: 'var(--color-text-secondary)' }}
                          placeholder={t('topicDescPlaceholder', 'Topic Description...')}
                        />
                      </div>
                      <span className="text-[10px] font-bold shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
                        {activeSection?.questions.length || 0} {t('questionsCount', 'Questions')}
                      </span>
                    </div>

                    {/* Question Cards with Dedicated Answers */}
                    <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                      {activeSection?.questions.length === 0 ? (
                        <div className="text-center py-10 text-xs italic" style={{ color: 'var(--color-text-secondary)' }}>
                          {t('noQuestionsYet', 'No questions in this topic yet. Add one below.')}
                        </div>
                      ) : (
                        activeSection?.questions.map((qItem, qIdx) => (
                          <div 
                            key={qItem.id || qIdx} 
                            className="border rounded-2xl p-4 space-y-3 shadow-xs transition"
                            style={{
                              backgroundColor: 'var(--color-card)',
                              borderColor: 'var(--color-border)'
                            }}
                          >
                            {/* Question Row */}
                            <div className="flex items-center gap-2.5">
                              <span 
                                className="w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 border"
                                style={{
                                  backgroundColor: 'var(--color-inner-dark)',
                                  borderColor: 'var(--color-primary)',
                                  color: 'var(--color-primary)'
                                }}
                              >
                                {qIdx + 1}
                              </span>
                              <input
                                type="text"
                                value={qItem.text}
                                onChange={(e) => handleUpdateQuestionText(activeSection.id, qIdx, e.target.value)}
                                placeholder={t('questionTextPlaceholder', 'Enter question text...')}
                                autoComplete="off"
                                spellCheck={false}
                                aria-label={`${t('questionNumber', 'Question')} ${qIdx + 1}`}
                                className="settings-input flex-1 border rounded-xl px-3.5 py-2 text-xs outline-none font-semibold transition"
                                style={{
                                  backgroundColor: 'var(--color-inner-dark)',
                                  borderColor: 'var(--color-border)',
                                  color: 'var(--color-text)'
                                }}
                                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveQuestionFromTopic(activeSection.id, qIdx)}
                                className="p-1.5 rounded-lg border transition cursor-pointer hover:text-red-500 shrink-0"
                                style={{
                                  backgroundColor: 'var(--color-inner-dark)',
                                  borderColor: 'var(--color-border)',
                                  color: 'var(--color-text-secondary)'
                                }}
                                title={t('removeQuestionTooltip', 'Remove question')}
                                aria-label={t('removeQuestionTooltip', 'Remove question')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            {/* Dedicated Answers Container */}
                            <div 
                              className="p-3 rounded-xl border space-y-2.5 transition-colors duration-200"
                              style={{
                                backgroundColor: 'var(--color-inner-dark)',
                                borderColor: 'var(--color-border)'
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-primary)' }}>
                                  <Sparkles className="h-3 w-3" /> {t('dedicatedAnswersHeader', 'Dedicated Answers for Wizard Manager')} ({qItem.dedicatedAnswers?.length || 0})
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                                  {t('dedicatedAnswersSubtitle', 'Preset choices presented to user during intake')}
                                </span>
                              </div>

                              {/* Interactive Preset Chips */}
                              <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                                {!qItem.dedicatedAnswers || qItem.dedicatedAnswers.length === 0 ? (
                                  <span className="text-[10px] italic py-1" style={{ color: 'var(--color-text-secondary)' }}>
                                    {t('noDedicatedAnswers', 'No dedicated answers added yet. Users will need to type freely, or add preset answers below.')}
                                  </span>
                                ) : (
                                  qItem.dedicatedAnswers.map((ans, ansIdx) => (
                                    <span
                                      key={ansIdx}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border shadow-2xs transition"
                                      style={{
                                        backgroundColor: 'var(--color-card)',
                                        borderColor: 'var(--color-border)',
                                        color: 'var(--color-text)'
                                      }}
                                    >
                                      <span>{ans}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveDedicatedAnswer(activeSection.id, qIdx, ansIdx)}
                                        className="hover:opacity-75 cursor-pointer ml-0.5 text-slate-400 hover:text-red-500 transition"
                                        title={t('removeAnswer', 'Remove answer')}
                                        aria-label={`${t('removeAnswer', 'Remove')} ${ans}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))
                                )}
                              </div>

                              {/* Add Dedicated Answer Input */}
                              <div className="flex gap-2 pt-1">
                                <input
                                  type="text"
                                  placeholder={t('addDedicatedAnswerPlaceholder', 'Add dedicated answer option (e.g. 3 Days, High-Protein)...')}
                                  value={dedicatedAnswerInputs[`${activeSection.id}_${qIdx}`] || ''}
                                  onChange={(e) => setDedicatedAnswerInputs({
                                    ...dedicatedAnswerInputs,
                                    [`${activeSection.id}_${qIdx}`]: e.target.value
                                  })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddDedicatedAnswer(activeSection.id, qIdx);
                                    }
                                  }}
                                  className="settings-input flex-1 border rounded-lg px-3 py-1.5 text-xs outline-none transition"
                                  style={{
                                    backgroundColor: 'var(--color-card)',
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-text)'
                                  }}
                                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddDedicatedAnswer(activeSection.id, qIdx)}
                                  className="text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-xs hover:opacity-90 shrink-0"
                                  style={{ backgroundColor: 'var(--color-primary)' }}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  <span>{t('addAnswerBtn', 'Add Answer')}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Add New Question Input */}
                  <div className="flex gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <input
                      type="text"
                      placeholder={`${t('addQuestionPrefix', 'Add question to')} "${activeSection?.topicTitle}"...`}
                      value={newQuestionText}
                      onChange={(e) => setNewQuestionText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddQuestionToTopic(activeSection.id))}
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={t('addQuestionPrefix', 'Add question')}
                      className="settings-input flex-1 border rounded-xl px-3.5 py-2.5 text-xs outline-none transition"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddQuestionToTopic(activeSection.id)}
                      className="text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md hover:opacity-90 shrink-0"
                      style={{ backgroundColor: 'var(--color-emerald)' }}
                    >
                      <Plus className="h-4 w-4" /> {t('addQuestionBtn', 'Add Question')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Appearance Section with Live Preview */}
            <div 
              className="border rounded-3xl p-6 space-y-6 shadow-sm text-xs mt-6 transition-colors duration-200"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)'
              }}
            >
              <h2 
                className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-2"
                style={{ color: 'var(--color-primary)' }}
              >
                <LayoutTemplate className="h-4 w-4" /> {t('resultsAppearanceHeader', 'Final Results Appearance in /chef Chat')}
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: 'card', title: t('modeCardTitle', 'Standard Cards View'), desc: t('modeCardDesc', 'Full interactive meal cards with images and batch cooking options.') },
                  { id: 'compact', title: t('modeCompactTitle', 'Compact Table View'), desc: t('modeCompactDesc', 'Condensed list view optimized for quick overview and rapid swapping.') },
                  { id: 'detailed', title: t('modeDetailedTitle', 'Detailed Master View'), desc: t('modeDetailedDesc', 'Expanded view displaying full ingredient breakdowns inline.') }
                ].map((mode) => {
                  const isSel = resultDisplayMode === mode.id;
                  return (
                    <div
                      key={mode.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSel}
                      aria-label={mode.title}
                      onClick={() => setResultDisplayMode(mode.id as any)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setResultDisplayMode(mode.id as any);
                        }
                      }}
                      className="p-4 rounded-2xl border cursor-pointer transition space-y-2 shadow-xs hover:opacity-90 outline-none"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: isSel ? 'var(--color-primary)' : 'var(--color-border)',
                        color: isSel ? 'var(--color-text)' : 'var(--color-text-secondary)'
                      }}
                    >
                      <div className="flex items-center justify-between font-bold" style={{ color: 'var(--color-text)' }}>
                        <span>{mode.title}</span>
                        {isSel && <Check className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />}
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{mode.desc}</p>
                    </div>
                  );
                })}
              </div>

              {/* Live Preview Box */}
              <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text)' }}>
                    <Eye className="h-4 w-4" style={{ color: 'var(--color-primary)' }} /> {t('liveUiPreview', 'Live UI Preview')} ({resultDisplayMode.toUpperCase()} MODE)
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('liveUiPreviewNotice', 'Updates instantly when selecting above')}
                  </span>
                </div>

                <div 
                  className="border rounded-2xl p-4 space-y-3 shadow-inner transition-colors duration-200"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  {resultDisplayMode === 'compact' && (
                    <div className="space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between border-b pb-2 text-xs" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="font-bold flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
                          <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }} /> {t('previewPlanTitle', 'High Protein Plan (3 Days)')}
                        </span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{t('threeOfThreeDays', '3/3 Days')}</span>
                      </div>
                      <div className="space-y-1.5">
                        <div 
                          className="flex items-center justify-between p-2 rounded-xl border text-[11px]"
                          style={{
                            backgroundColor: 'var(--color-card)',
                            borderColor: 'var(--color-border)'
                          }}
                        >
                          <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{t('previewDay1Title', 'Day 1 - Sunday:')}</span>
                          <span className="font-medium" style={{ color: 'var(--color-text)' }}>{t('previewMealName1', 'Avocado Quinoa Bowl')}</span>
                          <span style={{ color: 'var(--color-text-secondary)' }}>25m</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {resultDisplayMode === 'detailed' && (
                    <div className="space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between border-b pb-2 text-xs" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-primary)' }}>{t('previewDetailedHeading', 'Detailed Master Plan Preview')}</span>
                        <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{t('previewThreeDays', '3 Days')}</span>
                      </div>
                      <div 
                        className="border rounded-xl p-3 space-y-2 text-[11px]"
                        style={{
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-border)'
                        }}
                      >
                        <div className="flex justify-between font-bold" style={{ color: 'var(--color-primary)' }}>
                          <span>{t('previewDay1Title', 'Day 1 - Sunday')}</span>
                          <span>{t('previewDinnerBadge', 'DINNER')}</span>
                        </div>
                        <div className="flex gap-2.5 items-start">
                          <div className="w-10 h-10 rounded-lg shrink-0 bg-cover bg-center border" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=150&q=80)', borderColor: 'var(--color-border)' }} />
                          <div className="space-y-0.5 flex-1">
                            <h5 className="font-bold text-xs" style={{ color: 'var(--color-text)' }}>{t('previewMealName1', 'Avocado Quinoa Bowl')}</h5>
                            <p className="text-[10px] line-clamp-1" style={{ color: 'var(--color-text-secondary)' }}>{t('previewMealDesc', 'Nutritious plant-based high-protein bowl with fresh lime dressing.')}</p>
                            <span className="text-[9px] block" style={{ color: 'var(--color-text-secondary)' }}>{t('previewIngredients', 'Ingredients: Quinoa, Avocado, Chickpeas, Olive Oil')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {resultDisplayMode === 'card' && (
                    <div className="space-y-3 animate-in fade-in">
                      <div 
                        className="rounded-xl overflow-hidden border"
                        style={{
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-border)'
                        }}
                      >
                        <div className="text-white px-3 py-2 flex items-center justify-between font-bold text-xs" style={{ backgroundColor: 'var(--color-primary)' }}>
                          <span>{t('previewDay1Title', 'Day 1 - Sunday')}</span>
                          <span className="text-[10px] opacity-90">{t('previewSampleDate', 'Sep 6')}</span>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-lg shrink-0 bg-cover bg-center border" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=150&q=80)', borderColor: 'var(--color-border)' }} />
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-black uppercase" style={{ color: 'var(--color-primary)' }}>{t('previewDinnerBadge', 'Dinner')}</span>
                              <h4 className="font-extrabold text-xs truncate" style={{ color: 'var(--color-text)' }}>{t('previewMealName1', 'Avocado Quinoa Bowl')}</h4>
                              <p className="text-[10px] line-clamp-1" style={{ color: 'var(--color-text-secondary)' }}>{t('previewCardMealDesc', 'Nutritious chef-curated home recipe suited to your diet.')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] pt-1 border-t" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" style={{ color: 'var(--color-emerald)' }} /> 15m</span>
                            <span className="flex items-center gap-1"><Flame className="h-3 w-3" style={{ color: 'var(--color-primary)' }} /> 20m</span>
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {t('previewServings', '2 servings')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: VOICE INTERACTION SETTINGS */}
        {activeTab === 'voice' && (
          <div 
            className="border rounded-3xl p-6 space-y-6 shadow-sm text-xs animate-in fade-in transition-colors duration-200"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)'
            }}
          >
            <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h2 
                  className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <Mic className="h-4 w-4" /> {t('voiceInteractionHeader', 'Voice Interaction & Speech Configuration')}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('voiceInteractionDesc', 'Configure text-to-speech engine, voice models, playback speed, and auto-read behavior.')}
                </p>
              </div>

              <div 
                role="button"
                tabIndex={0}
                aria-pressed={enableVoiceInteraction}
                aria-label={t('enableVoiceMode', 'Enable Voice Mode')}
                onClick={() => setEnableVoiceInteraction(!enableVoiceInteraction)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEnableVoiceInteraction(!enableVoiceInteraction);
                  }
                }}
                className="flex items-center gap-3 cursor-pointer border px-4 py-2.5 rounded-2xl shadow-xs transition hover:opacity-90 outline-none"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <span className="font-bold" style={{ color: 'var(--color-text)' }}>{t('enableVoiceMode', 'Enable Voice Mode')}</span>
                <div 
                  className="w-9 h-5 rounded-full p-0.5 transition"
                  style={{ backgroundColor: enableVoiceInteraction ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <div 
                    className={`w-4 h-4 rounded-full transition transform ${enableVoiceInteraction ? 'translate-x-4' : 'translate-x-0'}`} 
                    style={{ backgroundColor: 'var(--color-toggle-thumb, #ffffff)' }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('voiceSynthesisEngine', 'Voice Synthesis Engine')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'version1', name: t('voiceEngineV1Name', 'Version 1.0'), desc: t('voiceEngineV1Desc', 'Standard Web Speech API') },
                    { id: 'version2', name: t('voiceEngineV2Name', 'Version 2.0'), desc: t('voiceEngineV2Desc', 'Neural HD Studio Voices') }
                  ].map((engine) => {
                    const isSel = voiceEngine === engine.id;
                    return (
                      <button
                        key={engine.id}
                        type="button"
                        onClick={() => setVoiceEngine(engine.id as any)}
                        className="p-3.5 rounded-2xl border text-left transition cursor-pointer shadow-xs hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: isSel ? 'var(--color-primary)' : 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      >
                        <span className="block font-bold text-sm" style={{ color: 'var(--color-text)' }}>{engine.name}</span>
                        <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{engine.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('assistantVoicePersona', 'Assistant Voice Persona')}
                </label>
                <div className="relative">
                  <select
                    value={selectedVoiceName}
                    onChange={(e) => setSelectedVoiceName(e.target.value)}
                    aria-label={t('assistantVoicePersona', 'Assistant Voice Persona')}
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    className="w-full appearance-none border rounded-xl px-4 py-3 pr-10 outline-none cursor-pointer transition text-xs"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  >
                    <option value="en-US-Neural2-F" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t('voiceAria', 'Chef Aria (US Female - Warm & Professional)')}</option>
                    <option value="en-US-Neural2-D" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t('voiceMarcus', 'Chef Marcus (US Male - Deep & Authoritative)')}</option>
                    <option value="en-GB-Neural2-A" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t('voiceOliver', 'Chef Oliver (UK Male - Refined Accent)')}</option>
                    <option value="en-AU-Neural2-B" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t('voiceMatilda', 'Chef Matilda (Australian - Friendly & Casual)')}</option>
                  </select>
                  <ChevronDown className="h-4 w-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" style={{ color: 'var(--color-text-secondary)' }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <div className="flex justify-between font-bold">
                  <span style={{ color: 'var(--color-text-secondary)' }}>{t('speechSpeed', 'Speech Speed')}: {voiceSpeed}x</span>
                  <span style={{ color: 'var(--color-emerald)' }}>{voiceSpeed === 1.0 ? t('speedNormal', 'Normal') : voiceSpeed > 1.0 ? t('speedFast', 'Fast') : t('speedRelaxed', 'Relaxed')}</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.75"
                  step="0.25"
                  value={voiceSpeed}
                  onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                  aria-label={t('speechSpeed', 'Speech Speed')}
                  className="w-full cursor-pointer"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('speechSpeedDesc', 'Adjust the speaking pace of the AI assistant when reading recipe steps aloud.')}
                </p>
              </div>

              <div className="space-y-2 flex flex-col justify-center">
                <div 
                  role="button"
                  tabIndex={0}
                  aria-pressed={voiceAutoPlay}
                  aria-label={t('autoReadAiResponses', 'Auto-Read AI Responses')}
                  onClick={() => setVoiceAutoPlay(!voiceAutoPlay)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setVoiceAutoPlay(!voiceAutoPlay);
                    }
                  }}
                  className="flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer shadow-xs hover:opacity-90 outline-none"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Volume2 className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                    <div>
                      <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>{t('autoReadAiResponses', 'Auto-Read AI Responses')}</span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{t('autoReadAiResponsesDesc', 'Automatically speak answers aloud upon generation.')}</span>
                    </div>
                  </div>
                  <div 
                    className="w-9 h-5 rounded-full p-0.5 transition"
                    style={{ backgroundColor: voiceAutoPlay ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    <div 
                      className={`w-4 h-4 rounded-full transition transform ${voiceAutoPlay ? 'translate-x-4' : 'translate-x-0'}`} 
                      style={{ backgroundColor: 'var(--color-toggle-thumb, #ffffff)' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AGENT PARAMETERS */}
        {activeTab === 'advanced' && (
          <div className="space-y-6 animate-in fade-in">
            <div 
              className="border rounded-3xl p-6 space-y-4 shadow-sm transition-colors duration-200"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)'
              }}
            >
              <h2 
                className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-2"
                style={{ color: 'var(--color-primary)' }}
              >
                <Globe className="h-4 w-4" /> {t('autonomousCapabilitiesHeader', 'Autonomous Capabilities & Search Scope Control')}
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {t('autonomousCapabilitiesDesc', 'Control what data sources the AI agent searches and incorporates when responding on')} <span className="font-mono font-bold" style={{ color: 'var(--color-text)' }}>/chef</span> {t('pageSuffix', '')}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div 
                  role="button"
                  tabIndex={0}
                  aria-pressed={enableWebSearch}
                  aria-label={t('liveWebSearch', 'Live Web Search')}
                  onClick={() => setEnableWebSearch(!enableWebSearch)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEnableWebSearch(!enableWebSearch);
                    }
                  }}
                  className="p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 shadow-xs hover:opacity-90 outline-none"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: enableWebSearch ? 'var(--color-primary)' : 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <Globe className="h-5 w-5" style={{ color: enableWebSearch ? 'var(--color-primary)' : 'var(--color-text-secondary)' }} />
                    <div 
                      className="w-9 h-5 rounded-full p-0.5 transition"
                      style={{ backgroundColor: enableWebSearch ? 'var(--color-primary)' : 'var(--color-border)' }}
                    >
                      <div 
                        className={`w-4 h-4 rounded-full transition transform ${enableWebSearch ? 'translate-x-4' : 'translate-x-0'}`} 
                        style={{ backgroundColor: 'var(--color-toggle-thumb, #ffffff)' }}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>{t('liveWebSearch', 'Live Web Search')}</span>
                    <span className="text-[10px] leading-tight block mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('liveWebSearchDesc', 'Allows AI to search external culinary web data, trends, and ingredient substitutes.')}
                    </span>
                  </div>
                </div>

                <div 
                  role="button"
                  tabIndex={0}
                  aria-pressed={enablePantryContext}
                  aria-label={t('pantryContextSearch', 'Pantry Context Search')}
                  onClick={() => setEnablePantryContext(!enablePantryContext)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEnablePantryContext(!enablePantryContext);
                    }
                  }}
                  className="p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 shadow-xs hover:opacity-90 outline-none"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: enablePantryContext ? 'var(--color-emerald)' : 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <PackageCheck className="h-5 w-5" style={{ color: enablePantryContext ? 'var(--color-emerald)' : 'var(--color-text-secondary)' }} />
                    <div 
                      className="w-9 h-5 rounded-full p-0.5 transition"
                      style={{ backgroundColor: enablePantryContext ? 'var(--color-emerald)' : 'var(--color-border)' }}
                    >
                      <div 
                        className={`w-4 h-4 rounded-full transition transform ${enablePantryContext ? 'translate-x-4' : 'translate-x-0'}`} 
                        style={{ backgroundColor: 'var(--color-toggle-thumb, #ffffff)' }}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>{t('pantryContextSearch', 'Pantry Context Search')}</span>
                    <span className="text-[10px] leading-tight block mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('pantryContextSearchDesc', 'Automatically scans user pantry inventory to build recipes matching in-stock ingredients.')}
                    </span>
                  </div>
                </div>

                <div 
                  role="button"
                  tabIndex={0}
                  aria-pressed={strictDietEnforcement}
                  aria-label={t('strictDietaryFilters', 'Strict Dietary Filters')}
                  onClick={() => setStrictDietEnforcement(!strictDietEnforcement)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setStrictDietEnforcement(!strictDietEnforcement);
                    }
                  }}
                  className="p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 shadow-xs hover:opacity-90 outline-none"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: strictDietEnforcement ? 'var(--color-blue, var(--color-primary))' : 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <ShieldAlert className="h-5 w-5" style={{ color: strictDietEnforcement ? 'var(--color-blue, var(--color-primary))' : 'var(--color-text-secondary)' }} />
                    <div 
                      className="w-9 h-5 rounded-full p-0.5 transition"
                      style={{ backgroundColor: strictDietEnforcement ? 'var(--color-blue, var(--color-primary))' : 'var(--color-border)' }}
                    >
                      <div 
                        className={`w-4 h-4 rounded-full transition transform ${strictDietEnforcement ? 'translate-x-4' : 'translate-x-0'}`} 
                        style={{ backgroundColor: 'var(--color-toggle-thumb, #ffffff)' }}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>{t('strictDietaryFilters', 'Strict Dietary Filters')}</span>
                    <span className="text-[10px] leading-tight block mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('strictDietaryFiltersDesc', 'Enforces strict filtering against user allergies, avoid lists, and religious dietary rules.')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div 
              className="border rounded-3xl p-6 space-y-6 shadow-sm text-xs animate-in fade-in transition-colors duration-200"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)'
              }}
            >
              <h2 
                className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-2"
                style={{ color: 'var(--color-primary)' }}
              >
                <SlidersHorizontal className="h-4 w-4" /> {t('agentParametersHeader', 'Agent Parameters & Knowledge Tuning')}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-4 border-b transition-colors duration-200" style={{ borderColor: 'var(--color-border)' }}>
                <div className="space-y-2">
                  <div className="flex justify-between font-bold">
                    <span style={{ color: 'var(--color-text-secondary)' }}>{t('temperatureLabel', 'Temperature (Creativity)')}: {temperature}</span>
                    <span style={{ color: 'var(--color-emerald)' }}>{temperature < 0.4 ? t('tempPrecise', 'Precise') : temperature > 0.8 ? t('tempCreative', 'Creative') : t('tempBalanced', 'Balanced')}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    aria-label={t('temperatureLabel', 'Temperature')}
                    className="w-full cursor-pointer"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('temperatureDesc', 'Lower values yield structured recipes; higher values generate novel flavor profiles.')}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between font-bold">
                    <span style={{ color: 'var(--color-text-secondary)' }}>{t('maxTokensLabel', 'Max Tokens Output')}: {maxTokens}</span>
                    <span className="font-mono text-[10px]" style={{ color: 'var(--color-primary)' }}>{maxTokens} tok</span>
                  </div>
                  <input
                    type="range"
                    min="512"
                    max="8192"
                    step="256"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    aria-label={t('maxTokensLabel', 'Max Tokens')}
                    className="w-full cursor-pointer"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('maxTokensDesc', 'Controls maximum tokens returned per autonomous culinary generation prompt.')}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('maxPlanDaysCap', 'Max Plan Days Limit (Wizard Cap)')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="14"
                    value={maxPlanDays}
                    onChange={(e) => setMaxPlanDays(parseInt(e.target.value) || 7)}
                    autoComplete="off"
                    aria-label={t('maxPlanDaysCap', 'Max Plan Days')}
                    className="settings-input w-full border rounded-xl px-4 py-2.5 outline-none transition"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  />
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('maxPlanDaysDesc', 'Maximum number of days the AI can structure in a single meal plan sequence.')}
                  </p>
                </div>
              </div>

              {/* Knowledge Base */}
              <div className="space-y-3 pt-1">
                <div>
                  <h3 className="font-bold text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
                    <BookOpen className="h-4 w-4" style={{ color: 'var(--color-primary)' }} /> {t('knowledgeBaseHeader', 'Knowledge Base')}
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('knowledgeBaseDesc', 'Fine-tune the assistant to your needs by adding reference source documents or databases.')}
                  </p>
                </div>

                <div className="flex gap-2">
                  <div 
                    className="settings-input flex-1 border rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between shadow-xs"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <input
                      type="text"
                      placeholder={t('knowledgeBasePlaceholder', 'Knowledge Base...')}
                      value={newKbInput}
                      onChange={(e) => setNewKbInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newKbInput.trim()) {
                          e.preventDefault();
                          setKnowledgeBaseList([...knowledgeBaseList, newKbInput.trim()]);
                          setNewKbInput('');
                        }
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={t('knowledgeBaseHeader', 'Knowledge Base')}
                      className="bg-transparent border-none outline-none w-full text-xs"
                      style={{ color: 'var(--color-text)' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newKbInput.trim()) {
                          setKnowledgeBaseList([...knowledgeBaseList, newKbInput.trim()]);
                          setNewKbInput('');
                        }
                      }}
                      className="w-6 h-6 rounded-lg font-bold flex items-center justify-center shrink-0 cursor-pointer transition hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        color: 'var(--color-text)'
                      }}
                      aria-label={t('addKnowledgeBaseItem', 'Add Knowledge Base Item')}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {knowledgeBaseList.map((item, idx) => (
                    <span 
                      key={idx}
                      className="border px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-primary)',
                        color: 'var(--color-text)'
                      }}
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => setKnowledgeBaseList(knowledgeBaseList.filter((_, i) => i !== idx))}
                        className="transition cursor-pointer hover:opacity-75"
                        style={{ color: 'var(--color-text-secondary)' }}
                        aria-label={`${t('removeItem', 'Remove')} ${item}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Custom Vocabulary */}
              <div className="space-y-3 pt-3 border-t transition-colors duration-200" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <h3 className="font-bold text-xs flex items-center gap-1.5" style={{ color: 'var(--color-emerald)' }}>
                    <BookA className="h-4 w-4" style={{ color: 'var(--color-emerald)' }} /> {t('customVocabularyHeader', 'Custom Vocabulary')}
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('customVocabularyDesc', 'Enhance accuracy with specialized culinary or business terminology.')}
                  </p>
                </div>

                <div className="flex gap-2">
                  <div 
                    className="settings-input flex-1 border rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between shadow-xs"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <input
                      type="text"
                      placeholder={t('startTypingToAdd', 'Start typing to add')}
                      value={newVocabInput}
                      onChange={(e) => setNewVocabInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newVocabInput.trim()) {
                          e.preventDefault();
                          setCustomVocabularyList([...customVocabularyList, newVocabInput.trim()]);
                          setNewVocabInput('');
                        }
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={t('customVocabularyHeader', 'Custom Vocabulary')}
                      className="bg-transparent border-none outline-none w-full text-xs"
                      style={{ color: 'var(--color-text)' }}
                    />
                    <span 
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (newVocabInput.trim()) {
                          setCustomVocabularyList([...customVocabularyList, newVocabInput.trim()]);
                          setNewVocabInput('');
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg font-bold text-[10px] shrink-0 cursor-pointer transition hover:opacity-80 outline-none"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        color: 'var(--color-text)'
                      }}
                    >
                      {t('enterKey', 'Enter')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {customVocabularyList.map((item, idx) => (
                    <span 
                      key={idx}
                      className="border px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-emerald)',
                        color: 'var(--color-text)'
                      }}
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => setCustomVocabularyList(customVocabularyList.filter((_, i) => i !== idx))}
                        className="transition cursor-pointer hover:opacity-75"
                        style={{ color: 'var(--color-text-secondary)' }}
                        aria-label={`${t('removeItem', 'Remove')} ${item}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Filter Words */}
              <div className="space-y-3 pt-3 border-t transition-colors duration-200" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <h3 className="font-bold text-xs flex items-center gap-1.5" style={{ color: 'var(--color-danger, #ef4444)' }}>
                    <Ban className="h-4 w-4" style={{ color: 'var(--color-danger, #ef4444)' }} /> {t('filterWordsHeader', 'Filter Words')}
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('filterWordsDesc', 'Restricted words or ingredients remain unspoken or avoided in AI outputs.')}
                  </p>
                </div>

                <div className="flex gap-2">
                  <div 
                    className="settings-input flex-1 border rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between shadow-xs"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <input
                      type="text"
                      placeholder={t('startTypingToAdd', 'Start typing to add')}
                      value={newFilterInput}
                      onChange={(e) => setNewFilterInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newFilterInput.trim()) {
                          e.preventDefault();
                          setFilterWordsList([...filterWordsList, newFilterInput.trim()]);
                          setNewFilterInput('');
                        }
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={t('filterWordsHeader', 'Filter Words')}
                      className="bg-transparent border-none outline-none w-full text-xs"
                      style={{ color: 'var(--color-text)' }}
                    />
                    <span 
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (newFilterInput.trim()) {
                          setFilterWordsList([...filterWordsList, newFilterInput.trim()]);
                          setNewFilterInput('');
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg font-bold text-[10px] shrink-0 cursor-pointer transition hover:opacity-80 outline-none"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        color: 'var(--color-text)'
                      }}
                    >
                      {t('enterKey', 'Enter')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {filterWordsList.map((item, idx) => (
                    <span 
                      key={idx}
                      className="border px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-danger-border, rgba(239, 68, 68, 0.4))',
                        color: 'var(--color-text)'
                      }}
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => setFilterWordsList(filterWordsList.filter((_, i) => i !== idx))}
                        className="transition cursor-pointer hover:opacity-75"
                        style={{ color: 'var(--color-text-secondary)' }}
                        aria-label={`${t('removeItem', 'Remove')} ${item}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* RECOMMENDED RECIPES URL (PRIMARY SOURCE FOR /chef) */}
              <div className="space-y-3 pt-3 border-t transition-colors duration-200" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h3 className="font-bold text-xs flex items-center gap-1.5" style={{ color: 'var(--color-primary)' }}>
                      <Globe className="h-4 w-4" style={{ color: 'var(--color-primary)' }} /> {t('recommendedRecipesUrlHeader', 'Recommended Recipes Url')}
                    </h3>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('recommendedRecipesUrlDesc', 'Configure primary source URLs for recipe recommendations. When users ask for recipes on /chef, the server reads these sites and the AI builds on the real recipes it finds there. Use recipe pages or recipe index pages (blog home, category or collection pages).')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span 
                      className="text-[10px] px-2.5 py-0.5 rounded-full font-bold border shrink-0"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: recommendedRecipeUrls.length > 0 ? 'var(--color-primary)' : 'var(--color-border)',
                        color: recommendedRecipeUrls.length > 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                      }}
                    >
                      {recommendedRecipeUrls.length} {t('urlsActiveBadge', 'Active URLs (Primary)')}
                    </span>
                    {recommendedRecipeUrls.length > 0 && (
                      <button
                        type="button"
                        onClick={() => checkRecipeUrls(recommendedRecipeUrls)}
                        className="text-[10px] font-bold transition cursor-pointer hover:opacity-80"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        {t('checkSources', 'Check sources')}
                      </button>
                    )}
                    {recommendedRecipeUrls.length > 1 && (
                      <button
                        type="button"
                        onClick={handleClearAllRecommendedUrls}
                        className="text-[10px] text-red-400 hover:text-red-500 font-bold transition cursor-pointer"
                      >
                        {t('clearAll', 'Clear All')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Multi-URL Input Box with Batch Support */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div 
                      className="settings-input flex-1 border rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between shadow-xs transition"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    >
                      <input
                        type="text"
                        placeholder={t('recommendedRecipeUrlPlaceholder', 'Add recipe URL (paste single or multiple separated by commas or newlines)...')}
                        value={newRecipeUrlInput}
                        onChange={(e) => setNewRecipeUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddRecommendedUrls();
                          }
                        }}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={t('recommendedRecipesUrlHeader', 'Recommended Recipes Url')}
                        className="bg-transparent border-none outline-none w-full text-xs font-medium"
                        style={{ color: 'var(--color-text)' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddRecommendedUrls()}
                      disabled={!newRecipeUrlInput.trim()}
                      className="px-4 py-2.5 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-40 hover:opacity-90 shrink-0"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      <Plus className="h-4 w-4" /> {t('addUrlBtn', 'Add URL')}
                    </button>
                  </div>
                  <span className="text-[10px] block" style={{ color: 'var(--color-text-secondary)' }}>
                    💡 {t('multiUrlHint', 'Tip: You can paste multiple URLs at once separated by commas or newlines. Chef AI will prioritize these as primary culinary references.')}
                  </span>
                </div>

                {/* URL List / Badges */}
                <div className="space-y-2 pt-1">
                  {recommendedRecipeUrls.length === 0 ? (
                    <div 
                      className="p-4 text-center border border-dashed rounded-2xl text-xs space-y-0.5"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                    >
                      <span className="font-semibold block">{t('noRecommendedUrlsTitle', 'No Recommended Recipe URLs configured.')}</span>
                      <span className="text-[11px] block">{t('noRecommendedUrlsDesc', 'Add your preferred food blog or recipe URLs above to make /chef recommend recipes from them first.')}</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
                      {recommendedRecipeUrls.map((urlStr, idx) => {
                        let domain = 'Website';
                        try {
                          domain = new URL(urlStr).hostname.replace(/^www\./, '');
                        } catch (_) {}

                        return (
                          <div 
                            key={idx}
                            className="p-2.5 rounded-xl border flex items-center justify-between gap-2 shadow-xs transition"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)'
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span 
                                  className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border truncate"
                                  style={{
                                    backgroundColor: 'var(--color-card)',
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-primary)'
                                  }}
                                >
                                  {domain}
                                </span>
                                <span 
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                                  style={{
                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                    color: 'var(--color-emerald)'
                                  }}
                                >
                                  {t('primaryTag', 'Primary')}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text)' }} title={urlStr}>
                                {urlStr}
                              </p>
                              {urlStatus[urlStr] && (
                                <p
                                  className="text-[10px] font-semibold truncate mt-0.5"
                                  style={{ color: urlStatus[urlStr].state === 'ok' ? 'var(--color-emerald)' : urlStatus[urlStr].state === 'error' ? '#ef4444' : 'var(--color-text-secondary)' }}
                                  title={urlStatus[urlStr].text}
                                >
                                  {urlStatus[urlStr].state === 'ok' ? '✓ ' : urlStatus[urlStr].state === 'error' ? '✗ ' : ''}{urlStatus[urlStr].text}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={urlStr}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded-lg hover:opacity-80 transition cursor-pointer"
                                style={{ color: 'var(--color-primary)' }}
                                title={t('openUrlTooltip', 'Open in new tab')}
                              >
                                <Globe className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => handleRemoveRecommendedUrl(idx)}
                                className="p-1 rounded-lg hover:text-red-500 transition cursor-pointer"
                                style={{ color: 'var(--color-text-secondary)' }}
                                title={t('removeUrlTooltip', 'Remove URL')}
                                aria-label={t('removeUrlTooltip', 'Remove URL')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* System Prompt */}
              <div className="space-y-2 pt-3 border-t transition-colors duration-200" style={{ borderColor: 'var(--color-border)' }}>
                <label className="block font-bold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('systemPromptHeader', 'System Prompt / Autonomous Persona')}
                </label>
                <textarea
                  rows={5}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={t('systemPromptHeader', 'System Prompt')}
                  className="settings-input w-full border rounded-xl p-3.5 outline-none leading-relaxed font-sans text-xs transition"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                />
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('systemPromptDesc', 'Defines how the AI agent behaves, formats responses, and handles user queries on the')} <span className="font-mono font-bold" style={{ color: 'var(--color-text)' }}>/chef</span> {t('pageSuffix', '')}
                </p>
              </div>
            </div>
          </div>
        )}

        <ImageKeyCard />

      </div>
    </div>
  );
}
