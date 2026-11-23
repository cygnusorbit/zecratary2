// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, 
  Sparkles, Copy, Share2, ShoppingCart, Edit2, Trash2, Clock, 
  Utensils, CheckCircle2, AlertCircle, ShieldCheck, Lock, 
  ArrowRight, X, Flame
} from 'lucide-react';
import { getCurrentUser, initAuthStorage } from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';

interface PlannedMeal {
  id: string;
  userId: string;
  date: string;
  mealType: string;
  recipeId?: string;
  recipeName: string;
  time: string;
  servings: number;
  notes?: string;
  isLeftover?: boolean;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

interface SavedRecipe {
  id: string;
  title: string;
  name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  ingredients?: any[];
}

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function formatISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDates(baseDate: Date): Date[] {
  const current = new Date(baseDate);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(current.setDate(diff));

  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(monday);
    nextDay.setDate(monday.getDate() + i);
    week.push(nextDay);
  }
  return week;
}

export default function PlannerPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Subscription Macro Telemetry
  const [canViewMacros, setCanViewMacros] = useState<boolean>(true);
  const [activePlanName, setActivePlanName] = useState<string>('Nutrition Pro');

  // Modal Dialog States (Zero Form Tags - Constraint 9)
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string>('');
  const [editingMeal, setEditingMeal] = useState<PlannedMeal | null>(null);

  // Add/Edit Modal Input States
  const [inputMealType, setInputMealType] = useState('Dinner');
  const [inputRecipeId, setInputRecipeId] = useState('');
  const [inputCustomName, setInputCustomName] = useState('');
  const [inputTime, setInputTime] = useState('19:00');
  const [inputServings, setInputServings] = useState(2);
  const [inputNotes, setInputNotes] = useState('');
  const [inputIsLeftover, setInputIsLeftover] = useState(false);

  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);
  const activeWeekKeys = useMemo(() => weekDates.map(d => formatISODate(d)), [weekDates]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  const fetchSubscriptionAndPlans = useCallback(async () => {
    try {
      const user = getCurrentUser();
      const userPlan = user?.plan || user?.subscriptionTier || 'pro';
      setActivePlanName(String(userPlan).toUpperCase());

      const res = await fetch(`/api/admin/plans?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const plans = Array.isArray(data.plans) ? data.plans : (Array.isArray(data) ? data : []);
        const matched = plans.find((p: any) => 
          (p.slug && p.slug.toLowerCase() === String(userPlan).toLowerCase()) ||
          (p.name && p.name.toLowerCase() === String(userPlan).toLowerCase())
        );
        if (matched && matched.can_view_macros !== undefined) {
          setCanViewMacros(Boolean(matched.can_view_macros));
          return;
        }
      }
      const isFreeTier = String(userPlan).toLowerCase().includes('taster') || String(userPlan).toLowerCase().includes('free');
      setCanViewMacros(!isFreeTier);
    } catch (_) {
      setCanViewMacros(true);
    }
  }, []);

  const loadSavedRecipes = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-recipes', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.recipes) ? data.recipes : (Array.isArray(data) ? data : []);
        if (list.length > 0) {
          setSavedRecipes(list);
          return;
        }
      }
    } catch (_) {}

    try {
      const cached = localStorage.getItem('zecratary_saved_recipes') || localStorage.getItem('zecratary_recipes');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedRecipes(parsed);
          return;
        }
      }
    } catch (_) {}

    setSavedRecipes([
      { id: 'rec_1', title: 'Grilled Mediterranean Salmon', calories: 480, protein: 42, carbs: 12, fat: 28 },
      { id: 'rec_2', title: 'Avocado Quinoa Salad Bowl', calories: 380, protein: 14, carbs: 48, fat: 16 },
      { id: 'rec_3', title: 'Thai Basil Chicken Stir-Fry', calories: 520, protein: 46, carbs: 24, fat: 22 },
      { id: 'rec_4', title: 'Protein Oatmeal with Berries', calories: 340, protein: 22, carbs: 54, fat: 6 }
    ]);
  }, []);

  const loadMeals = useCallback(async () => {
    setLoading(true);
    const user = getCurrentUser();
    const userId = user?.id || user?.email || 'usr_admin_1';

    try {
      const res = await fetch(`/api/planner?userId=${encodeURIComponent(userId)}&t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.meals)) {
          setMeals(data.meals);
          localStorage.setItem('zecratary_planned_meals', JSON.stringify(data.meals));
          setLoading(false);
          return;
        }
      }
    } catch (_) {}

    try {
      const cached = localStorage.getItem('zecratary_planned_meals');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setMeals(parsed);
        }
      }
    } catch (_) {}

    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = `${t('mealPlannerTitle', 'Weekly Meal Planner')} - Zecratary`;
    initAuthStorage();
    if (!getCurrentUser()) {
      router.replace('/login');
      return;
    }
    loadMeals();
    loadSavedRecipes();
    fetchSubscriptionAndPlans();

    const handleSync = () => {
      loadMeals();
      loadSavedRecipes();
      fetchSubscriptionAndPlans();
    };

    window.addEventListener('zecratary_plans_updated', handleSync);
    window.addEventListener('zecratary_users_updated', handleSync);
    window.addEventListener('zecratary_theme_mode_changed', handleSync);
    window.addEventListener('zecratary_languages_updated', handleSync);
    window.addEventListener('zecratary_dictionary_updated', handleSync);
    window.addEventListener('zecratary_locale_changed', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener('zecratary_plans_updated', handleSync);
      window.removeEventListener('zecratary_users_updated', handleSync);
      window.removeEventListener('zecratary_theme_mode_changed', handleSync);
      window.removeEventListener('zecratary_languages_updated', handleSync);
      window.removeEventListener('zecratary_dictionary_updated', handleSync);
      window.removeEventListener('zecratary_locale_changed', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [loadMeals, loadSavedRecipes, fetchSubscriptionAndPlans, t]);

  // Compute Live Macro Averages for the Current Week
  const activeWeekMeals = useMemo(() => {
    return meals.filter(m => activeWeekKeys.includes(m.date));
  }, [meals, activeWeekKeys]);

  const weeklyNutritionalAverages = useMemo(() => {
    if (activeWeekMeals.length === 0) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const totals = activeWeekMeals.reduce((acc, m) => {
      acc.calories += Number(m.calories || 0);
      acc.protein += Number(m.protein || 0);
      acc.carbs += Number(m.carbs || 0);
      acc.fat += Number(m.fat || 0);
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const divisor = 7;
    return {
      calories: Math.round(totals.calories / divisor),
      protein: Math.round(totals.protein / divisor),
      carbs: Math.round(totals.carbs / divisor),
      fat: Math.round(totals.fat / divisor)
    };
  }, [activeWeekMeals]);

  // Week Navigation Handlers
  const handlePrevWeek = () => {
    setCurrentWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const handleTodayWeek = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCurrentWeekStart(d);
  };

  // Smart Auto-Planner: Fill Missing Slots
  const handleAutoPlanWeek = async () => {
    if (savedRecipes.length === 0) {
      showToast(t('noSavedRecipesToPlan', 'Save some recipes first before auto-planning your week.'), 'error');
      return;
    }

    const user = getCurrentUser();
    const userId = user?.id || user?.email || 'usr_admin_1';
    const newBatch: PlannedMeal[] = [];
    let recipeIdx = 0;

    activeWeekKeys.forEach((dateKey) => {
      const existingForDay = meals.filter(m => m.date === dateKey);
      const scheduledTypes = existingForDay.map(m => m.mealType);

      ['Breakfast', 'Lunch', 'Dinner'].forEach((slot) => {
        if (!scheduledTypes.includes(slot)) {
          const rec = savedRecipes[recipeIdx % savedRecipes.length];
          recipeIdx++;
          newBatch.push({
            id: 'meal_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
            userId,
            date: dateKey,
            mealType: slot,
            recipeId: rec.id,
            recipeName: rec.title || rec.name || 'Chef Dish',
            time: slot === 'Breakfast' ? '08:00' : slot === 'Lunch' ? '12:30' : '19:00',
            servings: 2,
            notes: t('autoScheduledNote', 'Auto-scheduled by Chef AI'),
            isLeftover: false,
            calories: Number(rec.calories) || 450,
            protein: Number(rec.protein) || 30,
            carbs: Number(rec.carbs) || 40,
            fat: Number(rec.fat) || 15
          });
        }
      });
    });

    if (newBatch.length === 0) {
      showToast(t('weekAlreadyFilled', 'Your active week is already fully planned!'), 'info');
      return;
    }

    const merged = [...meals, ...newBatch];
    setMeals(merged);
    localStorage.setItem('zecratary_planned_meals', JSON.stringify(merged));

    try {
      await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, meals: newBatch })
      });
    } catch (_) {}

    showToast(`${t('plannedMealsAdded', 'Successfully scheduled')} ${newBatch.length} ${t('mealsAcrossWeek', 'meals across your week!')}`);
  };

  // Copy Week to Next Week
  const handleCopyWeek = async () => {
    if (activeWeekMeals.length === 0) {
      showToast(t('noMealsToCopy', 'There are no meals in the current week to copy.'), 'error');
      return;
    }

    const user = getCurrentUser();
    const userId = user?.id || user?.email || 'usr_admin_1';
    const clonedMeals: PlannedMeal[] = activeWeekMeals.map(m => {
      const d = new Date(m.date);
      d.setDate(d.getDate() + 7);
      return {
        ...m,
        id: 'meal_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        date: formatISODate(d)
      };
    });

    const merged = [...meals, ...clonedMeals];
    setMeals(merged);
    localStorage.setItem('zecratary_planned_meals', JSON.stringify(merged));

    try {
      await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, meals: clonedMeals })
      });
    } catch (_) {}

    showToast(t('weekCopiedSuccess', 'Current week duplicated to next week successfully!'));
  };

  // Share Week Itinerary
  const handleShareWeek = () => {
    if (activeWeekMeals.length === 0) {
      showToast(t('noMealsToShare', 'No planned meals to share this week.'), 'error');
      return;
    }

    const title = `📅 ${t('weeklyMealPlanTitle', 'Zecratary Weekly Meal Plan')} (${activeWeekKeys[0]} - ${activeWeekKeys[6]})\n\n`;
    const lines = activeWeekKeys.map(dk => {
      const dayMeals = meals.filter(m => m.date === dk);
      if (dayMeals.length === 0) return `${dk}: No meals scheduled`;
      const dishStrings = dayMeals.map(m => `  • [${m.mealType}] ${m.recipeName} (${m.time})`).join('\n');
      return `${dk}:\n${dishStrings}`;
    }).join('\n\n');

    const shareText = title + lines;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      showToast(t('mealPlanCopiedClipboard', 'Weekly itinerary copied to clipboard!'));
    } else {
      showToast(t('clipboardNotAvailable', 'Clipboard not supported in this browser.'), 'error');
    }
  };

  // Generate Grocery Shopping List
  const handleGenerateShoppingList = async () => {
    if (activeWeekMeals.length === 0) {
      showToast(t('noMealsForShoppingList', 'Schedule meals before generating a shopping list.'), 'error');
      return;
    }

    const user = getCurrentUser();
    const userId = user?.id || user?.email || 'usr_admin_1';
    const groceryItems: any[] = [];

    activeWeekMeals.forEach(m => {
      const rec = savedRecipes.find(r => r.id === m.recipeId);
      if (rec && Array.isArray(rec.ingredients) && rec.ingredients.length > 0) {
        rec.ingredients.forEach(ing => {
          groceryItems.push({
            id: 'shop_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
            userId,
            name: typeof ing === 'string' ? ing : (ing.name || ing.item || 'Ingredient'),
            amount: typeof ing === 'object' && ing.amount ? ing.amount : '1',
            unit: typeof ing === 'object' && ing.unit ? ing.unit : 'unit',
            category: 'Pantry & Produce',
            checked: false,
            sourceMeal: m.recipeName
          });
        });
      } else {
        groceryItems.push({
          id: 'shop_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
          userId,
          name: `${m.recipeName} (${t('ingredientsBundle', 'Ingredients Bundle')})`,
          amount: '1',
          unit: 'kit',
          category: 'Meal Kit',
          checked: false,
          sourceMeal: m.recipeName
        });
      }
    });

    try {
      await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, items: groceryItems })
      });
    } catch (_) {}

    try {
      const currentShop = localStorage.getItem('zecratary_shopping_list');
      const parsed = currentShop ? JSON.parse(currentShop) : [];
      localStorage.setItem('zecratary_shopping_list', JSON.stringify([...groceryItems, ...parsed]));
      window.dispatchEvent(new Event('zecratary_shopping_updated'));
    } catch (_) {}

    showToast(`${t('shoppingListGenerated', 'Generated')} ${groceryItems.length} ${t('groceryItemsSuccess', 'grocery items and synced to /shopping!')}`);
  };

  // Add Meal Action (Accessible Modal Handler)
  const openAddMealModal = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    setInputMealType('Dinner');
    setInputRecipeId(savedRecipes[0]?.id || '');
    setInputCustomName('');
    setInputTime('19:00');
    setInputServings(2);
    setInputNotes('');
    setInputIsLeftover(false);
    setShowAddModal(true);
  };

  const handleSaveAddMeal = async () => {
    const selectedRec = savedRecipes.find(r => r.id === inputRecipeId);
    const finalName = inputCustomName.trim() || selectedRec?.title || selectedRec?.name || t('customMeal', 'Custom Meal');

    const user = getCurrentUser();
    const userId = user?.id || user?.email || 'usr_admin_1';

    const newMeal: PlannedMeal = {
      id: 'meal_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      userId,
      date: selectedDateKey,
      mealType: inputMealType,
      recipeId: selectedRec ? selectedRec.id : undefined,
      recipeName: finalName,
      time: inputTime || '12:00',
      servings: Number(inputServings) || 2,
      notes: inputNotes.trim(),
      isLeftover: inputIsLeftover,
      calories: Number(selectedRec?.calories) || 450,
      protein: Number(selectedRec?.protein) || 30,
      carbs: Number(selectedRec?.carbs) || 40,
      fat: Number(selectedRec?.fat) || 15
    };

    const updated = [...meals, newMeal];
    setMeals(updated);
    localStorage.setItem('zecratary_planned_meals', JSON.stringify(updated));
    setShowAddModal(false);

    try {
      await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, meal: newMeal })
      });
    } catch (_) {}

    showToast(`${t('mealScheduledToast', 'Meal scheduled for')} ${selectedDateKey}`);
  };

  // Edit Meal Action (Accessible Modal Handler)
  const openEditMealModal = (meal: PlannedMeal) => {
    setEditingMeal(meal);
    setInputMealType(meal.mealType);
    setInputRecipeId(meal.recipeId || '');
    setInputCustomName(meal.recipeName);
    setInputTime(meal.time || '12:00');
    setInputServings(meal.servings || 2);
    setInputNotes(meal.notes || '');
    setInputIsLeftover(Boolean(meal.isLeftover));
    setShowEditModal(true);
  };

  const handleSaveEditMeal = async () => {
    if (!editingMeal) return;

    const selectedRec = savedRecipes.find(r => r.id === inputRecipeId);
    const finalName = inputCustomName.trim() || selectedRec?.title || selectedRec?.name || editingMeal.recipeName;

    const user = getCurrentUser();
    const userId = user?.id || user?.email || 'usr_admin_1';

    const updatedMeal: PlannedMeal = {
      ...editingMeal,
      mealType: inputMealType,
      recipeId: selectedRec ? selectedRec.id : editingMeal.recipeId,
      recipeName: finalName,
      time: inputTime,
      servings: Number(inputServings) || 2,
      notes: inputNotes.trim(),
      isLeftover: inputIsLeftover,
      calories: selectedRec?.calories ?? editingMeal.calories,
      protein: selectedRec?.protein ?? editingMeal.protein,
      carbs: selectedRec?.carbs ?? editingMeal.carbs,
      fat: selectedRec?.fat ?? editingMeal.fat
    };

    const updatedList = meals.map(m => m.id === updatedMeal.id ? updatedMeal : m);
    setMeals(updatedList);
    localStorage.setItem('zecratary_planned_meals', JSON.stringify(updatedList));
    setShowEditModal(false);

    try {
      await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, meal: updatedMeal })
      });
    } catch (_) {}

    showToast(t('mealUpdatedToast', 'Meal schedule updated successfully!'));
  };

  const handleDeleteMeal = async (mealId: string) => {
    const remaining = meals.filter(m => m.id !== mealId);
    setMeals(remaining);
    localStorage.setItem('zecratary_planned_meals', JSON.stringify(remaining));

    const user = getCurrentUser();
    const userId = user?.id || user?.email || 'usr_admin_1';

    try {
      await fetch(`/api/planner?id=${encodeURIComponent(mealId)}&userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
    } catch (_) {}

    showToast(t('mealDeletedToast', 'Meal removed from planner.'));
  };

  const formatWeekRangeString = () => {
    if (weekDates.length < 7) return '';
    const start = weekDates[0];
    const end = weekDates[6];
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString(undefined, options)} - ${end.toLocaleDateString(undefined, { ...options, year: 'numeric' })}`;
  };

  return (
    <div
      id="zecratary-planner-canvas"
      role="region"
      aria-label={t('mealPlannerTitle', 'Weekly Meal Planner')}
      data-lpignore="true"
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 space-y-6 pb-24 font-sans transition-colors duration-200"
      style={{
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        color: 'var(--color-text)'
      }}
    >
      {/* Toast Alert Banner */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: toast.type === 'error' ? '#ef4444' : 'var(--color-emerald)',
            color: 'var(--color-text)'
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--color-emerald)' }} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Bar: Actions & Week Controls */}
      <div 
        className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b pb-5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              <CalendarIcon className="h-6 w-6" /> {t('mealPlannerTitle', 'Weekly Meal Planner')}
            </h1>
            <span 
              className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-primary)'
              }}
            >
              {activePlanName}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t('mealPlannerSubtitle', 'Architect your weekly nutrition, balance macros, and sync directly to your grocery shopping list.')}
          </p>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Week Selector Pills */}
          <div 
            className="flex items-center rounded-xl border p-1"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-1.5 rounded-lg hover:opacity-80 transition cursor-pointer"
              title={t('prevWeek', 'Previous Week')}
              style={{ color: 'var(--color-text)' }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleTodayWeek}
              className="px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer"
              style={{ backgroundColor: 'var(--color-inner-dark)', color: 'var(--color-primary)' }}
            >
              {t('todayBtn', 'Today')}
            </button>
            <button
              type="button"
              onClick={handleNextWeek}
              className="p-1.5 rounded-lg hover:opacity-80 transition cursor-pointer"
              title={t('nextWeek', 'Next Week')}
              style={{ color: 'var(--color-text)' }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="text-xs font-bold px-2 hidden sm:inline" style={{ color: 'var(--color-text)' }}>
            {formatWeekRangeString()}
          </span>

          {/* Smart Auto-Plan Button */}
          <button
            type="button"
            onClick={handleAutoPlanWeek}
            className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: 'var(--color-primary)',
              color: 'var(--color-primary)'
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('planWeekBtn', 'Plan Week')}</span>
          </button>

          {/* Copy Week Button */}
          <button
            type="button"
            onClick={handleCopyWeek}
            className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>{t('copyWeekBtn', 'Copy Week')}</span>
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleShareWeek}
            className="p-2 rounded-xl border transition cursor-pointer hover:opacity-90"
            title={t('shareWeekPlan', 'Share Weekly Meal Plan')}
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <Share2 className="h-4 w-4" />
          </button>

          {/* Generate Shopping List CTA */}
          <button
            type="button"
            onClick={handleGenerateShoppingList}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-md transition cursor-pointer hover:opacity-90"
            style={{ backgroundColor: 'var(--color-emerald)' }}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>{t('syncShoppingListBtn', 'Shopping List')}</span>
          </button>
        </div>
      </div>

      {/* Daily Nutritional Average Card (Subscription Macro Gated) */}
      <div 
        role="region"
        aria-label={t('nutritionalAverageTitle', 'Daily Nutritional Average')}
        data-lpignore="true"
        className="w-full rounded-3xl p-5 border shadow-sm transition-colors duration-200"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)',
          boxSizing: 'border-box'
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
            <div>
              <h2 className="text-sm font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
                {t('nutritionalAverageTitle', 'Daily Nutritional Average')}
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                {t('nutritionalAverageSubtitle', 'Calculated dynamically based on scheduled dishes for this week.')}
              </p>
            </div>
          </div>

          <div>
            {canViewMacros ? (
              <div 
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-emerald)',
                  color: 'var(--color-emerald)'
                }}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{t('macrosActiveBadge', 'Macros Active')}</span>
              </div>
            ) : (
              <Link
                href="/subscriptions"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                <Lock className="h-3 w-3" />
                <span>{t('upgradeToViewMacros', 'Upgrade to View Macros')}</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Nutritional Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('macroCalories', 'Calories'), value: `${weeklyNutritionalAverages.calories} kcal`, color: 'var(--color-primary)' },
            { label: t('macroProtein', 'Protein'), value: `${weeklyNutritionalAverages.protein}g`, color: 'var(--color-emerald)' },
            { label: t('macroCarbs', 'Carbs'), value: `${weeklyNutritionalAverages.carbs}g`, color: '#f59e0b' },
            { label: t('macroFat', 'Fat'), value: `${weeklyNutritionalAverages.fat}g`, color: '#6366f1' },
          ].map((macro, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-2xl border transition-colors duration-200"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div className="text-[11px] font-bold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                {macro.label}
              </div>
              <div 
                className={`text-lg font-black tracking-tight ${!canViewMacros ? 'blur-[4px] select-none opacity-60' : ''}`}
                style={{ color: macro.color }}
              >
                {macro.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 7-Day Responsive Calendar Canvas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {weekDates.map((dateObj) => {
          const dateKey = formatISODate(dateObj);
          const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
          const dayNumber = dateObj.getDate();
          const isToday = formatISODate(new Date()) === dateKey;
          const dayMeals = meals.filter(m => m.date === dateKey);

          return (
            <div
              key={dateKey}
              role="region"
              aria-label={`${dayName} ${dateKey}`}
              data-lpignore="true"
              className="flex flex-col rounded-3xl border shadow-sm transition duration-200 overflow-hidden"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: isToday ? 'var(--color-primary)' : 'var(--color-border)',
                borderWidth: isToday ? '2px' : '1px'
              }}
            >
              {/* Day Header */}
              <div 
                className="p-3 border-b flex items-center justify-between"
                style={{
                  backgroundColor: isToday ? 'var(--color-inner-dark)' : 'transparent',
                  borderColor: 'var(--color-border)'
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black uppercase" style={{ color: isToday ? 'var(--color-primary)' : 'var(--color-text)' }}>
                    {dayName}
                  </span>
                  <span 
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isToday ? 'text-white' : ''}`}
                    style={isToday ? { backgroundColor: 'var(--color-primary)' } : { color: 'var(--color-text-secondary)' }}
                  >
                    {dayNumber}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openAddMealModal(dateKey)}
                  className="p-1 rounded-lg hover:opacity-80 transition cursor-pointer"
                  style={{ color: 'var(--color-primary)' }}
                  title={t('addMealForDay', 'Add Meal')}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Day Planned Meals List */}
              <div className="p-2.5 flex-1 space-y-2.5 min-h-[160px]">
                {dayMeals.length === 0 ? (
                  <div 
                    onClick={() => openAddMealModal(dateKey)}
                    className="h-full border border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-4 cursor-pointer hover:opacity-80 transition group"
                    style={{ borderColor: 'var(--color-border)', minHeight: '130px' }}
                  >
                    <Plus className="h-5 w-5 mb-1 group-hover:scale-110 transition" style={{ color: 'var(--color-text-secondary)' }} />
                    <span className="text-[11px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('noMealsPlannedYet', 'Empty slot')}
                    </span>
                  </div>
                ) : (
                  dayMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="p-2.5 rounded-2xl border transition group relative shadow-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)'
                      }}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span 
                          className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider"
                          style={{
                            backgroundColor: 'var(--color-card)',
                            color: 'var(--color-primary)'
                          }}
                        >
                          {meal.mealType}
                        </span>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => openEditMealModal(meal)}
                            className="p-1 rounded-md hover:bg-black/10 cursor-pointer"
                            title={t('editMealBtn', 'Edit')}
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMeal(meal.id)}
                            className="p-1 rounded-md hover:bg-red-500/20 text-red-500 cursor-pointer"
                            title={t('deleteMealBtn', 'Delete')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs font-bold line-clamp-2 leading-tight" style={{ color: 'var(--color-text)' }}>
                        {meal.recipeName}
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{meal.time}</span>
                        </div>
                        {meal.isLeftover && (
                          <span 
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ backgroundColor: 'var(--color-card)', color: '#f59e0b' }}
                          >
                            {t('leftoverBadge', 'Leftover')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ACCESSIBLE MODAL: ADD MEAL (FORMLESS DIV CONTAINER - Constraint 9) */}
      {showAddModal && (
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-label={t('addMealTitle', 'Schedule a Meal')}
          data-lpignore="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div 
            className="w-full max-w-lg rounded-3xl p-6 shadow-2xl border space-y-4 transition-colors duration-200"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                  <Plus className="h-4 w-4" /> {t('addMealTitle', 'Schedule a Meal')}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('forDate', 'For')}: <span className="font-bold">{selectedDateKey}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-full hover:opacity-75 transition cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Accessible Div Form Fields */}
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('mealSlotLabel', 'Meal Slot *')}
                </label>
                <select
                  value={inputMealType}
                  onChange={(e) => setInputMealType(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 outline-none font-bold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  {MEAL_TYPES.map(type => (
                    <option key={type} value={type} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('selectFromSavedRecipes', 'Select from Saved Recipes')}
                </label>
                <select
                  value={inputRecipeId}
                  onChange={(e) => {
                    setInputRecipeId(e.target.value);
                    const chosen = savedRecipes.find(r => r.id === e.target.value);
                    if (chosen) setInputCustomName(chosen.title || chosen.name || '');
                  }}
                  className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium cursor-pointer"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  <option value="">{t('orCustomDishBelow', '-- Or enter custom dish below --')}</option>
                  {savedRecipes.map(r => (
                    <option key={r.id} value={r.id} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>
                      {r.title || r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('customDishName', 'Dish / Recipe Name *')}
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  placeholder={t('dishNamePlaceholder', 'e.g. Avocado Toast or Protein Shake')}
                  value={inputCustomName}
                  onChange={(e) => setInputCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveAddMeal();
                    }
                  }}
                  className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                    {t('mealTimeLabel', 'Time')}
                  </label>
                  <input
                    type="time"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={inputTime}
                    onChange={(e) => setInputTime(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                    {t('servingsLabel', 'Servings')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={inputServings}
                    onChange={(e) => setInputServings(Math.max(1, Number(e.target.value)))}
                    className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('notesLabel', 'Notes')}
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  placeholder={t('notesPlaceholder', 'e.g. Prep chicken in the morning')}
                  value={inputNotes}
                  onChange={(e) => setInputNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveAddMeal();
                    }
                  }}
                  className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="add-leftover-check"
                  checked={inputIsLeftover}
                  onChange={(e) => setInputIsLeftover(e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <label htmlFor="add-leftover-check" className="font-semibold cursor-pointer" style={{ color: 'var(--color-text)' }}>
                  {t('markAsLeftover', 'Mark dish as leftover from previous meal')}
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                {t('cancelBtn', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveAddMeal}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition cursor-pointer hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {t('scheduleMealBtn', 'Schedule Meal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACCESSIBLE MODAL: EDIT MEAL (FORMLESS DIV CONTAINER - Constraint 9) */}
      {showEditModal && editingMeal && (
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-label={t('editMealTitle', 'Edit Meal Schedule')}
          data-lpignore="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div 
            className="w-full max-w-lg rounded-3xl p-6 shadow-2xl border space-y-4 transition-colors duration-200"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                  <Edit2 className="h-4 w-4" /> {t('editMealTitle', 'Edit Meal Schedule')}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {editingMeal.date} • {editingMeal.mealType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1 rounded-full hover:opacity-75 transition cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Formless Edit Fields */}
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('mealSlotLabel', 'Meal Slot *')}
                </label>
                <select
                  value={inputMealType}
                  onChange={(e) => setInputMealType(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 outline-none font-bold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  {MEAL_TYPES.map(type => (
                    <option key={type} value={type} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('dishNameLabel', 'Dish / Recipe Name *')}
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  value={inputCustomName}
                  onChange={(e) => setInputCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEditMeal();
                    }
                  }}
                  className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                    {t('mealTimeLabel', 'Time')}
                  </label>
                  <input
                    type="time"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={inputTime}
                    onChange={(e) => setInputTime(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                    {t('servingsLabel', 'Servings')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={inputServings}
                    onChange={(e) => setInputServings(Math.max(1, Number(e.target.value)))}
                    className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('notesLabel', 'Notes')}
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  value={inputNotes}
                  onChange={(e) => setInputNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEditMeal();
                    }
                  }}
                  className="w-full border rounded-xl px-3 py-2.5 outline-none font-medium"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-leftover-check"
                  checked={inputIsLeftover}
                  onChange={(e) => setInputIsLeftover(e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <label htmlFor="edit-leftover-check" className="font-semibold cursor-pointer" style={{ color: 'var(--color-text)' }}>
                  {t('markAsLeftover', 'Mark dish as leftover from previous meal')}
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                {t('cancelBtn', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveEditMeal}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition cursor-pointer hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {t('saveChangesBtn', 'Save Changes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
