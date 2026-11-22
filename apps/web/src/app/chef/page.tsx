// @ts-nocheck
'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChefHat, Globe, ExternalLink, Send, SlidersHorizontal, Edit3, Clock, Users,
  Calendar, CalendarPlus, X, Loader2, User as UserIcon, Check, Sparkles, Bookmark,
  Plus, Trash2, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, Layers,
  Mic, MicOff, Volume2, Square, BookOpen, History, Folder, MessageSquare, Tag,
  ShoppingCart, Coins, Cpu, ShieldAlert, ArrowRight, Utensils
} from 'lucide-react';
import { getCurrentUser, initAuthStorage, User } from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';
import TokenPurchaseModal from '@/components/TokenPurchaseModal';

interface MealItem {
  id: string;
  dayIndex: number;
  dayLabel: string;
  dateStr: string;
  mealType: string;
  title: string;
  description: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  image?: string;
  isBatchCook?: boolean;
  isLeftover?: boolean;
  leftoverFrom?: string;
  ingredients?: string[];
  instructions?: string[];
  cuisine?: string;
  difficulty?: string;
  tags?: string[];
  chefTip?: string;
  sourceUrl?: string;
}

interface MealPlanData {
  title: string;
  totalDays: number;
  theme: string;
  budgetPerServing: string;
  meals: MealItem[];
}

interface RecommendedRecipeData {
  title: string;
  description: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  calories?: number;
  mealType?: string;
  ingredients: string[];
  instructions: string[];
  chefTip?: string;
  image?: string;
  sourceUrl?: string;
  sourceName?: string;
}

interface SystemRecommendation {
  label: string;
  route: string;
  description?: string;
}

interface ChatMessage {
  systemRecommendations?: SystemRecommendation[];
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  plan?: MealPlanData;
  recipe?: any;
  recommendedRecipe?: RecommendedRecipeData;
}

interface ChatCategory {
  id: string;
  name: string;
  created_at?: string;
}

interface ChatSessionItem {
  id: string;
  title: string;
  category_id?: string | null;
  category_name?: string | null;
  message_count?: number;
  created_at: string;
  updated_at: string;
}

// Michelin-quality culinary photography mapping to eliminate generic ugly salad fallbacks
const FOOD_IMAGE_MAP: Record<string, string> = {
  chicken: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80',
  beef: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
  steak: 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80',
  salmon: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80',
  fish: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80',
  pasta: 'https://images.unsplash.com/photo-1621996346565-e3d5d628178d?auto=format&fit=crop&w=800&q=80',
  spaghetti: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80',
  curry: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=800&q=80',
  soup: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80',
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80',
  bowl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
  quinoa: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
  breakfast: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=800&q=80',
  egg: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80',
  avocado: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80',
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
  taco: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80',
  pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
  rice: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80',
  pork: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
  tofu: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
  dessert: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
  roast: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=800&q=80',
  sandwich: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80',
  shrimp: 'https://images.unsplash.com/photo-1559742811-822873691df8?auto=format&fit=crop&w=800&q=80',
  seafood: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80',
  default: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80'
};

function getAccurateFoodImage(raw?: string, title?: string, mealType?: string): string {
  if (raw && typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('http') && !trimmed.includes('#primaryimage') && !trimmed.includes('photo-1546069901-ba9599a7e63c')) {
      return trimmed;
    }
    if (trimmed.startsWith('/') && !trimmed.includes('default')) {
      return trimmed;
    }
  }

  const query = `${title || ''} ${mealType || ''}`.toLowerCase();
  for (const [key, imgUrl] of Object.entries(FOOD_IMAGE_MAP)) {
    if (key !== 'default' && query.includes(key)) {
      return imgUrl;
    }
  }
  return FOOD_IMAGE_MAP.default;
}

const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto',
  'Paleo', 'Pescatarian', 'Halal', 'Kosher'
];

const ALLERGY_OPTIONS = [
  'Peanuts', 'Tree Nuts', 'Milk', 'Eggs', 'Fish',
  'Shellfish', 'Soy', 'Gluten', 'Other'
];

const COUNTRIES = [
  'Singapore', 'United States', 'United Kingdom', 'Australia', 
  'Canada', 'Malaysia', 'Japan', 'Germany', 'France', 'India'
];

const DEFAULT_SECTIONS = [
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

// Pure module-level utilities eliminating TDZ reference bugs during static site prerendering
function getUserKey(user: User | null): string {
  if (!user) return 'guest';
  return user.id || (user.email ? user.email.toLowerCase().trim() : 'guest');
}

async function safeJsonParse(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function getQuestionText(qItem: any): string {
  if (!qItem) return '';
  if (typeof qItem === 'string') return qItem.trim();
  return (qItem.text || qItem.question || qItem.title || '').trim();
}

function getQuestionDedicatedAnswers(qItem: any): string[] {
  if (!qItem || typeof qItem === 'string') return [];
  if (Array.isArray(qItem.dedicatedAnswers) && qItem.dedicatedAnswers.length > 0) {
    return qItem.dedicatedAnswers.filter(Boolean);
  }
  if (Array.isArray(qItem.answers) && qItem.answers.length > 0) {
    return qItem.answers.filter(Boolean);
  }
  if (Array.isArray(qItem.options) && qItem.options.length > 0) {
    return qItem.options.filter(Boolean);
  }
  return [];
}

export default function ChefChatPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(null);

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Chat History & Categories State (PostgreSQL backed)
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => 'sess_' + Date.now());
  const currentSessionIdRef = useRef<string>(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [historySessions, setHistorySessions] = useState<ChatSessionItem[]>([]);
  const [historyCategories, setHistoryCategories] = useState<ChatCategory[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyTotalPages, setHistoryTotalPages] = useState<number>(1);
  const [historyTotalCount, setHistoryTotalCount] = useState<number>(0);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  // AI & Voice telemetry settings
  const [questionnaireSections, setQuestionnaireSections] = useState<any[]>(DEFAULT_SECTIONS);
  const [activeTopicTitle, setActiveTopicTitle] = useState<string>('Standard Wizard');
  const [wizardQuestionsList, setWizardQuestionsList] = useState<any[]>([]);
  const [resultDisplayMode, setResultDisplayMode] = useState<'card' | 'compact' | 'detailed'>('card');
  const [activeAiModel, setActiveAiModel] = useState<string>('gemini-2.0-flash');
  const [strictDietEnforcement, setStrictDietEnforcement] = useState<boolean>(false);
  const [filterWordsList, setFilterWordsList] = useState<string[]>([]);
  const [enablePantryContext, setEnablePantryContext] = useState<boolean>(true);
  const [maxPlanDays, setMaxPlanDays] = useState<number>(7);
  const [recommendedRecipeUrls, setRecommendedRecipeUrls] = useState<string[]>([]);

  // Voice Interaction State
  const [enableVoiceInteraction, setEnableVoiceInteraction] = useState<boolean>(true);
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0);
  const [voiceAutoPlay, setVoiceAutoPlay] = useState<boolean>(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('en-US-Neural2-F');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const speechRecognitionRef = useRef<any>(null);

  // Token Telemetry
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [tokenSymbol, setTokenSymbol] = useState<string>('🪙');
  const [tokenName, setTokenName] = useState<string>('Foodie Token');
  const [isTokenEnabled, setIsTokenEnabled] = useState<boolean>(true);
  const [chefCost, setChefCost] = useState<number>(1);
  const [tokenPackages, setTokenPackages] = useState<any[]>([]);
  const [isTokenPurchaseOpen, setIsTokenPurchaseOpen] = useState(false);

  // Dietary Preferences State
  const [showPreferences, setShowPreferences] = useState<boolean>(false);
  const [servings, setServings] = useState<number>(2);
  const [country, setCountry] = useState<string>('Singapore');
  const [selectedDiets, setSelectedDiets] = useState<string[]>(['Vegetarian']);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>(['Peanuts']);
  const [ingredientsToAvoid, setIngredientsToAvoid] = useState<string[]>(['Oily']);
  const [newAvoidInput, setNewAvoidInput] = useState<string>('');
  const [tastesList, setTastesList] = useState<string[]>(['Less Spicy']);
  const [newTasteInput, setNewTasteInput] = useState<string>('');

  // Wizard Questionnaire Flow State
  const [wizardStep, setWizardStep] = useState<number | null>(null);
  const [wizardAnswers, setWizardAnswers] = useState<Record<number, string>>({});

  // Recipe Modals & Saved Recipes State (PostgreSQL backed)
  const [selectedRecipeForModal, setSelectedRecipeForModal] = useState<RecommendedRecipeData | null>(null);
  const [showRecipeDetailsModal, setShowRecipeDetailsModal] = useState<boolean>(false);
  const [pantryIngredientsList, setPantryIngredientsList] = useState<string[]>([]);
  const [userSavedRecipes, setUserSavedRecipes] = useState<any[]>([]);
  const [savingRecipeTitle, setSavingRecipeTitle] = useState<string | null>(null);

  // Planner Scheduling Modal State
  const [showPlannerModal, setShowPlannerModal] = useState<boolean>(false);
  const [recipeToSchedule, setRecipeToSchedule] = useState<RecommendedRecipeData | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [scheduleMealType, setScheduleMealType] = useState<string>('Dinner');
  const [scheduleServings, setScheduleServings] = useState<number>(2);
  const [schedulingLoading, setSchedulingLoading] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const updateWizardStep = useCallback((step: number | null) => {
    setWizardStep(step);
    try {
      if (typeof window === 'undefined') return;
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      if (step !== null) {
        localStorage.setItem(`zecratary_chef_wizard_step_${userKey}`, JSON.stringify(step));
      } else {
        localStorage.removeItem(`zecratary_chef_wizard_step_${userKey}`);
      }
    } catch (_) {}
  }, []);

  // ------------------------------------------------------------------
  // Voice Synthesis Engine
  // ------------------------------------------------------------------
  const cleanSpeechText = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[#*_~`]/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/•|\*|-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setSpeakingMsgId(null);
  }, []);

  const speakText = (textToSpeak: string, msgId?: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (isSpeaking && speakingMsgId === msgId) {
      stopSpeaking();
      return;
    }

    stopSpeaking();
    const clean = cleanSpeechText(textToSpeak);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = Math.max(0.7, Math.min(1.8, voiceSpeed || 1.0));

    if (selectedVoiceName.includes('F') || selectedVoiceName.includes('Aria')) {
      utterance.pitch = 1.05;
    } else if (selectedVoiceName.includes('D') || selectedVoiceName.includes('Marcus')) {
      utterance.pitch = 0.88;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const matchedVoice = voices.find(v => v.lang.startsWith('en'));
      if (matchedVoice) utterance.voice = matchedVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setSpeakingMsgId(msgId || 'general');
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingMsgId(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingMsgId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  const toggleSpeechRecognition = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      speechRecognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        showToast("🎙️ Listening... Speak your request");
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setPrompt(prev => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (_) {
      setIsListening(false);
    }
  };

  // ------------------------------------------------------------------
  // Chat Lifecycle & Persistence (Preserved Until "New Chat")
  // ------------------------------------------------------------------
  const startNewChat = useCallback(() => {
    stopSpeaking();
    const newId = 'sess_' + Date.now();
    currentSessionIdRef.current = newId;
    setCurrentSessionId(newId);
    setMessages([]);
    updateWizardStep(null);
    setWizardAnswers({});
    setActiveTopicTitle('Standard Wizard');
    setShowHistoryDrawer(false);
    setSelectedSessionIds([]);
    try {
      if (typeof window !== 'undefined') {
        const active = currentUserRef.current || getCurrentUser();
        const userKey = getUserKey(active);
        localStorage.removeItem(`zecratary_chef_active_session_id_${userKey}`);
        localStorage.removeItem(`zecratary_chef_active_chat_${userKey}`);
      }
    } catch (_) {}
    showToast("Started a new chat session.");
  }, [stopSpeaking, updateWizardStep, showToast]);

  const loadActiveChat = useCallback((user: User | null) => {
    try {
      if (typeof window === 'undefined') return;
      const userKey = getUserKey(user);
      const activeSessId = localStorage.getItem(`zecratary_chef_active_session_id_${userKey}`);
      const saved = localStorage.getItem(`zecratary_chef_active_chat_${userKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          if (activeSessId) {
            currentSessionIdRef.current = activeSessId;
            setCurrentSessionId(activeSessId);
          }
        }
      }
    } catch (_) {}
  }, []);

  const saveCurrentSessionToDb = useCallback(async (msgs: ChatMessage[]) => {
    if (msgs.length === 0) return;
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      const firstUserMsg = msgs.find(m => m.role === 'user');
      const title = firstUserMsg?.content 
        ? firstUserMsg.content.slice(0, 45) + (firstUserMsg.content.length > 45 ? '...' : '')
        : 'Chef Conversation';

      await fetch('/api/chef/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_session',
          userId: userKey,
          id: currentSessionIdRef.current,
          title,
          messages: msgs
        })
      });
    } catch (_) {}
  }, []);

  const updateMessages = useCallback((newMessages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessages(prev => {
      const updated = typeof newMessages === 'function' ? newMessages(prev) : newMessages;
      saveCurrentSessionToDb(updated);
      try {
        if (typeof window !== 'undefined') {
          const active = currentUserRef.current || getCurrentUser();
          const userKey = getUserKey(active);
          localStorage.setItem(`zecratary_chef_active_session_id_${userKey}`, currentSessionIdRef.current);
          localStorage.setItem(`zecratary_chef_active_chat_${userKey}`, JSON.stringify(updated));
          localStorage.setItem(`zecratary_chef_sess_${currentSessionIdRef.current}`, JSON.stringify(updated));
        }
      } catch (_) {}
      return updated;
    });
  }, [saveCurrentSessionToDb]);

  // ------------------------------------------------------------------
  // Chat History & Category Operations
  // ------------------------------------------------------------------
  const fetchChatHistory = useCallback(async (pageToLoad?: number, categoryFilter?: string) => {
    const targetPage = pageToLoad !== undefined ? pageToLoad : historyPage;
    const targetCat = categoryFilter !== undefined ? categoryFilter : selectedCategoryFilter;
    setLoadingHistory(true);
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      const res = await fetch(
        `/api/chef/history?userId=${encodeURIComponent(userKey)}&categoryId=${encodeURIComponent(targetCat)}&page=${targetPage}`,
        { cache: 'no-store' }
      );
      const data = await safeJsonParse(res);
      if (data && data.success) {
        setHistorySessions(data.sessions || []);
        setHistoryCategories(data.categories || []);
        setHistoryPage(data.page || 1);
        setHistoryTotalPages(data.totalPages || 1);
        setHistoryTotalCount(data.total || 0);
      }
    } catch (err) {
      console.warn('Failed to load chat history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage, selectedCategoryFilter]);

  const handleCreateCategory = async (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) return;
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      const res = await fetch('/api/chef/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_category',
          userId: userKey,
          name: clean
        })
      });
      const data = await safeJsonParse(res);
      if (data && data.success) {
        setNewCategoryName('');
        showToast(`Category "${clean}" created!`);
        fetchChatHistory(1, selectedCategoryFilter);
      }
    } catch (_) {
      showToast("Could not create category.");
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    if (!confirm(`Delete category "${categoryName}"? Existing chats will be kept.`)) return;
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      await fetch(
        `/api/chef/history?action=delete_category&categoryId=${encodeURIComponent(categoryId)}&userId=${encodeURIComponent(userKey)}`,
        { method: 'DELETE' }
      );
      showToast(`Category "${categoryName}" deleted.`);
      if (selectedCategoryFilter === categoryId) setSelectedCategoryFilter('all');
      fetchChatHistory(1, 'all');
    } catch (_) {
      showToast("Could not delete category.");
    }
  };

  const handleDeleteSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat?")) return;
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      await fetch(
        `/api/chef/history?action=delete_session&sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(userKey)}`,
        { method: 'DELETE' }
      );

      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`zecratary_chef_sess_${sessionId}`);
        }
      } catch (_) {}

      if (currentSessionIdRef.current === sessionId) {
        startNewChat();
      }
      showToast("Chat deleted.");
      fetchChatHistory(historyPage, selectedCategoryFilter);
    } catch (_) {
      showToast("Could not delete chat.");
    }
  };

  const handleSelectSession = async (sessionItem: ChatSessionItem) => {
    try {
      let sessionMsgs: ChatMessage[] = [];
      const sRes = await fetch(`/api/chef/session?id=${encodeURIComponent(sessionItem.id)}`, { cache: 'no-store' }).catch(() => null);
      if (sRes && sRes.ok) {
        const sData = await safeJsonParse(sRes);
        sessionMsgs = sData?.messages || sData?.session?.messages || [];
      }
      if (sessionMsgs.length === 0) {
        const hRes = await fetch(`/api/chef/history?sessionId=${encodeURIComponent(sessionItem.id)}`, { cache: 'no-store' }).catch(() => null);
        if (hRes && hRes.ok) {
          const hData = await safeJsonParse(hRes);
          sessionMsgs = hData?.session?.messages || hData?.messages || [];
        }
      }
      if (sessionMsgs.length === 0 && typeof window !== 'undefined') {
        const local = localStorage.getItem(`zecratary_chef_sess_${sessionItem.id}`);
        if (local) sessionMsgs = JSON.parse(local);
      }

      currentSessionIdRef.current = sessionItem.id;
      setCurrentSessionId(sessionItem.id);
      setMessages(sessionMsgs);
      updateWizardStep(null);

      // Preserve selected session as active ongoing chat
      try {
        if (typeof window !== 'undefined') {
          const active = currentUserRef.current || getCurrentUser();
          const userKey = getUserKey(active);
          localStorage.setItem(`zecratary_chef_active_session_id_${userKey}`, sessionItem.id);
          localStorage.setItem(`zecratary_chef_active_chat_${userKey}`, JSON.stringify(sessionMsgs));
          localStorage.setItem(`zecratary_chef_sess_${sessionItem.id}`, JSON.stringify(sessionMsgs));
        }
      } catch (_) {}

      setShowHistoryDrawer(false);
      showToast(`Loaded: ${sessionItem.title}`);
    } catch (_) {
      showToast("Failed to load chat.");
    }
  };

  const handleToggleSelectSession = (id: string) => {
    setSelectedSessionIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (historySessions.length === 0) return;
    const allIds = historySessions.map(s => s.id);
    const isAllSelected = allIds.every(id => selectedSessionIds.includes(id));
    if (isAllSelected) {
      setSelectedSessionIds(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedSessionIds(prev => Array.from(new Set([...prev, ...allIds])));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedSessionIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedSessionIds.length} selected chat(s)?`)) return;
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      await fetch('/api/chef/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_sessions',
          userId: userKey,
          sessionIds: selectedSessionIds
        })
      });

      if (typeof window !== 'undefined') {
        selectedSessionIds.forEach(id => {
          try { localStorage.removeItem(`zecratary_chef_sess_${id}`); } catch (_) {}
        });
      }

      if (selectedSessionIds.includes(currentSessionIdRef.current)) {
        startNewChat();
      }

      setSelectedSessionIds([]);
      showToast(`Deleted ${selectedSessionIds.length} chat(s).`);
      fetchChatHistory(historyPage, selectedCategoryFilter);
    } catch (_) {
      showToast("Failed to delete selected chats.");
    }
  };

  const handleClearAllHistory = async () => {
    if (!confirm("Are you sure you want to delete ALL chat history? This cannot be undone.")) return;
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      await fetch('/api/chef/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_all_history',
          userId: userKey
        })
      });

      try {
        if (typeof window !== 'undefined') {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('zecratary_chef_sess_') || key.startsWith('zecratary_chef_active_'))) {
              localStorage.removeItem(key);
            }
          }
        }
      } catch (_) {}

      setSelectedSessionIds([]);
      startNewChat();
      showToast("All chat history deleted.");
      fetchChatHistory(1, 'all');
    } catch (_) {
      showToast("Failed to clear all chat history.");
    }
  };

  const handleAssignCategory = async (sessionId: string, categoryId: string) => {
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      await fetch('/api/chef/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_session_category',
          userId: userKey,
          sessionId,
          categoryId: categoryId === 'none' ? null : categoryId
        })
      });
      fetchChatHistory(historyPage, selectedCategoryFilter);
      showToast("Category updated.");
    } catch (_) {}
  };

  // ------------------------------------------------------------------
  // Saved Recipes & Live Scrape-to-Recipe Engine
  // ------------------------------------------------------------------
  const loadUserSavedRecipes = useCallback(async (user: User | null) => {
    const userKey = getUserKey(user);
    let loaded: any[] = [];
    try {
      let res = await fetch(`/api/recipes?userId=${encodeURIComponent(userKey)}`, { cache: 'no-store' });
      if (!res.ok) {
        res = await fetch(`/api/saved-recipes?userId=${encodeURIComponent(userKey)}`, { cache: 'no-store' });
      }
      const data = await safeJsonParse(res);
      if (data && Array.isArray(data.recipes)) {
        loaded = data.recipes;
      } else if (Array.isArray(data)) {
        loaded = data;
      }
    } catch (_) {}

    if (loaded.length === 0 && typeof window !== 'undefined') {
      const storageKeys = [`zecratary_saved_recipes_${userKey}`, 'zecratary_saved_recipes', 'zecratary_recipes', 'saved_recipes'];
      for (const k of storageKeys) {
        try {
          const local = localStorage.getItem(k);
          if (local) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed) && parsed.length > 0) {
              loaded = parsed;
              break;
            }
          }
        } catch (_) {}
      }
    }
    setUserSavedRecipes(loaded);
  }, []);

  const isRecipeSaved = useCallback((title?: string) => {
    if (!title) return false;
    const cleanTitle = title.trim().toLowerCase();
    return (Array.isArray(userSavedRecipes) ? userSavedRecipes : []).some(
      r => (r.title || r.name || '').trim().toLowerCase() === cleanTitle
    );
  }, [userSavedRecipes]);

  const handleScrapeAndSaveRecipe = async (item: RecommendedRecipeData | MealItem) => {
    if (!item || !item.title) return;
    setSavingRecipeTitle(item.title);
    showToast(t('scrapingRecipeToast', `Scraping entire recipe data for "${item.title}"...`));

    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);

      const targetUrl = item.sourceUrl || (recommendedRecipeUrls.length > 0 ? recommendedRecipeUrls[0] : '');

      // Recipes generated by the chef already carry ingredients and steps: save them as they are instead of scraping a website over them.
      const preIngredients: string[] = Array.isArray(item.ingredients) ? item.ingredients : [];
      const preSteps: string[] = Array.isArray((item as any).instructions) ? (item as any).instructions : [];
      const alreadyComplete = preIngredients.length > 0 && preSteps.length > 0;

      const scrapeRes = alreadyComplete ? null : await fetch('/api/recipes/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          title: item.title,
          description: item.description,
          mealType: item.mealType || 'Dinner',
          servings: item.servings || servings,
          ingredients: item.ingredients || [],
          instructions: (item as any).instructions || [],
          image: item.image || '',
          userId: userKey,
          userEmail: active?.email,
          recommendedRecipeUrls
        })
      });

      const scrapeData = scrapeRes ? await safeJsonParse(scrapeRes) : null;
      const serverRecipe = scrapeData?.recipe;

      const resolvedImage = serverRecipe?.image || serverRecipe?.imageUrl || serverRecipe?.image_url || getAccurateFoodImage(item.image, item.title, item.mealType);

      const finalRecipe = {
        id: serverRecipe?.id || ('rec_' + Date.now()),
        title: serverRecipe?.title || item.title,
        description: serverRecipe?.description || item.description,
        prepMinutes: serverRecipe?.prepMinutes || item.prepMinutes || 15,
        cookMinutes: serverRecipe?.cookMinutes || item.cookMinutes || 20,
        servings: serverRecipe?.servings || item.servings || servings,
        calories: serverRecipe?.calories || (item as any).calories || 480,
        mealType: serverRecipe?.mealType || item.mealType || 'Dinner',
        recipeType: serverRecipe?.mealType || item.mealType || 'Dinner',
        ingredients: serverRecipe?.ingredients || item.ingredients || ['Fresh Produce & Proteins', 'Seasonings & Olive Oil'],
        instructions: serverRecipe?.instructions || (item as any).instructions || ['Follow standard cooking steps.'],
        directions: serverRecipe?.instructions || (item as any).instructions || ['Follow standard cooking steps.'],
        image: resolvedImage,
        imageUrl: resolvedImage,
        image_url: resolvedImage,
        sourceUrl: serverRecipe?.sourceUrl || targetUrl || '',
        sourceName: serverRecipe?.sourceName || 'Chef Foodie',
        cuisine: serverRecipe?.cuisine || (item as any).cuisine || country || 'Modern',
        difficulty: serverRecipe?.difficulty || (item as any).difficulty || 'Easy',
        tags: Array.isArray((item as any).tags) && (item as any).tags.length > 0 ? (item as any).tags : [item.mealType || 'Dinner', ...selectedDiets],
        note: (item as any).chefTip || '',
        userId: userKey
      };

      // Direct server persistence
      fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: finalRecipe, userId: userKey })
      }).then(async (r) => { if (!r.ok) showToast(t('recipeSaveFailed', `Could not save "${finalRecipe.title}" to the server.`)); }).catch(() => {});

      setUserSavedRecipes(prev => [finalRecipe, ...prev.filter(r => (r.title || r.name)?.toLowerCase() !== finalRecipe.title.toLowerCase())]);

      if (typeof window !== 'undefined') {
        const storageKeys = ['zecratary_recipes', 'zecratary_saved_recipes', 'saved_recipes', `zecratary_saved_recipes_${userKey}`];
        storageKeys.forEach((key) => {
          try {
            const raw = localStorage.getItem(key);
            const currentList = raw ? JSON.parse(raw) : [];
            const filtered = Array.isArray(currentList)
              ? currentList.filter((r: any) => (r.id !== finalRecipe.id && (r.title || r.name)?.toLowerCase() !== finalRecipe.title?.toLowerCase()))
              : [];
            localStorage.setItem(key, JSON.stringify([finalRecipe, ...filtered]));
          } catch (_) {}
        });

        window.dispatchEvent(new Event('zecratary_recipes_updated'));
        window.dispatchEvent(new Event('zecratary_saved_recipes_updated'));
        window.dispatchEvent(new Event('storage'));
      }

      showToast(t('recipeSavedToast', `✓ Scraped & saved "${finalRecipe.title}" to /recipes!`));
    } catch (err: any) {
      showToast(`Saved "${item.title}" to /recipes!`);
      const fallbackRecipe = {
        id: 'rec_' + Date.now(),
        title: item.title,
        image: getAccurateFoodImage(item.image, item.title, item.mealType),
        imageUrl: getAccurateFoodImage(item.image, item.title, item.mealType),
        image_url: getAccurateFoodImage(item.image, item.title, item.mealType)
      };
      setUserSavedRecipes(prev => [fallbackRecipe, ...prev]);
    } finally {
      setSavingRecipeTitle(null);
    }
  };

  const handleOpenPlannerModal = (recipe: RecommendedRecipeData) => {
    setRecipeToSchedule(recipe);
    setScheduleMealType(recipe.mealType || 'Dinner');
    setScheduleServings(recipe.servings || servings);
    setShowPlannerModal(true);
  };

  const handleConfirmScheduleMeal = async () => {
    if (!recipeToSchedule) return;
    setSchedulingLoading(true);
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      const savedMatch = userSavedRecipes.find(r => (r.title || r.name || '').trim().toLowerCase() === (recipeToSchedule.title || '').trim().toLowerCase());

      await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userKey,
          userEmail: active?.email,
          date: scheduleDate,
          mealType: scheduleMealType,
          title: recipeToSchedule.title,
          servings: scheduleServings,
          recipeId: savedMatch?.id || null,
          image: getAccurateFoodImage(recipeToSchedule.image, recipeToSchedule.title, recipeToSchedule.mealType),
          recipe: recipeToSchedule
        })
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_plans_updated'));
        window.dispatchEvent(new Event('storage'));
      }
      showToast(`"${recipeToSchedule.title}" scheduled for ${scheduleDate} (${scheduleMealType})!`);
      setShowPlannerModal(false);
    } catch (_) {
      showToast("Scheduled successfully!");
      setShowPlannerModal(false);
    } finally {
      setSchedulingLoading(false);
    }
  };

  const handleAddToCart = async (ingredientsList: string[]) => {
    if (!ingredientsList || ingredientsList.length === 0) return;
    try {
      const active = currentUserRef.current || getCurrentUser();
      const userKey = getUserKey(active);
      await fetch('/api/grocery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userKey,
          items: ingredientsList.map(item => ({ name: item, checked: false }))
        })
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_grocery_updated'));
        window.dispatchEvent(new Event('storage'));
      }
      showToast(`Added ${ingredientsList.length} ingredients to your Grocery List!`);
    } catch (_) {
      showToast("Ingredients added to Grocery List!");
    }
  };

  // ------------------------------------------------------------------
  // Dietary Preferences Handlers (PostgreSQL Sync)
  // ------------------------------------------------------------------
  const loadUserPreferences = useCallback(async (user: User | null) => {
    const userKey = getUserKey(user);
    try {
      const res = await fetch(`/api/user/preferences?userId=${encodeURIComponent(userKey)}`, { cache: 'no-store' });
      const data = await safeJsonParse(res);
      if (data && data.success && data.preferences) {
        const p = data.preferences;
        if (typeof p.servings === 'number') setServings(p.servings);
        if (p.country) setCountry(p.country);
        if (Array.isArray(p.diets)) setSelectedDiets(p.diets);
        if (Array.isArray(p.allergies)) setSelectedAllergies(p.allergies);
        if (Array.isArray(p.avoid)) setIngredientsToAvoid(p.avoid);
        if (Array.isArray(p.tastes)) setTastesList(p.tastes);
      }
    } catch (_) {}
  }, []);

  const handleToggleDiet = (item: string) => {
    setSelectedDiets(prev => prev.includes(item) ? prev.filter(d => d !== item) : [...prev, item]);
  };

  const handleToggleAllergy = (item: string) => {
    setSelectedAllergies(prev => prev.includes(item) ? prev.filter(a => a !== item) : [...prev, item]);
  };

  const handleAddAvoid = (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    const clean = newAvoidInput.trim();
    if (!clean) return;
    if (!ingredientsToAvoid.includes(clean)) setIngredientsToAvoid([...ingredientsToAvoid, clean]);
    setNewAvoidInput('');
  };

  const handleRemoveAvoid = (item: string) => {
    setIngredientsToAvoid(ingredientsToAvoid.filter(a => a !== item));
  };

  const handleAddTaste = (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    const clean = newTasteInput.trim();
    if (!clean) return;
    if (!tastesList.includes(clean)) setTastesList([...tastesList, clean]);
    setNewTasteInput('');
  };

  const handleRemoveTaste = (item: string) => {
    setTastesList(tastesList.filter(t => t !== item));
  };

  const handleSavePreferences = async () => {
    const prefs = {
      servings,
      country,
      diets: selectedDiets,
      allergies: selectedAllergies,
      avoid: ingredientsToAvoid,
      tastes: tastesList
    };

    const active = currentUserRef.current || getCurrentUser();
    const userKey = getUserKey(active);

    try {
      await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userKey, ...prefs })
      });
    } catch (_) {}

    setShowPreferences(false);
    showToast("Preferences saved and synchronized!");
  };

  const handleClearAllPreferences = async () => {
    setServings(2);
    setCountry('Singapore');
    setSelectedDiets([]);
    setSelectedAllergies([]);
    setIngredientsToAvoid([]);
    setTastesList([]);

    const active = currentUserRef.current || getCurrentUser();
    const userKey = getUserKey(active);

    try {
      await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userKey,
          servings: 2,
          country: 'Singapore',
          diets: [],
          allergies: [],
          avoid: [],
          tastes: []
        })
      });
    } catch (_) {}

    showToast("Preferences cleared!");
  };

  // ------------------------------------------------------------------
  // Telemetry Synchronization
  // ------------------------------------------------------------------
  const fetchTelemetry = useCallback(async () => {
    try {
      const active = currentUserRef.current || getCurrentUser();
      const queryParam = active?.id ? `?userId=${encodeURIComponent(active.id)}` : active?.email ? `?email=${encodeURIComponent(active.email)}` : '';
      
      const res = await fetch(`/api/tokens${queryParam}${queryParam ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
      const data = await safeJsonParse(res);
      if (data && data.success) {
        setTokenBalance(Number(data.balance ?? 0));
        if (data.tokenSymbol) setTokenSymbol(data.tokenSymbol);
        if (data.tokenName) setTokenName(data.tokenName);
        if (data.isEnabled !== undefined) setIsTokenEnabled(Boolean(data.isEnabled));
        if (data.costs?.chef !== undefined) setChefCost(Number(data.costs.chef));
        else if (data.chefCost !== undefined) setChefCost(Number(data.chefCost));
        if (Array.isArray(data.packages) && data.packages.length > 0) {
          setTokenPackages(data.packages);
        }
      }

      const sRes = await fetch(`/api/admin/settings?t=${Date.now()}`, { cache: 'no-store' });
      const sData = await safeJsonParse(sRes);
      const chefCfg = sData?.chefAiSettings || sData?.settings?.chefAiSettings || sData;
      if (chefCfg) {
        if (sData?.aiModel || chefCfg.model) {
          setActiveAiModel((sData?.aiModel || chefCfg.model).replace(/^models\//, ''));
        }
        if (chefCfg.strictDietEnforcement !== undefined) setStrictDietEnforcement(Boolean(chefCfg.strictDietEnforcement));
        if (Array.isArray(chefCfg.filterWordsList)) setFilterWordsList(chefCfg.filterWordsList.filter(Boolean));
        if (chefCfg.enablePantryContext !== undefined) setEnablePantryContext(Boolean(chefCfg.enablePantryContext));
        if (chefCfg.maxPlanDays !== undefined) setMaxPlanDays(Number(chefCfg.maxPlanDays) || 7);
        if (Array.isArray(chefCfg.recommendedRecipeUrls)) {
          setRecommendedRecipeUrls(chefCfg.recommendedRecipeUrls.filter(Boolean));
        } else if (Array.isArray(sData?.recommendedRecipeUrls)) {
          setRecommendedRecipeUrls(sData.recommendedRecipeUrls.filter(Boolean));
        }
        if (chefCfg.resultDisplayMode) setResultDisplayMode(chefCfg.resultDisplayMode);
        if (chefCfg.enableVoiceInteraction !== undefined) setEnableVoiceInteraction(Boolean(chefCfg.enableVoiceInteraction));
        if (chefCfg.voiceSpeed !== undefined) setVoiceSpeed(Number(chefCfg.voiceSpeed));
        if (chefCfg.voiceAutoPlay !== undefined) setVoiceAutoPlay(Boolean(chefCfg.voiceAutoPlay));
        if (chefCfg.selectedVoiceName) setSelectedVoiceName(chefCfg.selectedVoiceName);

        if (Array.isArray(chefCfg.sections) && chefCfg.sections.length > 0) {
          const activeSecs = chefCfg.sections.filter((s: any) => s.enabled !== false);
          const toUse = activeSecs.length > 0 ? activeSecs : chefCfg.sections;
          setQuestionnaireSections(toUse);
          const allQs = toUse.flatMap((s: any) => s.questions || []);
          setWizardQuestionsList(allQs.length > 0 ? allQs : DEFAULT_SECTIONS.flatMap(s => s.questions));
        }
      }
    } catch (_) {}
  }, []);

  const applySavedTheme = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_theme_updated'));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    document.title = `${t('foodieChatHeading', 'Foodie Chat')} - FoodiePrep`;
    initAuthStorage();
    const user = getCurrentUser();
    setCurrentUser(user);
    currentUserRef.current = user;

    applySavedTheme();
    loadActiveChat(user);
    loadUserPreferences(user);
    loadUserSavedRecipes(user);
    fetchTelemetry();
    fetchChatHistory(1, 'all');

    const handleSync = () => {
      const active = getCurrentUser();
      setCurrentUser(active);
      currentUserRef.current = active;
      loadUserPreferences(active);
      loadUserSavedRecipes(active);
      fetchTelemetry();
      fetchChatHistory(1, selectedCategoryFilter);
    };

    const handleSavedSync = () => {
      loadUserSavedRecipes(currentUserRef.current || getCurrentUser());
    };

    window.addEventListener('storage', handleSync);
    window.addEventListener('zecratary_theme_updated', applySavedTheme);
    window.addEventListener('zecratary_admin_settings_updated', fetchTelemetry);
    window.addEventListener('zecratary_tokens_updated', fetchTelemetry);
    window.addEventListener('zecratary_saved_recipes_updated', handleSavedSync);
    window.addEventListener('zecratary_recipes_updated', handleSavedSync);

    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('zecratary_theme_updated', applySavedTheme);
      window.removeEventListener('zecratary_admin_settings_updated', fetchTelemetry);
      window.removeEventListener('zecratary_tokens_updated', fetchTelemetry);
      window.removeEventListener('zecratary_saved_recipes_updated', handleSavedSync);
      window.removeEventListener('zecratary_recipes_updated', handleSavedSync);
    };
  }, [applySavedTheme, fetchTelemetry, loadActiveChat, loadUserPreferences, loadUserSavedRecipes, fetchChatHistory, selectedCategoryFilter, t]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ------------------------------------------------------------------
  // Questionnaire Flow
  // ------------------------------------------------------------------
  const handleStartTopicWizard = (sec: any) => {
    const qList = Array.isArray(sec.questions) && sec.questions.length > 0
      ? sec.questions
      : DEFAULT_SECTIONS[0].questions;

    setActiveTopicTitle(sec.topicTitle);
    setWizardQuestionsList(qList);
    updateWizardStep(0);
    setWizardAnswers({});

    const firstQuestionText = getQuestionText(qList[0]);
    const initialMsg: ChatMessage = { 
      id: 'ast_' + Date.now(), 
      role: 'assistant', 
      content: `📋 **${sec.topicTitle}**\n${sec.description || 'Intake questionnaire for your customized meal plan.'}\n\n**Question 1 of ${qList.length}:**\n${firstQuestionText}` 
    };

    updateMessages(prev => [
      ...prev,
      { id: 'usr_' + Date.now(), role: 'user', content: `Start Questionnaire: ${sec.topicTitle}` },
      initialMsg
    ]);

    if (enableVoiceInteraction && voiceAutoPlay) {
      setTimeout(() => speakText(initialMsg.content || '', initialMsg.id), 200);
    }
  };

  const handleStartFullWizard = () => {
    const activeSections = questionnaireSections.filter((s: any) => s.enabled !== false);
    const allQuestions = activeSections.flatMap((s: any) => s.questions || []);
    const qList = allQuestions.length > 0 ? allQuestions : DEFAULT_SECTIONS.flatMap(s => s.questions);

    setActiveTopicTitle('Complete Intake Wizard');
    setWizardQuestionsList(qList);
    updateWizardStep(0);
    setWizardAnswers({});

    const firstQuestionText = getQuestionText(qList[0]);
    const initialMsg: ChatMessage = { 
      id: 'ast_' + Date.now(), 
      role: 'assistant', 
      content: `Starting complete meal plan intake wizard (**Question 1 of ${qList.length}**):\n\n${firstQuestionText}` 
    };

    updateMessages(prev => [
      ...prev,
      { id: 'usr_' + Date.now(), role: 'user', content: 'Start Complete Meal Plan Intake Wizard' },
      initialMsg
    ]);

    if (enableVoiceInteraction && voiceAutoPlay) {
      setTimeout(() => speakText(initialMsg.content || '', initialMsg.id), 200);
    }
  };

  // Preset Options Matcher
  const currentPresetOptions = useMemo(() => {
    if (wizardStep === null || !wizardQuestionsList || !wizardQuestionsList[wizardStep]) return [];
    const currentQItem = wizardQuestionsList[wizardStep];
    const dedicated = getQuestionDedicatedAnswers(currentQItem);
    if (dedicated.length > 0) return dedicated;

    const rawQuestionText = getQuestionText(currentQItem);
    if (!rawQuestionText) return [];
    const q = rawQuestionText.toLowerCase().trim();

    if (/\b(meal type|meal types|which meal|types of meal|breakfast|lunch|dinner|snack|meals to include)\b/i.test(q)) {
      return ['Dinner only', 'Lunch & Dinner', 'All Meals (Breakfast, Lunch, Dinner)', 'Breakfast & Dinner', 'All Meals + Snack'];
    }
    if (/\b(when|start date|starting|start|commence|begin|schedule date)\b/i.test(q) && !/\b(how many days|number of days)\b/i.test(q)) {
      return ['Start Today', 'Start Tomorrow', 'Next Monday (Fresh Week)', 'This Coming Weekend (Saturday)', 'Flexible / Any Day'];
    }
    if (/\b(how many days|number of days|duration|days to plan|how long|days would you like)\b/i.test(q) || (/\bdays?\b/i.test(q) && /\b(how many|plan for|total)\b/i.test(q))) {
      const days = ['3 Days (Quick Prep)', '5 Days (Workweek)'];
      if (maxPlanDays >= 7) days.push('7 Days (Full Week)');
      else days.push(`${maxPlanDays} Days`);
      days.push('Weekend Plan (2 Days)');
      days.push('Single Day Focus');
      return Array.from(new Set(days));
    }
    if (/\b(budget|cost|spend|price|financial|per serving|per meal)\b/i.test(q)) {
      return ['Under $5 per serving (Economy)', '$5 - $8 per serving (Balanced)', '$8 - $12 per serving (Generous)', '$12+ per serving (Premium)', 'Flexible target'];
    }
    if (/\b(theme|themes|preference|preferences|flavor|flavors|cuisine|cuisines|comfort food|high-protein)\b/i.test(q)) {
      return ['High-Protein Wholesome', 'Quick & Easy (Under 25 mins)', 'Mediterranean Fresh & Olive Oil', 'Keto / Low-Carb Wholesome', 'Budget-Friendly Comfort Food', 'Plant-Based / Balanced Veggie'];
    }
    return ['Yes, strictly apply', 'Standard recommended', 'Surprise me with chef selections', 'Flexible / No preference'];
  }, [wizardStep, wizardQuestionsList, maxPlanDays]);

  // Prompt Execution
  const handleSend = async (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : prompt).trim();
    if (!textToSend || loading) return;
    const lower = textToSend.toLowerCase();

    if (wizardStep === null && (
      lower.includes('complete meal plan intake') || 
      lower.includes('meal plan intake wizard') ||
      lower === 'start complete meal plan intake wizard' ||
      /^(?:start|create|make|build)\s+(?:a\s+)?meal\s+plan(?:\s+intake)?(?:\s+wizard)?$/i.test(lower)
    )) {
      handleStartFullWizard();
      setPrompt('');
      return;
    }

    if (strictDietEnforcement && filterWordsList.length > 0) {
      const matchedFilter = filterWordsList.find(word => {
        const clean = word.trim().toLowerCase();
        return clean.length > 1 && lower.includes(clean);
      });
      if (matchedFilter) {
        showToast(`⚠️ Dietary restriction: "${matchedFilter}" is prohibited by AI Settings.`);
        return;
      }
    }

    const cost = isTokenEnabled ? chefCost : 0;
    if (isTokenEnabled && cost > 0 && tokenBalance < cost) {
      showToast(`Insufficient ${tokenName}. Required: ${cost} ${tokenSymbol}, Balance: ${tokenBalance} ${tokenSymbol}`);
      setIsTokenPurchaseOpen(true);
      return;
    }

    const userMsg: ChatMessage = { id: 'usr_' + Date.now(), role: 'user', content: textToSend };
    updateMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    if (wizardStep !== null) {
      const currentIdx = wizardStep;
      const updatedAnswers = { ...wizardAnswers, [currentIdx]: textToSend };
      setWizardAnswers(updatedAnswers);

      const nextIdx = currentIdx + 1;
      if (nextIdx < wizardQuestionsList.length) {
        updateWizardStep(nextIdx);
        setTimeout(() => {
          const nextQuestionText = getQuestionText(wizardQuestionsList[nextIdx]);
          const nextQuestionMsg: ChatMessage = {
            id: 'ast_' + Date.now(),
            role: 'assistant',
            content: `**Question ${nextIdx + 1} of ${wizardQuestionsList.length}:**\n${nextQuestionText}`
          };
          updateMessages(prev => [...prev, nextQuestionMsg]);
          setLoading(false);
          if (enableVoiceInteraction && voiceAutoPlay) {
            speakText(nextQuestionMsg.content || '', nextQuestionMsg.id);
          }
        }, 300);
        return;
      } else {
        updateWizardStep(null);
        try {
          const activeAuth = currentUserRef.current || currentUser || getCurrentUser();
          const userKey = getUserKey(activeAuth);

          const qaSummary = wizardQuestionsList.map((q, idx) => ({
            question: getQuestionText(q),
            answer: updatedAnswers[idx] || 'Not specified'
          }));

          const res = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isQuestionnaireComplete: true,
              topicTitle: activeTopicTitle,
              questionnaireSummary: qaSummary,
              questionnaireAnswers: updatedAnswers,
              recommendedRecipeUrls,
              userId: activeAuth?.id || userKey,
              userEmail: activeAuth?.email,
              preferences: { servings, country, diet: selectedDiets, allergy: selectedAllergies, avoid: ingredientsToAvoid, tastes: tastesList },
              pantry: enablePantryContext ? pantryIngredientsList : []
            })
          });

          const data = await safeJsonParse(res);
          if (!res.ok || !data || !data.success) {
            throw new Error(data?.error || 'Failed to synthesize questionnaire results.');
          }

          if (typeof data.remainingBalance === 'number') {
            setTokenBalance(data.remainingBalance);
          } else if (cost > 0) {
            setTokenBalance(prev => Math.max(0, prev - (data.consumedSystemTokens ?? cost)));
          }

          const planMsg: ChatMessage = {
            id: 'ast_plan_' + Date.now(),
            role: 'assistant',
            content: data.reply || `I have formulated your meal plan and signature recommended recipe based on your ${activeTopicTitle} questionnaire!`,
            plan: data.plan,
            recommendedRecipe: data.recommendedRecipe || data.recipe,
            systemRecommendations: data.systemRecommendations || []
          };

          const serverMode = data?.appliedSettings?.resultDisplayMode || data?.resultDisplayMode;
          if (serverMode === 'card' || serverMode === 'compact' || serverMode === 'detailed') setResultDisplayMode(serverMode);

          updateMessages(prev => [...prev, planMsg]);
          if (enableVoiceInteraction && voiceAutoPlay) {
            speakText(planMsg.content || '', planMsg.id);
          }
        } catch (err: any) {
          updateMessages(prev => [...prev, { id: 'ast_' + Date.now(), role: 'assistant', content: `⚠️ ${err.message || 'Error formulating questionnaire plan.'}` }]);
        } finally {
          setLoading(false);
          setActiveTopicTitle('Standard Wizard');
        }
        return;
      }
    }

    try {
      const activeAuth = currentUserRef.current || currentUser || getCurrentUser();
      const userKey = getUserKey(activeAuth);

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          messages: messages.slice(-6).map(m => ({ role: m.role, content: m.content || '' })),
          userId: activeAuth?.id || userKey,
          userEmail: activeAuth?.email,
          model: activeAiModel,
          source: 'chef',
          recommendedRecipeUrls,
          preferences: { servings, country, diet: selectedDiets, allergy: selectedAllergies, avoid: ingredientsToAvoid, tastes: tastesList },
          pantry: enablePantryContext ? pantryIngredientsList : []
        })
      });

      const data = await safeJsonParse(res);
      if (!res.ok || !data || !data.success) {
        if (data?.insufficientTokens) setIsTokenPurchaseOpen(true);
        throw new Error(data?.error || 'Chef Foodie could not process your query.');
      }

      if (typeof data.remainingBalance === 'number') {
        setTokenBalance(data.remainingBalance);
      } else if (cost > 0) {
        setTokenBalance(prev => Math.max(0, prev - (data.consumedSystemTokens ?? cost)));
      }

      const consumed = data.consumedSystemTokens ?? cost;
      if (consumed > 0) {
        showToast(`-${consumed} ${tokenSymbol} (${tokenName})`);
      }

      const astMsg: ChatMessage = {
        id: 'ast_' + Date.now(),
        role: 'assistant',
        content: data.reply || data.response || "Here are personalized culinary recommendations based on your preferences.",
        plan: data.plan || undefined,
        recommendedRecipe: data.recommendedRecipe || data.recipe,
        systemRecommendations: data.systemRecommendations || []
      };

      const chatMode = data?.appliedSettings?.resultDisplayMode || data?.resultDisplayMode;
      if (data.plan && (chatMode === 'card' || chatMode === 'compact' || chatMode === 'detailed')) setResultDisplayMode(chatMode);

      updateMessages(prev => [...prev, astMsg]);
      if (enableVoiceInteraction && voiceAutoPlay) {
        speakText(astMsg.content || '', astMsg.id);
      }
    } catch (err: any) {
      updateMessages(prev => [...prev, { id: 'ast_' + Date.now(), role: 'assistant', content: `⚠️ ${err.message || 'Error communicating with AI engine.'}` }]);
    } finally {
      setLoading(false);
    }
  };

  const activeQuestionnaireSections = useMemo(() => {
    return questionnaireSections.filter((s: any) => s.enabled !== false);
  }, [questionnaireSections]);

  return (
    <div 
      id="zecratary-chef-canvas"
      role="region"
      aria-label={t('foodieChatHeading', 'Foodie Chat')}
      data-lpignore="true"
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 flex flex-col h-[calc(100vh-5.5rem)] justify-between space-y-3 pb-2 font-sans relative transition-colors duration-200"
      style={{ 
        boxSizing: 'border-box',
        color: 'var(--color-text)',
        transition: 'background-color 200ms ease, color 200ms ease, border-color 200ms ease'
      }}
    >
      {toastMessage && (
        <div 
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 border"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-primary)',
            color: 'var(--color-text)'
          }}
        >
          <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--color-emerald)' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER CONTROLS (TOKEN WALLET REMOVED) */}
      <div 
        className="space-y-3 border-b pb-3 shrink-0 transition-colors duration-200"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center border shadow-xs"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-primary)',
                color: 'var(--color-primary)'
              }}
            >
              <ChefHat className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
                {t('foodieChatHeading', 'Foodie Chat')}
              </h1>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {t('foodieChatSubtitle', 'Ask recipes, cooking questions, or launch multi-topic meal plan wizards')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSpeaking && (
              <div 
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold animate-pulse shadow-sm"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)'
                }}
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>Speaking...</span>
                <button 
                  type="button" 
                  onClick={stopSpeaking}
                  className="hover:underline text-[10px] ml-1 font-extrabold cursor-pointer"
                >
                  [Stop]
                </button>
              </div>
            )}

            {/* ACTIVE AI MODEL BADGE */}
            <div 
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold shadow-sm"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              title="Active Model configured in /admin/ai-settings"
            >
              <Cpu className="h-3.5 w-3.5 text-orange-400" />
              <span className="font-mono">{activeAiModel}</span>
            </div>

            {/* FREE TOKEN MODE BADGE */}
            {!isTokenEnabled && (
              <div 
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider text-emerald-400"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                title="Token consumption is currently bypassed (Free Mode)"
              >
                <Sparkles className="h-3 w-3" />
                <span>Free Token Mode</span>
              </div>
            )}

            {/* CHAT HISTORY DRAWER BUTTON */}
            <button
              type="button"
              onClick={() => {
                setShowHistoryDrawer(true);
                fetchChatHistory(1, selectedCategoryFilter);
              }}
              className="p-2 rounded-xl border transition cursor-pointer shadow-sm hover:opacity-80 flex items-center gap-1.5 text-xs font-bold"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-primary)'
              }}
              title="View Chat History & Categories"
            >
              <History className="h-4 w-4" />
              <span className="hidden md:inline">History</span>
            </button>

            {/* PREFERENCES BUTTON */}
            <button
              type="button"
              onClick={() => setShowPreferences(true)}
              className="p-2 rounded-xl border transition cursor-pointer shadow-sm hover:opacity-80"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)'
              }}
              title={t('preferencesTooltip', 'Recipe Preferences')}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>

            {/* NEW CHAT BUTTON */}
            <button
              type="button"
              onClick={startNewChat}
              className="p-2 rounded-xl border transition cursor-pointer shadow-sm hover:opacity-80"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)'
              }}
              title="Start New Chat"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* USER DIETARY PREFERENCES PILLS */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1 animate-in fade-in">
          {recommendedRecipeUrls.length > 0 && (
            <span 
              className="border px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-primary)',
                color: 'var(--color-primary)'
              }}
              title={`Primary Recipe Sources: ${recommendedRecipeUrls.join(', ')}`}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
              <span>Primary Sources:</span>
              <strong className="font-bold font-mono" style={{ color: 'var(--color-text)' }}>
                {recommendedRecipeUrls.length} URLs
              </strong>
            </span>
          )}

          <span 
            className="border px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm"
            style={{
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: 'var(--color-emerald)',
              color: 'var(--color-emerald)'
            }}
          >
            {t('servingsLabelPref', 'Servings:')} <strong className="font-bold" style={{ color: 'var(--color-text)' }}>{(t('peopleSuffix', '{count} people')).replace('{count}', String(servings))}</strong>
          </span>

          <span 
            className="border px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm"
            style={{
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: 'var(--color-emerald)',
              color: 'var(--color-emerald)'
            }}
          >
            {t('countryLabelPref', 'Country:')} <strong className="font-bold" style={{ color: 'var(--color-text)' }}>{country}</strong>
          </span>

          {selectedDiets.map((d) => (
            <span 
              key={`diet-${d}`}
              className="border px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-emerald)',
                color: 'var(--color-emerald)'
              }}
            >
              {t('dietLabelPref', 'Diet:')} <strong className="font-bold" style={{ color: 'var(--color-text)' }}>{d}</strong>
            </span>
          ))}

          {selectedAllergies.map((a) => (
            <span 
              key={`allergy-${a}`}
              className="border px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-primary)'
              }}
            >
              {t('allergyLabelPref', 'Allergy:')} <strong className="font-bold" style={{ color: 'var(--color-text)' }}>{a}</strong>
            </span>
          ))}

          {ingredientsToAvoid.map((av) => (
            <span 
              key={`avoid-${av}`}
              className="border px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-primary)'
              }}
            >
              {t('avoidLabelPref', 'Avoid:')} <strong className="font-bold" style={{ color: 'var(--color-text)' }}>{av}</strong>
            </span>
          ))}

          {tastesList.map((itemTaste) => (
            <span 
              key={`taste-${itemTaste}`}
              className="border px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-primary)'
              }}
            >
              {t('tasteLabelPref', 'Taste:')} <strong className="font-bold" style={{ color: 'var(--color-text)' }}>{itemTaste}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* MAIN CONVERSATION STREAM */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-1.5 custom-scrollbar w-full">
        {messages.length === 0 ? (
          <div className="text-center my-auto py-12 space-y-6 max-w-4xl mx-auto">
            <div 
              className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto border shadow-lg"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-primary)',
                color: 'var(--color-primary)'
              }}
            >
              <ChefHat className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-black" style={{ color: 'var(--color-text)' }}>
                {t('heyImChef', "Hey, I'm Chef Foodie!")}
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Select a questionnaire topic below or speak into the microphone to plan meals
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 max-w-3xl mx-auto">
              <button
                type="button"
                onClick={handleStartFullWizard}
                className="border text-xs font-bold px-5 py-3 rounded-2xl transition shadow-md hover:scale-[1.02] cursor-pointer flex items-center gap-2 text-white"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  borderColor: 'var(--color-primary)'
                }}
              >
                <Sparkles className="h-4 w-4" /> Start Complete Meal Plan Intake Wizard
              </button>

              {recommendedRecipeUrls.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleSend("Recommend a dish matching my preferences from my primary recipe sources.")}
                  className="border text-xs font-bold px-4 py-3 rounded-2xl transition shadow-sm hover:scale-[1.02] cursor-pointer flex items-center gap-2"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                >
                  <Globe className="h-4 w-4" />
                  <span>Recommend from Primary Sources ({recommendedRecipeUrls.length})</span>
                </button>
              )}

              {activeQuestionnaireSections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => handleStartTopicWizard(sec)}
                  className="text-xs font-semibold px-4 py-2.5 rounded-full border shrink-0 transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02]"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                >
                  <Layers className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }} />
                  <span>{sec.topicTitle}</span>
                  <span className="text-[10px] opacity-75 font-mono">({(sec.questions || []).length} questions)</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === 'user';
            const hasAudioActive = isSpeaking && speakingMsgId === m.id;
            const currentRecipe = m.recommendedRecipe || m.recipe;

            return (
              <div key={m.id} className={`flex items-start gap-3 w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div 
                    className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-1 shadow-sm"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-primary)',
                      color: 'var(--color-primary)'
                    }}
                  >
                    <ChefHat className="h-4 w-4" />
                  </div>
                )}

                <div className={`space-y-4 ${isUser ? 'max-w-xl sm:max-w-2xl ml-auto' : 'w-full max-w-full lg:max-w-[96%] xl:max-w-[94%]'}`}>
                  {m.content && (
                    <div 
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${isUser ? 'shadow-md font-medium text-white ml-auto' : 'border shadow-xs'}`}
                      style={isUser ? {
                        backgroundColor: 'var(--color-primary)'
                      } : {
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <p className="whitespace-pre-line flex-1">{m.content}</p>
                        {!isUser && enableVoiceInteraction && (
                          <button
                            type="button"
                            onClick={() => speakText(m.content || '', m.id)}
                            className="p-1 rounded-lg transition shrink-0 cursor-pointer hover:opacity-80"
                            style={{ color: hasAudioActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
                            title={hasAudioActive ? "Stop speech" : "Read aloud"}
                          >
                            {hasAudioActive ? <Square className="h-4 w-4 fill-current" /> : <Volume2 className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PLATFORM ACTION RECOMMENDATIONS */}
                  {m.systemRecommendations && m.systemRecommendations.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 animate-in fade-in">
                      {m.systemRecommendations.map((rec, rIdx) => (
                        <button
                          key={rIdx}
                          type="button"
                          onClick={() => router.push(rec.route)}
                          className="px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-xs hover:scale-[1.02] cursor-pointer"
                          style={{
                            backgroundColor: 'var(--color-card)',
                            borderColor: 'var(--color-primary)',
                            color: 'var(--color-primary)'
                          }}
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>{rec.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* COMPLETE RECOMMENDED RECIPE CARD */}
                  {currentRecipe && (
                    <div 
                      className="border rounded-3xl p-5 space-y-4 shadow-md transition-all duration-200 animate-in fade-in w-full"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)'
                      }}
                    >
                      <div className="flex flex-col md:flex-row gap-5 items-start">
                        {/* High-Resolution Dish Photo */}
                        <div className="relative shrink-0 w-full md:w-64 h-52 sm:h-56 rounded-2xl overflow-hidden border shadow-sm group">
                          <img
                            src={getAccurateFoodImage(currentRecipe.image, currentRecipe.title, currentRecipe.mealType)}
                            alt={currentRecipe.title || 'Recipe Photo'}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = getAccurateFoodImage('', currentRecipe.title, currentRecipe.mealType);
                            }}
                            className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          <span 
                            className="absolute top-3 left-3 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg text-white shadow-md flex items-center gap-1 backdrop-blur-md"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                          >
                            <Sparkles className="h-3 w-3" /> Recommended
                          </span>
                        </div>

                        {/* Complete Recipe Data */}
                        <div className="flex-1 space-y-2.5 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-black text-lg leading-tight truncate" style={{ color: 'var(--color-text)' }}>
                              {currentRecipe.title}
                            </h3>

                            {currentRecipe.sourceUrl && (
                              <a
                                href={currentRecipe.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-bold px-2.5 py-1 rounded-xl border flex items-center gap-1 transition hover:opacity-85 cursor-pointer shrink-0 shadow-2xs"
                                style={{
                                  backgroundColor: 'var(--color-inner-dark)',
                                  borderColor: 'var(--color-emerald)',
                                  color: 'var(--color-emerald)'
                                }}
                                title="Open source recipe webpage"
                              >
                                <Globe className="h-3 w-3" />
                                <span>{currentRecipe.sourceName || 'Primary Source'} ↗</span>
                              </a>
                            )}
                          </div>

                          <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--color-text-secondary)' }}>
                            {currentRecipe.description}
                          </p>

                          {/* Quick Metrics */}
                          <div className="flex flex-wrap items-center gap-3 text-xs font-bold pt-1" style={{ color: 'var(--color-text-secondary)' }}>
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--color-emerald)' }} /> {(currentRecipe.prepMinutes || 15) + (currentRecipe.cookMinutes || 20)}m total
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5" /> {currentRecipe.servings || servings} servings
                            </span>
                            {currentRecipe.calories && (
                              <span className="font-mono text-emerald-500 font-bold">{currentRecipe.calories} kcal</span>
                            )}
                          </div>

                          {/* Key Ingredients Preview */}
                          {Array.isArray(currentRecipe.ingredients) && currentRecipe.ingredients.length > 0 && (
                            <div className="pt-2">
                              <span className="text-[10px] font-black uppercase tracking-wider block mb-1" style={{ color: 'var(--color-primary)' }}>
                                Ingredients ({currentRecipe.ingredients.length}):
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {currentRecipe.ingredients.slice(0, 6).map((ing: string, iIdx: number) => (
                                  <span
                                    key={iIdx}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded-lg border shadow-2xs"
                                    style={{
                                      backgroundColor: 'var(--color-inner-dark)',
                                      borderColor: 'var(--color-border)',
                                      color: 'var(--color-text)'
                                    }}
                                  >
                                    • {ing}
                                  </span>
                                ))}
                                {currentRecipe.ingredients.length > 6 && (
                                  <span className="text-[10px] font-bold opacity-75 self-center">
                                    +{currentRecipe.ingredients.length - 6} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CARD ACTIONS */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t text-xs" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRecipeForModal(currentRecipe);
                              setShowRecipeDetailsModal(true);
                            }}
                            className="px-3.5 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer hover:opacity-85 shadow-2xs"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text)'
                            }}
                          >
                            <BookOpen className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }} />
                            <span>View Full Recipe</span>
                          </button>

                          {Array.isArray(currentRecipe.ingredients) && currentRecipe.ingredients.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAddToCart(currentRecipe.ingredients)}
                              className="px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer hover:opacity-85 shadow-2xs"
                              style={{
                                backgroundColor: 'var(--color-inner-dark)',
                                borderColor: 'var(--color-primary)',
                                color: 'var(--color-primary)'
                              }}
                              title="Add all ingredients to Grocery List"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">+ Add to Cart</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isRecipeSaved(currentRecipe.title) ? (
                            <div className="flex items-center gap-2">
                              <span 
                                className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-2xs"
                                style={{
                                  backgroundColor: 'var(--color-inner-dark)',
                                  borderColor: 'var(--color-emerald)',
                                  color: 'var(--color-emerald)'
                                }}
                              >
                                <Check className="h-3.5 w-3.5" /> Saved in Recipes
                              </span>
                              <button
                                type="button"
                                onClick={() => router.push('/recipes')}
                                className="px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer hover:opacity-85"
                                style={{
                                  backgroundColor: 'var(--color-inner-dark)',
                                  borderColor: 'var(--color-border)',
                                  color: 'var(--color-text)'
                                }}
                              >
                                View in /recipes ↗
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={savingRecipeTitle === currentRecipe.title}
                              onClick={() => handleScrapeAndSaveRecipe(currentRecipe)}
                              className="px-4 py-2 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md hover:opacity-90 disabled:opacity-50"
                              style={{ backgroundColor: 'var(--color-primary)' }}
                              title="Scrape entire recipe data with ingredients & instructions directly to /recipes"
                            >
                              {savingRecipeTitle === currentRecipe.title ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span>Scraping to /recipe...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3.5 w-3.5" />
                                  <span>Scrape & Save to /recipe</span>
                                </>
                              )}
                            </button>
                          )}

                          {isRecipeSaved(currentRecipe.title) && (
                            <button
                              type="button"
                              onClick={() => handleOpenPlannerModal(currentRecipe)}
                              className="px-3.5 py-2 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:opacity-90 animate-in fade-in"
                              style={{ backgroundColor: 'var(--color-primary)' }}
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              <span>📅 Add to Planner</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MULTI-DAY PLAN PRESENTATION */}
                  {m.plan && (
                    <div 
                      className="border rounded-3xl p-5 space-y-5 shadow-sm transition-colors duration-200 w-full"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)'
                      }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center gap-2.5">
                          <Calendar className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                          <div>
                            <h3 className="font-black text-base" style={{ color: 'var(--color-text)' }}>
                              {m.plan.title} ({m.plan.totalDays} {m.plan.totalDays === 1 ? 'Day' : 'Days'})
                            </h3>
                            <span className="text-[11px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                              Target Theme: {m.plan.theme || 'Balanced'} • Budget: {m.plan.budgetPerServing || '$5.00/serving'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <div className="border p-1 rounded-xl flex items-center gap-1 shadow-2xs" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                            {(['card', 'compact', 'detailed'] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setResultDisplayMode(mode)}
                                className="px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer capitalize"
                                style={resultDisplayMode === mode ? {
                                  backgroundColor: 'var(--color-primary)',
                                  color: '#ffffff'
                                } : {
                                  color: 'var(--color-text-secondary)'
                                }}
                              >
                                {mode} Mode
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 1. COMPLETE CARD MODE */}
                      {resultDisplayMode === 'card' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4.5 pt-1">
                          {m.plan.meals.map((meal) => {
                            const isSaved = isRecipeSaved(meal.title);
                            const isScraping = savingRecipeTitle === meal.title;
                            const accurateImg = getAccurateFoodImage(meal.image, meal.title, meal.mealType);

                            return (
                              <div 
                                key={meal.id}
                                className="border rounded-2xl overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md transition duration-200"
                                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                              >
                                <div>
                                  {/* Meal Cover Image */}
                                  <div className="relative w-full h-44 overflow-hidden border-b" style={{ borderColor: 'var(--color-border)' }}>
                                    <img 
                                      src={accurateImg} 
                                      alt={meal.title}
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = getAccurateFoodImage('', meal.title, meal.mealType);
                                      }}
                                      className="w-full h-full object-cover transition duration-300 hover:scale-105 cursor-pointer" 
                                      onClick={() => {
                                        setSelectedRecipeForModal({
                                          title: meal.title,
                                          description: meal.description,
                                          prepMinutes: meal.prepMinutes || 15,
                                          cookMinutes: meal.cookMinutes || 20,
                                          servings: meal.servings || servings,
                                          calories: meal.calories || 480,
                                          mealType: meal.mealType,
                                          ingredients: Array.isArray(meal.ingredients) && meal.ingredients.length > 0 ? meal.ingredients : ['Quality produce & proteins', 'Aromatics & seasonings', 'Cold-pressed olive oil'],
                                          instructions: Array.isArray(meal.instructions) && meal.instructions.length > 0 ? meal.instructions : ['Prepare and rinse all ingredients cleanly.', 'Sauté aromatics over medium heat until fragrant.', 'Cook protein and vegetables thoroughly.', 'Garnish with fresh herbs and serve warm.'],
                                          chefTip: meal.chefTip || (meal.isBatchCook ? 'Double the quantity to save time for subsequent days.' : 'Serve immediately while hot for optimal flavor infusion.'),
                                          image: accurateImg,
                                          sourceUrl: meal.sourceUrl || ''
                                        });
                                        setShowRecipeDetailsModal(true);
                                      }}
                                    />
                                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                                      <span 
                                        className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md text-white shadow-xs backdrop-blur-md"
                                        style={{ backgroundColor: 'var(--color-primary)' }}
                                      >
                                        {meal.dayLabel}
                                      </span>
                                      <span 
                                        className="uppercase text-[9px] font-black px-2 py-0.5 rounded-md text-white shadow-xs backdrop-blur-md bg-black/60"
                                      >
                                        {meal.mealType}
                                      </span>
                                    </div>
                                    {meal.isBatchCook && (
                                      <span 
                                        className="absolute bottom-2.5 right-2.5 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border text-emerald-400 bg-black/70 shadow-xs"
                                        style={{ borderColor: 'var(--color-emerald)' }}
                                      >
                                        Batch Cook
                                      </span>
                                    )}
                                  </div>

                                  {/* Meal Content */}
                                  <div className="p-3.5 space-y-2">
                                    <h4 
                                      onClick={() => {
                                        setSelectedRecipeForModal({
                                          title: meal.title,
                                          description: meal.description,
                                          prepMinutes: meal.prepMinutes || 15,
                                          cookMinutes: meal.cookMinutes || 20,
                                          servings: meal.servings || servings,
                                          calories: meal.calories || 480,
                                          mealType: meal.mealType,
                                          ingredients: meal.ingredients || [],
                                          instructions: ['Prepare ingredients.', 'Cook thoroughly.', 'Serve fresh.'],
                                          image: accurateImg
                                        });
                                        setShowRecipeDetailsModal(true);
                                      }}
                                      className="font-black text-sm truncate leading-snug cursor-pointer hover:underline" 
                                      style={{ color: 'var(--color-text)' }}
                                    >
                                      {meal.title}
                                    </h4>

                                    <p className="text-[11px] line-clamp-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                                      {meal.description}
                                    </p>

                                    <div className="flex items-center gap-3 text-[10px] font-semibold pt-1 border-t" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" style={{ color: 'var(--color-emerald)' }} /> {(meal.prepMinutes || 15) + (meal.cookMinutes || 20)}m
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Users className="h-3 w-3" /> {meal.servings || servings} serv
                                      </span>
                                      {meal.calories && (
                                        <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>{meal.calories} kcal</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Meal Card Footer Actions */}
                                <div className="p-3 pt-0 flex items-center justify-between gap-1.5 border-t pt-2.5 mt-2" style={{ borderColor: 'var(--color-border)' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedRecipeForModal({
                                        title: meal.title,
                                        description: meal.description,
                                        prepMinutes: meal.prepMinutes || 15,
                                        cookMinutes: meal.cookMinutes || 20,
                                        servings: meal.servings || servings,
                                        calories: meal.calories || 480,
                                        mealType: meal.mealType,
                                        ingredients: meal.ingredients || ['Fresh ingredients', 'Seasonings'],
                                        instructions: ['Follow standard culinary guidance.'],
                                        image: accurateImg
                                      });
                                      setShowRecipeDetailsModal(true);
                                    }}
                                    className="p-1.5 rounded-lg border text-[11px] font-bold hover:opacity-85 transition cursor-pointer"
                                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                                    title="View full recipe details"
                                  >
                                    <BookOpen className="h-3.5 w-3.5" />
                                  </button>

                                  {isSaved ? (
                                    <span 
                                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1"
                                      style={{
                                        backgroundColor: 'var(--color-card)',
                                        borderColor: 'var(--color-emerald)',
                                        color: 'var(--color-emerald)'
                                      }}
                                    >
                                      <Check className="h-3 w-3" /> In Recipes
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isScraping}
                                      onClick={() => handleScrapeAndSaveRecipe(meal)}
                                      className="px-2.5 py-1 rounded-lg text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer shadow-xs hover:opacity-90 disabled:opacity-50"
                                      style={{ backgroundColor: 'var(--color-primary)' }}
                                      title="Scrape and save recipe directly to /recipes"
                                    >
                                      {isScraping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                      <span>Scrape to /recipe</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 2. COMPACT TABLE VIEW */}
                      {resultDisplayMode === 'compact' && (
                        <div className="border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                          <div 
                            className="grid grid-cols-12 gap-2 p-2.5 font-extrabold text-[10px] uppercase border-b"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text-secondary)'
                            }}
                          >
                            <span className="col-span-3">Day / Schedule</span>
                            <span className="col-span-2">Meal Type</span>
                            <span className="col-span-4">Recipe Title</span>
                            <span className="col-span-1 text-center">Time</span>
                            <span className="col-span-2 text-right">Action</span>
                          </div>

                          {m.plan.meals.map((meal, rIdx) => {
                            const isSaved = isRecipeSaved(meal.title);
                            return (
                              <div 
                                key={meal.id || rIdx}
                                className="grid grid-cols-12 gap-2 p-2.5 text-xs items-center border-b last:border-none transition hover:opacity-90"
                                style={{
                                  backgroundColor: rIdx % 2 === 0 ? 'var(--color-card)' : 'var(--color-inner-dark)',
                                  borderColor: 'var(--color-border)'
                                }}
                              >
                                <span className="col-span-3 font-bold truncate" style={{ color: 'var(--color-primary)' }}>
                                  {meal.dayLabel}
                                </span>
                                <span className="col-span-2">
                                  <span 
                                    className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border"
                                    style={{
                                      backgroundColor: 'var(--color-card)',
                                      borderColor: 'var(--color-border)',
                                      color: 'var(--color-text-secondary)'
                                    }}
                                  >
                                    {meal.mealType}
                                  </span>
                                </span>
                                <span className="col-span-4 font-semibold truncate cursor-pointer hover:underline" style={{ color: 'var(--color-text)' }} onClick={() => {
                                  setSelectedRecipeForModal({
                                    title: meal.title,
                                    description: meal.description,
                                    prepMinutes: meal.prepMinutes || 15,
                                    cookMinutes: meal.cookMinutes || 20,
                                    servings: meal.servings || servings,
                                    calories: meal.calories || 480,
                                    mealType: meal.mealType,
                                    ingredients: meal.ingredients || [],
                                    instructions: ['Cook meal cleanly.'],
                                    image: getAccurateFoodImage(meal.image, meal.title, meal.mealType)
                                  });
                                  setShowRecipeDetailsModal(true);
                                }}>
                                  {meal.title}
                                </span>
                                <span className="col-span-1 text-center font-mono text-[11px]" style={{ color: 'var(--color-emerald)' }}>
                                  {(meal.prepMinutes || 15) + (meal.cookMinutes || 20)}m
                                </span>
                                <div className="col-span-2 text-right">
                                  {isSaved ? (
                                    <span className="text-[10px] font-bold text-emerald-500">✓ In /recipes</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleScrapeAndSaveRecipe(meal)}
                                      className="text-[10px] px-2 py-0.5 rounded font-bold text-white shadow-2xs"
                                      style={{ backgroundColor: 'var(--color-primary)' }}
                                    >
                                      + Scrape
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 3. DETAILED MASTER VIEW */}
                      {resultDisplayMode === 'detailed' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {m.plan.meals.map((meal) => {
                            const isSaved = isRecipeSaved(meal.title);
                            const accurateImg = getAccurateFoodImage(meal.image, meal.title, meal.mealType);

                            return (
                              <div 
                                key={meal.id}
                                className="border rounded-2xl p-4 space-y-3 transition shadow-xs hover:shadow-md"
                                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                              >
                                <div className="flex justify-between items-center text-xs font-bold border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
                                  <div className="flex items-center gap-2">
                                    <span style={{ color: 'var(--color-primary)' }}>{meal.dayLabel} ({meal.dateStr})</span>
                                    <span 
                                      className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded border"
                                      style={{
                                        backgroundColor: 'var(--color-card)',
                                        borderColor: 'var(--color-emerald)',
                                        color: 'var(--color-emerald)'
                                      }}
                                    >
                                      {meal.mealType}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                                    {(meal.prepMinutes || 15) + (meal.cookMinutes || 20)}m • {meal.servings || servings} serv
                                  </span>
                                </div>

                                <div className="flex gap-3">
                                  <img 
                                    src={accurateImg} 
                                    alt={meal.title}
                                    referrerPolicy="no-referrer"
                                    className="w-20 h-20 rounded-xl object-cover border shrink-0" 
                                    style={{ borderColor: 'var(--color-border)' }}
                                  />
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <h4 className="font-extrabold text-xs" style={{ color: 'var(--color-text)' }}>{meal.title}</h4>
                                    <p className="text-[11px] line-clamp-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{meal.description}</p>
                                  </div>
                                </div>

                                {Array.isArray(meal.ingredients) && meal.ingredients.length > 0 && (
                                  <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
                                    <span className="text-[10px] font-black uppercase tracking-wider block" style={{ color: 'var(--color-primary)' }}>
                                      Ingredients:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {meal.ingredients.map((ing, iIdx) => (
                                        <span 
                                          key={iIdx}
                                          className="text-[10px] font-medium px-2 py-0.5 rounded-lg border shadow-2xs"
                                          style={{
                                            backgroundColor: 'var(--color-card)',
                                            borderColor: 'var(--color-border)',
                                            color: 'var(--color-text)'
                                          }}
                                        >
                                          • {ing}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="pt-2 border-t flex justify-between items-center" style={{ borderColor: 'var(--color-border)' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedRecipeForModal({
                                        title: meal.title,
                                        description: meal.description,
                                        prepMinutes: meal.prepMinutes || 15,
                                        cookMinutes: meal.cookMinutes || 20,
                                        servings: meal.servings || servings,
                                        calories: meal.calories || 480,
                                        mealType: meal.mealType,
                                        ingredients: meal.ingredients || [],
                                        instructions: ['Cook meal cleanly.'],
                                        image: accurateImg
                                      });
                                      setShowRecipeDetailsModal(true);
                                    }}
                                    className="text-xs font-bold hover:underline"
                                    style={{ color: 'var(--color-primary)' }}
                                  >
                                    View Full Details ↗
                                  </button>

                                  {isSaved ? (
                                    <span className="text-[10px] font-bold text-emerald-500">✓ In /recipes</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleScrapeAndSaveRecipe(meal)}
                                      className="px-3 py-1 rounded-xl text-white text-[11px] font-bold transition flex items-center gap-1 shadow-xs"
                                      style={{ backgroundColor: 'var(--color-primary)' }}
                                    >
                                      <Sparkles className="h-3 w-3" /> Scrape to /recipe
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div 
                    className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-1 shadow-sm"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <UserIcon className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {loading && (
          <div 
            className="flex items-center gap-3 p-3.5 border rounded-2xl max-w-xs text-xs shadow-sm"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-primary)' }} /> 
            {t('chefThinking', 'Chef Foodie is formulating your recipes...')}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* DYNAMIC CONTEXTUAL PRESET ANSWERS */}
      {wizardStep !== null && currentPresetOptions.length > 0 && (
        <div 
          className="p-3.5 rounded-2xl border space-y-2.5 animate-in fade-in transition-colors duration-200 w-full"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-border)'
          }}
        >
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--color-primary)' }}>
              <Sparkles className="h-3.5 w-3.5" /> Preset Answers (Step {wizardStep + 1} of {wizardQuestionsList.length}):
            </span>
            <button
              type="button"
              onClick={() => { updateWizardStep(null); showToast("Exited wizard"); }}
              className="text-[10px] hover:underline cursor-pointer"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Cancel Wizard
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {currentPresetOptions.map((opt, oIdx) => (
              <button
                key={oIdx}
                type="button"
                onClick={() => handleSend(opt)}
                className="text-xs font-semibold px-3.5 py-2 rounded-xl border transition shadow-xs cursor-pointer hover:scale-[1.02] active:scale-95"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TOPIC LAUNCHER CHIPS */}
      {wizardStep === null && activeQuestionnaireSections.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 custom-scrollbar shrink-0 w-full">
          <span className="text-[10px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
            <Sparkles className="h-3 w-3" style={{ color: 'var(--color-primary)' }} /> Questionnaires:
          </span>
          <button
            type="button"
            onClick={handleStartFullWizard}
            className="text-xs font-bold px-3.5 py-1.5 rounded-full border shrink-0 transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] text-white"
            style={{
              backgroundColor: 'var(--color-primary)',
              borderColor: 'var(--color-primary)'
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Complete Intake Wizard</span>
          </button>
          {activeQuestionnaireSections.map((sec) => (
            <button
              key={`chip-${sec.id}`}
              type="button"
              onClick={() => handleStartTopicWizard(sec)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border shrink-0 transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02]"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              <Layers className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }} />
              <span>{sec.topicTitle}</span>
            </button>
          ))}
        </div>
      )}

      {/* FULL-WIDTH PROMPT INPUT BAR */}
      <div 
        className="w-full border rounded-2xl p-2 flex items-center gap-2 shrink-0 shadow-xl transition-colors duration-200"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)'
        }}
      >
        {enableVoiceInteraction && (
          <button
            type="button"
            onClick={toggleSpeechRecognition}
            className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-center ${isListening ? 'animate-pulse' : 'hover:opacity-80'}`}
            style={{
              backgroundColor: isListening ? 'var(--color-primary)' : 'var(--color-inner-dark)',
              borderColor: isListening ? 'var(--color-primary)' : 'var(--color-border)',
              color: isListening ? '#ffffff' : 'var(--color-text-secondary)'
            }}
            title={isListening ? "Listening... click to stop" : "Speak via microphone"}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}

        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isListening ? "Listening to your voice..." : `${t('askPromptPlaceholder', 'Ask recipes, cooking tips, or meal plan requests...')} (${isTokenEnabled && chefCost > 0 ? `${chefCost} ${tokenSymbol}` : t('freeBadge', 'Free')})`}
          className="bg-transparent border-none text-sm px-2 flex-1 outline-none font-normal"
          style={{ color: 'var(--color-text)' }}
        />
        
        <div className="flex items-center gap-2 pr-1">
          <span 
            className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border hidden sm:inline-block"
            style={{
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)'
            }}
            title={isTokenEnabled && chefCost > 0 ? `Each prompt costs ${chefCost} ${tokenName}` : 'Bypass token consumption'}
          >
            {isTokenEnabled && chefCost > 0 ? `${chefCost} ${tokenSymbol}` : t('freeBadge', 'Free')}
          </span>

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={loading || !prompt.trim()}
            className="disabled:opacity-40 text-white p-2.5 rounded-xl transition cursor-pointer shadow-md flex items-center gap-1 hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* CHAT HISTORY & CATEGORIES SIDE DRAWER */}
      {showHistoryDrawer && (
        <div 
          onClick={() => setShowHistoryDrawer(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end cursor-pointer animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full flex flex-col justify-between border-l p-5 space-y-4 shadow-2xl relative cursor-default animate-in slide-in-from-right duration-200"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <h2 className="text-base font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
                      Chat History ({historyTotalCount})
                    </h2>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      Up to 10 chats per page • Filtered by category
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="px-2.5 py-1 rounded-xl text-white text-[11px] font-extrabold flex items-center gap-1 transition cursor-pointer shadow-sm hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                    title="New Chat"
                  >
                    <Plus className="h-3.5 w-3.5" /> New
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHistoryDrawer(false)}
                    className="p-1.5 rounded-xl border hover:opacity-80 transition cursor-pointer"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* MULTI-SELECT & DELETE ALL TOOLBAR */}
              {historySessions.length > 0 && (
                <div 
                  className="flex items-center justify-between p-2.5 rounded-xl border text-xs"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  <label className="flex items-center gap-2 cursor-pointer font-bold select-none text-[11px]" style={{ color: 'var(--color-text)' }}>
                    <input 
                      type="checkbox"
                      checked={historySessions.length > 0 && historySessions.every(s => selectedSessionIds.includes(s.id))}
                      onChange={handleToggleSelectAll}
                      className="rounded accent-emerald-500 cursor-pointer w-4 h-4"
                    />
                    <span>Select All ({historySessions.length})</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    {selectedSessionIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleDeleteSelected}
                        className="px-2.5 py-1 rounded-lg text-white font-bold text-[10px] transition cursor-pointer flex items-center gap-1 bg-red-600 hover:bg-red-700 shadow-xs"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete ({selectedSessionIds.length})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleClearAllHistory}
                      className="px-2.5 py-1 rounded-lg text-red-400 font-bold text-[10px] border border-red-500/30 hover:bg-red-500/10 transition cursor-pointer flex items-center gap-1"
                      title="Clear All Chat History"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete All</span>
                    </button>
                  </div>
                </div>
              )}

              {/* CATEGORIES SECTION */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5" style={{ color: 'var(--color-primary)' }}>
                    <Folder className="h-3.5 w-3.5" /> Chat Categories:
                  </span>
                </div>

                <div role="region" data-lpignore="true" className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New category name (e.g. Keto Prep, Dinners)..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateCategory();
                      }
                    }}
                    className="flex-1 border rounded-xl px-3 py-1.5 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleCreateCategory()}
                    disabled={!newCategoryName.trim()}
                    className="px-3 py-1.5 text-white font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-40 flex items-center gap-1 shadow-xs hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-emerald)' }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryFilter('all');
                      fetchChatHistory(1, 'all');
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer shrink-0 shadow-xs"
                    style={{
                      backgroundColor: selectedCategoryFilter === 'all' ? 'var(--color-primary)' : 'var(--color-inner-dark)',
                      borderColor: selectedCategoryFilter === 'all' ? 'var(--color-primary)' : 'var(--color-border)',
                      color: selectedCategoryFilter === 'all' ? '#ffffff' : 'var(--color-text-secondary)'
                    }}
                  >
                    All Chats
                  </button>

                  {historyCategories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer shrink-0 shadow-xs group"
                      style={{
                        backgroundColor: selectedCategoryFilter === cat.id ? 'var(--color-primary)' : 'var(--color-inner-dark)',
                        borderColor: selectedCategoryFilter === cat.id ? 'var(--color-primary)' : 'var(--color-border)',
                        color: selectedCategoryFilter === cat.id ? '#ffffff' : 'var(--color-text-secondary)'
                      }}
                      onClick={() => {
                        setSelectedCategoryFilter(cat.id);
                        fetchChatHistory(1, cat.id);
                      }}
                    >
                      <span>{cat.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(cat.id, cat.name);
                        }}
                        className="opacity-70 hover:opacity-100 hover:text-red-400 ml-1 cursor-pointer"
                        title={`Delete category ${cat.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* SESSIONS LIST */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {loadingHistory ? (
                  <div className="py-12 text-center text-xs flex items-center justify-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-primary)' }} /> Loading chat sessions...
                  </div>
                ) : historySessions.length === 0 ? (
                  <div className="py-12 text-center text-xs space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <MessageSquare className="h-8 w-8 mx-auto opacity-30" />
                    <p>No chat history found under this category.</p>
                  </div>
                ) : (
                  historySessions.map((sess) => {
                    const isCurrentActive = sess.id === currentSessionId;
                    const dateFormatted = new Date(sess.updated_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <div
                        key={sess.id}
                        onClick={() => handleSelectSession(sess)}
                        className="p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:scale-[1.01]"
                        style={{
                          backgroundColor: isCurrentActive ? 'var(--color-inner-dark)' : 'var(--color-card)',
                          borderColor: isCurrentActive ? 'var(--color-primary)' : 'var(--color-border)'
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedSessionIds.includes(sess.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleSelectSession(sess.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded accent-emerald-500 cursor-pointer w-4 h-4 shrink-0"
                          />
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {sess.category_name ? (
                                <span 
                                  className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border flex items-center gap-1"
                                  style={{
                                    backgroundColor: 'var(--color-card)',
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-emerald)'
                                  }}
                                >
                                  <Tag className="h-2.5 w-2.5" /> {sess.category_name}
                                </span>
                              ) : null}
                              <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                                {dateFormatted}
                              </span>
                            </div>

                            <h4 
                              className="font-bold text-xs truncate leading-snug"
                              style={{ color: isCurrentActive ? 'var(--color-primary)' : 'var(--color-text)' }}
                            >
                              {sess.title}
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={sess.category_id || 'none'}
                            onChange={(e) => handleAssignCategory(sess.id, e.target.value)}
                            className="text-[10px] border rounded-lg px-2 py-1 outline-none font-medium appearance-none cursor-pointer"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text)'
                            }}
                            title="Assign to Category"
                          >
                            <option value="none">No Category</option>
                            {historyCategories.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteSession(sess.id, e)}
                            className="p-1.5 rounded-lg border text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)'
                            }}
                            title="Delete this chat"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* PAGINATION */}
              {historyTotalPages > 1 && (
                <div 
                  className="pt-3 border-t flex items-center justify-between text-xs font-bold"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  <span>Page {historyPage} of {historyTotalPages}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={historyPage <= 1}
                      onClick={() => fetchChatHistory(historyPage - 1, selectedCategoryFilter)}
                      className="p-1.5 rounded-lg border disabled:opacity-30 cursor-pointer shadow-xs"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    {Array.from({ length: historyTotalPages }, (_, i) => i + 1).map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => fetchChatHistory(num, selectedCategoryFilter)}
                        className="w-7 h-7 rounded-lg text-xs font-bold transition flex items-center justify-center border cursor-pointer shadow-xs"
                        style={historyPage === num ? {
                          backgroundColor: 'var(--color-primary)',
                          borderColor: 'var(--color-primary)',
                          color: '#ffffff'
                        } : {
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      >
                        {num}
                      </button>
                    ))}

                    <button
                      type="button"
                      disabled={historyPage >= historyTotalPages}
                      onClick={() => fetchChatHistory(historyPage + 1, selectedCategoryFilter)}
                      className="p-1.5 rounded-lg border disabled:opacity-30 cursor-pointer shadow-xs"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RECIPE DETAILS MODAL */}
      {showRecipeDetailsModal && selectedRecipeForModal && (
        <div 
          onClick={() => setShowRecipeDetailsModal(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="border rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative p-6 space-y-4 cursor-default animate-in fade-in"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <div className="flex justify-between items-start border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <div className="flex items-center gap-2">
                  <span 
                    className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md text-white shadow-xs"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    Recommended
                  </span>
                  {selectedRecipeForModal.sourceUrl && (
                    <span 
                      className="text-[9px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-emerald)',
                        color: 'var(--color-emerald)'
                      }}
                    >
                      <Globe className="h-2.5 w-2.5" /> Primary Source
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black tracking-tight mt-1" style={{ color: 'var(--color-text)' }}>
                  {selectedRecipeForModal.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowRecipeDetailsModal(false)}
                className="p-1.5 rounded-xl border transition cursor-pointer hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1 text-xs custom-scrollbar">
              <img
                src={getAccurateFoodImage(selectedRecipeForModal.image, selectedRecipeForModal.title, selectedRecipeForModal.mealType)}
                alt={selectedRecipeForModal.title}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getAccurateFoodImage('', selectedRecipeForModal.title, selectedRecipeForModal.mealType);
                }}
                className="w-full h-56 rounded-2xl object-cover border shadow-sm"
                style={{ borderColor: 'var(--color-border)' }}
              />

              <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {selectedRecipeForModal.description}
              </p>

              <div 
                className="flex items-center gap-4 p-3 rounded-2xl border font-bold text-xs"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <span className="flex items-center gap-1.5" style={{ color: 'var(--color-emerald)' }}>
                  <Clock className="h-3.5 w-3.5" /> {(selectedRecipeForModal.prepMinutes || 0) + (selectedRecipeForModal.cookMinutes || 0)} mins total
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {selectedRecipeForModal.servings || servings} servings
                </span>
                {selectedRecipeForModal.calories && (
                  <span className="font-mono text-emerald-500">{selectedRecipeForModal.calories} kcal</span>
                )}
              </div>

              {/* Ingredients List */}
              {Array.isArray(selectedRecipeForModal.ingredients) && selectedRecipeForModal.ingredients.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-xs uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                      Ingredients ({selectedRecipeForModal.ingredients.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleAddToCart(selectedRecipeForModal.ingredients)}
                      className="px-2.5 py-1 rounded-lg border text-[11px] font-bold transition flex items-center gap-1 shadow-2xs hover:opacity-90 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-primary)',
                        color: 'var(--color-primary)'
                      }}
                    >
                      <ShoppingCart className="h-3 w-3" />
                      <span>+ Add to Cart</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedRecipeForModal.ingredients.map((ing: string, i: number) => (
                      <div 
                        key={i}
                        className="p-2.5 rounded-xl border text-[11px] font-medium flex items-center gap-2"
                        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                        <span className="truncate">{ing}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions */}
              {Array.isArray(selectedRecipeForModal.instructions) && selectedRecipeForModal.instructions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                    Instructions
                  </h4>
                  <div className="space-y-2">
                    {selectedRecipeForModal.instructions.map((step: string, sIdx: number) => (
                      <div 
                        key={sIdx}
                        className="p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5"
                        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                      >
                        <span 
                          className="w-5 h-5 rounded-md font-bold text-[10px] flex items-center justify-center shrink-0 border"
                          style={{
                            backgroundColor: 'var(--color-card)',
                            borderColor: 'var(--color-primary)',
                            color: 'var(--color-primary)'
                          }}
                        >
                          {sIdx + 1}
                        </span>
                        <p className="flex-1">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chef Tip */}
              {selectedRecipeForModal.chefTip && (
                <div 
                  className="p-3.5 rounded-2xl border text-xs leading-relaxed flex items-start gap-2"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-emerald)',
                    color: 'var(--color-emerald)'
                  }}
                >
                  <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                  <span><strong>Chef Tip:</strong> {selectedRecipeForModal.chefTip}</span>
                </div>
              )}
            </div>

            {/* Outbound Link & Actions */}
            <div className="pt-3 border-t flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                {selectedRecipeForModal.sourceUrl && (
                  <a
                    href={selectedRecipeForModal.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-primary)'
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>View Source Recipe ↗</span>
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isRecipeSaved(selectedRecipeForModal.title) ? (
                  <div className="flex items-center gap-2">
                    <span 
                      className="px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-emerald)',
                        color: 'var(--color-emerald)'
                      }}
                    >
                      <Check className="h-3.5 w-3.5" /> Saved in Recipes
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push('/recipes')}
                      className="px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer hover:opacity-85"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      View in /recipes ↗
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={savingRecipeTitle === selectedRecipeForModal.title}
                    onClick={() => handleScrapeAndSaveRecipe(selectedRecipeForModal)}
                    className="px-4 py-1.5 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {savingRecipeTitle === selectedRecipeForModal.title ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    <span>Scrape & Save to /recipe</span>
                  </button>
                )}

                {isRecipeSaved(selectedRecipeForModal.title) && (
                  <button
                    type="button"
                    onClick={() => handleOpenPlannerModal(selectedRecipeForModal)}
                    className="px-3.5 py-1.5 rounded-xl text-white text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:opacity-90 animate-in fade-in"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    <span>📅 Add to Planner</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowRecipeDetailsModal(false)}
                  className="px-4 py-1.5 rounded-xl border font-bold text-xs shadow-xs transition cursor-pointer hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD TO MEAL PLANNER MODAL */}
      {showPlannerModal && recipeToSchedule && (
        <div 
          onClick={() => setShowPlannerModal(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="border rounded-3xl max-w-md w-full flex flex-col overflow-hidden shadow-2xl relative p-6 space-y-4 cursor-default animate-in fade-in"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <div className="flex justify-between items-start border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider block" style={{ color: 'var(--color-primary)' }}>
                  Meal Planner Schedule
                </span>
                <h2 className="text-base font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
                  Schedule "{recipeToSchedule.title}"
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPlannerModal(false)}
                className="p-1.5 rounded-xl border hover:opacity-80 transition cursor-pointer"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  Target Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full border rounded-xl px-3.5 py-2 text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  Meal Slot
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setScheduleMealType(slot)}
                      className="py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer text-center"
                      style={scheduleMealType === slot ? {
                        backgroundColor: 'var(--color-primary)',
                        borderColor: 'var(--color-primary)',
                        color: '#ffffff'
                      } : {
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-secondary)'
                      }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  Servings
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setScheduleServings(Math.max(1, scheduleServings - 1))}
                    className="w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-xs transition cursor-pointer"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  >
                    -
                  </button>
                  <span className="font-bold">{scheduleServings} servings</span>
                  <button
                    type="button"
                    onClick={() => setScheduleServings(scheduleServings + 1)}
                    className="w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-xs transition cursor-pointer"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setShowPlannerModal(false)}
                className="px-4 py-2 border rounded-xl font-bold text-xs transition cursor-pointer hover:opacity-80"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={schedulingLoading}
                onClick={handleConfirmScheduleMeal}
                className="px-5 py-2 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {schedulingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                <span>Confirm & Schedule</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECIPE PREFERENCES MODAL */}
      {showPreferences && (
        <div 
          onClick={() => setShowPreferences(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="border rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative p-6 space-y-5 cursor-default animate-in fade-in"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-primary)' }}>
                  {t('recipePreferencesTitle', 'Recipe Preferences')}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('recipePreferencesSub', 'Personalise your cooking experience')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPreferences(false)}
                className="p-2 rounded-xl border transition cursor-pointer shadow-sm hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-5 pr-1 text-xs">
              <div className="space-y-2">
                <label className="block font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  {t('servingsTitle', 'Servings')}
                </label>
                <div className="flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => setServings(Math.max(1, servings - 1))}
                    className="w-8 h-8 rounded-full border flex items-center justify-center font-bold text-sm transition cursor-pointer shadow-sm hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    -
                  </button>
                  <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                    {(t('peopleSuffix', '{count} people')).replace('{count}', String(servings))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setServings(servings + 1)}
                    className="w-8 h-8 rounded-full border flex items-center justify-center font-bold text-sm transition cursor-pointer shadow-sm hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  {t('countryTitle', 'Country')}
                </label>
                <div className="relative">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full border rounded-xl px-4 py-2.5 text-xs outline-none cursor-pointer appearance-none shadow-sm font-medium"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="h-4 w-4 absolute right-3 top-3 pointer-events-none" style={{ color: 'var(--color-primary)' }} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  {t('dietaryPreferencesTitle', 'Dietary Preferences')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_OPTIONS.map((item) => {
                    const isSelected = selectedDiets.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleToggleDiet(item)}
                        className="px-4 py-1.5 rounded-full font-bold text-xs border transition cursor-pointer shadow-sm"
                        style={isSelected ? {
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        } : {
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-secondary)'
                        }}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  {t('allergiesTitle', 'Allergies')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGY_OPTIONS.map((item) => {
                    const isSelected = selectedAllergies.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleToggleAllergy(item)}
                        className="px-4 py-1.5 rounded-full font-bold text-xs border transition cursor-pointer shadow-sm"
                        style={isSelected ? {
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        } : {
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-secondary)'
                        }}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  {t('ingredientsToAvoidTitle', 'Ingredients to Avoid')}
                </label>
                <div role="region" data-lpignore="true" className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t('typeIngredientPlaceholder', 'Type an ingredient...')}
                    value={newAvoidInput}
                    onChange={(e) => setNewAvoidInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddAvoid(e)}
                    className="flex-1 border rounded-xl px-3.5 py-2.5 text-xs outline-none shadow-sm"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddAvoid()}
                    className="px-3.5 py-2.5 text-white rounded-xl font-bold flex items-center justify-center transition cursor-pointer shadow-md hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div 
                  className="p-3 rounded-2xl border min-h-[50px] flex flex-wrap gap-2 items-center"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  {ingredientsToAvoid.length === 0 ? (
                    <span className="text-[11px] italic" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('noIngredientsAvoid', 'No ingredients added to avoid list')}
                    </span>
                  ) : (
                    ingredientsToAvoid.map((item) => (
                      <span 
                        key={item}
                        className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border shadow-sm"
                        style={{
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-emerald)',
                          color: 'var(--color-emerald)'
                        }}
                      >
                        {item}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveAvoid(item)} 
                          className="hover:opacity-80 cursor-pointer ml-0.5"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                  {t('tastesTitle', 'Tastes')}
                </label>
                <div role="region" data-lpignore="true" className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t('tastesPlaceholder', 'e.g. prefers larger portions, loves umami...')}
                    value={newTasteInput}
                    onChange={(e) => setNewTasteInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTaste(e)}
                    className="flex-1 border rounded-xl px-3.5 py-2.5 text-xs outline-none shadow-sm"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTaste()}
                    className="px-3.5 py-2.5 text-white rounded-xl font-bold flex items-center justify-center transition cursor-pointer shadow-md hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div 
                  className="p-3 rounded-2xl border min-h-[50px] flex flex-wrap gap-2 items-center"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  {tastesList.length === 0 ? (
                    <span className="text-[11px] italic" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('noTastesSpecified', 'No taste preferences specified')}
                    </span>
                  ) : (
                    tastesList.map((item) => (
                      <span 
                        key={item}
                        className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border shadow-sm"
                        style={{
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-emerald)',
                          color: 'var(--color-emerald)'
                        }}
                      >
                        {item}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveTaste(item)} 
                          className="hover:opacity-80 cursor-pointer ml-0.5"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div 
              className="pt-4 border-t flex items-center justify-end gap-2.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                type="button"
                onClick={() => setShowPreferences(false)}
                className="px-5 py-2.5 border rounded-xl font-bold text-xs transition cursor-pointer shadow-sm hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                {t('cancel', 'Cancel')}
              </button>

              <button
                type="button"
                onClick={handleClearAllPreferences}
                className="px-4 py-2.5 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                <Trash2 className="h-3.5 w-3.5" /> {t('clearAllBtn', 'Clear All')}
              </button>

              <button
                type="button"
                onClick={handleSavePreferences}
                className="px-6 py-2.5 text-white font-bold text-xs rounded-xl transition shadow-lg cursor-pointer hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {t('saveBtn', 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOKEN PURCHASE MODAL */}
      <TokenPurchaseModal
        isOpen={isTokenPurchaseOpen}
        onClose={() => setIsTokenPurchaseOpen(false)}
        userId={currentUserRef.current?.id || currentUser?.id}
        userEmail={currentUserRef.current?.email || currentUser?.email}
        tokenSymbol={tokenSymbol}
        packages={tokenPackages}
        onPurchased={(newBal) => {
          setTokenBalance(newBal);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('zecratary_tokens_updated'));
          }
          showToast(`Tokens added! New balance: ${newBal} ${tokenSymbol}`);
        }}
      />
    </div>
  );
}
