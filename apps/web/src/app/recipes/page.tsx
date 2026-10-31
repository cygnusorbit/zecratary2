// @ts-nocheck
'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, SlidersHorizontal, Heart, Clock, Utensils,
  X, UploadCloud, BookmarkPlus, CalendarPlus, ShoppingCart,
  Timer, Edit3, Share2, Star, Check, Book, ChevronDown,
  Trash2, Save, Plus, ImagePlus, Users, Calendar,
  GripVertical, CheckSquare, CheckCircle2, Type, ExternalLink,
  Carrot, Hourglass, ChevronLeft, ChevronRight, LayoutGrid,
  Grid3X3, Rows3
} from 'lucide-react';
import { getCurrentUser, User, initAuthStorage } from '@/lib/auth';
import { syncUserSavedRecipes, persistSavedRecipe, deleteSavedRecipe } from '@/lib/recipeSync';
import { getStoredCategories } from '@/lib/categories';
import { useTranslation } from '@/components/LanguageProvider';

const RECIPE_TYPES = [
  'All Types',
  'Appetiser',
  'Main Dish',
  'Side Dish',
  'Dessert',
  'Snack',
  'Breakfast',
  'Lunch'
];

type GridMode = '3x3' | '4x4' | '5x5';

const GRID_CONFIG: Record<GridMode, { colsClass: string; perPage: number; label: string; imgHeight: string; titleSize: string }> = {
  '3x3': {
    colsClass: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    perPage: 9,
    label: '3×3',
    imgHeight: 'h-44',
    titleSize: 'text-base'
  },
  '4x4': {
    colsClass: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    perPage: 16,
    label: '4×4',
    imgHeight: 'h-36',
    titleSize: 'text-sm'
  },
  '5x5': {
    colsClass: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
    perPage: 25,
    label: '5×5',
    imgHeight: 'h-28',
    titleSize: 'text-xs'
  }
};

const isRecipeInBook = (rec: any, bookId: string): boolean => {
  if (!rec || !bookId) return false;
  return rec.bookId === bookId || rec.book_id === bookId;
};

export default function RecipesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterCooked, setFilterCooked] = useState(false);
  
  // Ingredients Filter State
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [selectedIngredientsList, setSelectedIngredientsList] = useState<string[]>([]);

  // Dropdown Filters
  const [selectedType, setSelectedType] = useState('All Types');
  const [selectedRating, setSelectedRating] = useState('All Ratings');
  const [selectedPrepTime, setSelectedPrepTime] = useState('All Prep Times');
  const [selectedCookTime, setSelectedCookTime] = useState('All Cook Times');

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);

  // Add to Plan / Calendar Modal State
  const [showAddToPlanModal, setShowAddToPlanModal] = useState(false);
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [planMealType, setPlanMealType] = useState('Dinner');
  const [planTime, setPlanTime] = useState('');
  const [planNotes, setPlanNotes] = useState('');

  // Edit Mode & Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editTab, setEditTab] = useState<'info' | 'ingredients' | 'steps'>('info');
  const [editForm, setEditForm] = useState<any>({
    title: '',
    description: '',
    recipeType: 'Main Dish',
    sourceUrl: '',
    servings: 4,
    prepTimeMinutes: 30,
    cookTimeMinutes: 10,
    imageUrl: '',
    ingredients: [],
    instructions: []
  });

  const [isReorderingIngredients, setIsReorderingIngredients] = useState(false);
  const [isReorderingSteps, setIsReorderingSteps] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // View States
  const [servingsMultiplier, setServingsMultiplier] = useState(1);
  const [fontSizeScale, setFontSizeScale] = useState(80);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [noteText, setNoteText] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Grid Density & Pagination States
  const [gridMode, setGridMode] = useState<GridMode>('3x3');
  const [currentPage, setCurrentPage] = useState(1);

  // Shopping List Modal State
  const [isShoppingModalOpen, setIsShoppingModalOpen] = useState(false);
  const [shoppingModalIngredients, setShoppingModalIngredients] = useState<any[]>([]);

  const defaultBooks = [
    { id: 'book_1', title: 'Family Favorites & Weeknight Dinners', description: 'Quick and easy meals.' },
    { id: 'book_2', title: 'Authentic Asian Cuisine', description: 'Traditional recipes & stir-fries.' },
    { id: 'book_3', title: 'Baking & Desserts', description: 'Sweet treats & pastries.' }
  ];

  const applyGlobalTheme = useCallback(() => {
    try {
      window.dispatchEvent(new Event('zecratary_theme_updated'));
    } catch (_) {}
  }, []);

  const getCleanRecipeType = (rec: any): string => {
    const raw = rec.recipeType || rec.category || (Array.isArray(rec.tags) ? rec.tags[0] : 'Main Dish');
    if (raw === 'Appetizer' || raw === 'Appetiser') return 'Appetiser';
    if (RECIPE_TYPES.includes(raw)) return raw;
    return 'Main Dish';
  };

  const getSafeHostname = (urlStr: string) => {
    if (!urlStr || typeof urlStr !== 'string') return 'source website';
    try {
      const normalized = urlStr.startsWith('http://') || urlStr.startsWith('https://') 
        ? urlStr 
        : `https://${urlStr}`;
      return new URL(normalized).hostname.replace('www.', '');
    } catch {
      return urlStr.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || 'source website';
    }
  };

  const getSafeHref = (urlStr: string) => {
    if (!urlStr) return '#';
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) return urlStr;
    return `https://${urlStr}`;
  };

  const loadData = useCallback(async (user: User | null) => {
    if (!user) return;
    setCategories(getStoredCategories());
    const targetUserId = (user.id || 'usr_admin_1').trim();

    try {
      setLoading(true);
      const rawRecipes = await syncUserSavedRecipes(targetUserId);

      const userRecipes = rawRecipes.map((r: any) => {
        const cleanType = getCleanRecipeType(r);
        return {
          ...r,
          userId: targetUserId,
          recipeType: cleanType,
          category: cleanType,
          bookId: r.book_id || r.bookId || null,
          isFavorite: Boolean(r.is_favorite || r.isFavorite),
          is_favorite: Boolean(r.is_favorite || r.isFavorite),
          isCooked: Boolean(r.is_cooked || r.isCooked),
          is_cooked: Boolean(r.is_cooked || r.isCooked),
          rating: Number(r.rating) || 0,
          note: r.note || '',
          sourceUrl: r.source_url || r.sourceUrl || '',
          source_url: r.source_url || r.sourceUrl || '',
          tags: [cleanType, ...(Array.isArray(r.tags) ? r.tags.filter((t: string) => t !== 'Imported' && t !== cleanType) : [])]
        };
      });

      setRecipes(userRecipes);

      let parsedBooks = defaultBooks;
      try {
        const bRes = await fetch(`/api/books?userId=${encodeURIComponent(targetUserId)}`, { cache: 'no-store' });
        if (bRes.ok) {
          const bData = await bRes.json();
          if (Array.isArray(bData.books) && bData.books.length > 0) parsedBooks = bData.books;
        }
      } catch (_) {}

      const localBooks = localStorage.getItem('zecratary_recipe_books') || localStorage.getItem('zecratary_cookbooks');
      if (localBooks) {
        try {
          const parsed = JSON.parse(localBooks);
          if (Array.isArray(parsed) && parsed.length > 0) parsedBooks = parsed;
        } catch (_) {}
      }

      const userBooks = parsedBooks.filter((b: any) => {
        if (!b.userId && !b.createdBy) return true;
        if (b.userId) return b.userId === targetUserId;
        return b.createdBy === user.email || b.createdBy === targetUserId;
      });

      setBooks(userBooks.map((b: any) => ({
        ...b,
        recipeCount: userRecipes.filter((r: any) => r.bookId === b.id || (Array.isArray(b.recipeIds) && b.recipeIds.includes(r.id))).length
      })));
    } catch (e) {
      console.error('[RecipesPage] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    applyGlobalTheme();
    window.addEventListener('zecratary_theme_mode_changed', applyGlobalTheme);
    window.addEventListener('zecratary_theme_changed', applyGlobalTheme);
    window.addEventListener('zecratary_theme_updated', applyGlobalTheme);
    window.addEventListener('storage', applyGlobalTheme);

    return () => {
      window.removeEventListener('zecratary_theme_mode_changed', applyGlobalTheme);
      window.removeEventListener('zecratary_theme_changed', applyGlobalTheme);
      window.removeEventListener('zecratary_theme_updated', applyGlobalTheme);
      window.removeEventListener('storage', applyGlobalTheme);
    };
  }, [applyGlobalTheme]);

  useEffect(() => {
    document.title = `${t('recipesTitle') || t('savedRecipesTitle') || 'Recipes'} - FoodiePrep`;
    initAuthStorage();
    const user = getCurrentUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    setCurrentUser(user);
    loadData(user);

    const handleSync = () => {
      const activeUser = getCurrentUser();
      if (activeUser) {
        setCurrentUser(activeUser);
        loadData(activeUser);
      }
    };

    window.addEventListener('zecratary_saved_recipes_updated', handleSync);
    window.addEventListener('zecratary_recipes_updated', handleSync);
    window.addEventListener('zecratary_recipe_books_updated', handleSync);
    window.addEventListener('zecratary_categories_changed', handleSync);
    window.addEventListener('zecratary_auth_changed', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener('zecratary_saved_recipes_updated', handleSync);
      window.removeEventListener('zecratary_recipes_updated', handleSync);
      window.removeEventListener('zecratary_recipe_books_updated', handleSync);
      window.removeEventListener('zecratary_categories_changed', handleSync);
      window.removeEventListener('zecratary_auth_changed', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [loadData, router, t]);

  const saveAllRecipes = (updatedUserList: any[]) => {
    if (!currentUser) return;
    const targetUserId = currentUser.id || 'usr_admin_1';

    const updatedWithId = updatedUserList.map(r => ({
      ...r,
      userId: targetUserId,
      user_id: targetUserId,
      bookId: r.bookId || r.book_id || null,
      book_id: r.bookId || r.book_id || null,
      isFavorite: Boolean(r.isFavorite ?? r.is_favorite),
      is_favorite: Boolean(r.isFavorite ?? r.is_favorite),
      isCooked: Boolean(r.isCooked ?? r.is_cooked),
      is_cooked: Boolean(r.isCooked ?? r.is_cooked),
      rating: Number(r.rating) || 0,
      note: r.note || '',
      sourceUrl: r.sourceUrl || r.source_url || '',
      source_url: r.sourceUrl || r.source_url || ''
    }));

    setRecipes(updatedWithId);

    persistSavedRecipe(targetUserId, updatedWithId).then(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_recipes_updated'));
      }
    }).catch((err) => {
      console.error('[RecipesPage] Error saving recipes:', err);
    });

    const updatedBooks = books.map((b: any) => ({
      ...b,
      recipeCount: updatedWithId.filter((r: any) => r.bookId === b.id || (Array.isArray(b.recipeIds) && b.recipeIds.includes(r.id))).length
    }));
    setBooks(updatedBooks);
  };

  const toggleFavorite = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const target = recipes.find(r => r.id === id);
    if (!target) return;
    const newFav = !target.isFavorite;

    const updated = recipes.map(r => r.id === id ? { ...r, isFavorite: newFav, is_favorite: newFav } : r);
    setRecipes(updated);

    if (selectedRecipe?.id === id) {
      setSelectedRecipe({ ...selectedRecipe, isFavorite: newFav, is_favorite: newFav });
    }

    saveAllRecipes(updated);

    try {
      await fetch('/api/recipes/saved', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isFavorite: newFav, is_favorite: newFav })
      });
      window.dispatchEvent(new Event('zecratary_recipes_updated'));
    } catch (_) {}
  };

  const toggleCooked = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const target = recipes.find(r => r.id === id);
    if (!target) return;
    const newCooked = !target.isCooked;

    const updated = recipes.map(r => r.id === id ? { ...r, isCooked: newCooked, is_cooked: newCooked } : r);
    setRecipes(updated);

    if (selectedRecipe?.id === id) {
      setSelectedRecipe({ ...selectedRecipe, isCooked: newCooked, is_cooked: newCooked });
    }

    saveAllRecipes(updated);

    try {
      await fetch('/api/recipes/saved', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isCooked: newCooked, is_cooked: newCooked })
      });
      window.dispatchEvent(new Event('zecratary_recipes_updated'));
    } catch (_) {}
  };

  const handleAssignToBook = async (bookId: string) => {
    if (!selectedRecipe) return;
    const isRemoving = isRecipeInBook(selectedRecipe, bookId);
    const targetBookId = isRemoving ? null : bookId;
    
    const updatedRecipe = {
      ...selectedRecipe,
      bookId: targetBookId,
      book_id: targetBookId
    };
    setSelectedRecipe(updatedRecipe);

    const updatedRecipes = recipes.map(r => r.id === selectedRecipe.id ? updatedRecipe : r);
    setRecipes(updatedRecipes);

    try {
      await fetch('/api/recipes/saved', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRecipe.id, bookId: targetBookId, book_id: targetBookId })
      });
      window.dispatchEvent(new Event('zecratary_recipes_updated'));
      window.dispatchEvent(new Event('zecratary_saved_recipes_updated'));
      window.dispatchEvent(new Event('zecratary_recipe_books_updated'));
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error('Error assigning recipe to book:', err);
    }
  };

  const openAddToPlanModal = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    setPlanDate(todayStr);
    setPlanMealType('Dinner');
    setPlanTime('19:00');
    setPlanNotes('');
    setShowAddToPlanModal(true);
  };

  const handleSaveToCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipe || !currentUser) return;

    const recName = selectedRecipe.title || selectedRecipe.name || 'Untitled Recipe';
    const recImage = selectedRecipe.imageUrl || selectedRecipe.image || selectedRecipe.image_url || '/recipes/images/default.jpg';
    const targetUserId = currentUser.id || 'usr_admin_1';

    const newPlanItem = {
      id: 'plan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: targetUserId,
      user_id: targetUserId,
      createdBy: currentUser.email || 'user@zecratary.local',
      creatorName: currentUser.name || 'User',
      date: planDate,
      recipeId: selectedRecipe.id,
      recipe_id: selectedRecipe.id,
      recipeName: recName,
      title: recName,
      image: recImage,
      imageUrl: recImage,
      image_url: recImage,
      mealType: planMealType,
      time: planTime || '',
      notes: planNotes || '',
      servings: currentTotalServings || selectedRecipe.servings || 4,
      prepTimeMinutes: selectedRecipe.prepTimeMinutes || 15,
      cookTimeMinutes: selectedRecipe.cookTimeMinutes || 25,
      recipe: selectedRecipe,
      isLeftover: false,
      createdAt: new Date().toISOString()
    };

    try {
      const planKeys = ['zecratary_meal_plan', 'zecratary_meal_plans'];
      for (const k of planKeys) {
        const raw = localStorage.getItem(k);
        const currentPlan = raw ? JSON.parse(raw) : [];
        const updated = Array.isArray(currentPlan) ? [...currentPlan, newPlanItem] : [newPlanItem];
        localStorage.setItem(k, JSON.stringify(updated));
      }
    } catch (_) {}

    try {
      await Promise.allSettled([
        fetch('/api/planner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPlanItem)
        }),
        fetch('/api/meal-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPlanItem)
        }),
        fetch('/api/meal-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPlanItem)
        })
      ]);
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('zecratary_planner_updated'));
      window.dispatchEvent(new Event('zecratary_meal_plan_updated'));
      window.dispatchEvent(new Event('zecratary_meal_plans_updated'));
      window.dispatchEvent(new Event('storage'));
    }

    setShowAddToPlanModal(false);
    const alertMsg = (t('scheduledMealAlert') || 'Successfully scheduled "{title}" in your meal plan!')
      .replace('{title}', recName);
    alert(alertMsg);
  };

  const updateSelectedRecipeState = async (key: string, val: any) => {
    if (!selectedRecipe) return;
    const updatedRec = { ...selectedRecipe, [key]: val };
    if (key === 'isFavorite') updatedRec.is_favorite = val;
    if (key === 'isCooked') updatedRec.is_cooked = val;
    if (key === 'bookId') updatedRec.book_id = val;

    setSelectedRecipe(updatedRec);
    const updatedList = recipes.map(r => r.id === updatedRec.id ? updatedRec : r);
    saveAllRecipes(updatedList);

    try {
      await fetch('/api/recipes/saved', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRecipe.id, [key]: val })
      });
      window.dispatchEvent(new Event('zecratary_recipes_updated'));
    } catch (_) {}
  };

  const handleDeleteRecipe = async (id: string) => {
    if (!confirm(t('confirmDeleteRecipe') || 'Are you sure you want to delete this recipe?')) return;
    
    try {
      await Promise.allSettled([
        fetch(`/api/recipes/saved?id=${encodeURIComponent(id)}`, { 
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        }),
        fetch(`/api/saved-recipes?id=${encodeURIComponent(id)}`, { 
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        }),
        fetch(`/api/recipes?id=${encodeURIComponent(id)}`, { 
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        })
      ]);

      if (typeof deleteSavedRecipe === 'function') {
        await deleteSavedRecipe(currentUser?.id || 'usr_admin_1', id).catch(() => {});
      }

      const updated = recipes.filter(r => r.id !== id);
      setRecipes(updated);
      setSelectedRecipe(null);
      setIsEditing(false);

      const updatedBooks = books.map((b: any) => ({
        ...b,
        recipeCount: updated.filter((r: any) => r.bookId === b.id || (Array.isArray(b.recipeIds) && b.recipeIds.includes(r.id))).length
      }));
      setBooks(updatedBooks);

      try {
        const localKeys = ['zecratary_saved_recipes', 'zecratary_recipes', 'zecratary_user_recipes', 'saved_recipes', 'zecratary_imported_recipes'];
        for (const k of localKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              const cleaned = arr.filter((x: any) => x.id !== id);
              localStorage.setItem(k, JSON.stringify(cleaned));
            }
          }
        }
      } catch (_) {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_recipes_updated'));
        window.dispatchEvent(new Event('zecratary_saved_recipes_updated'));
      }
    } catch (err) {
      console.error('[RecipesPage] Error deleting recipe:', err);
      alert(t('errorDeletingRecipe') || 'Failed to delete recipe. Please try again.');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditForm((prev: any) => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number, type: 'ingredients' | 'steps') => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    if (type === 'ingredients') {
      const list = [...editForm.ingredients];
      const item = list[draggedIndex];
      list.splice(draggedIndex, 1);
      list.splice(index, 0, item);
      setEditForm({ ...editForm, ingredients: list });
      setDraggedIndex(index);
    } else {
      const list = [...editForm.instructions];
      const item = list[draggedIndex];
      list.splice(draggedIndex, 1);
      list.splice(index, 0, item);
      setEditForm({ ...editForm, instructions: list });
      setDraggedIndex(index);
    }
  };

  const handleDrop = () => {
    setDraggedIndex(null);
  };

  const handleOpenEdit = () => {
    if (!selectedRecipe) return;
    const defaultCat = categories[0] || 'Produce';
    const cleanType = getCleanRecipeType(selectedRecipe);

    let rawIngredients = selectedRecipe.ingredients;
    if (typeof rawIngredients === 'string') {
      try { rawIngredients = JSON.parse(rawIngredients); } catch (_) { rawIngredients = [rawIngredients]; }
    }
    if (!Array.isArray(rawIngredients)) rawIngredients = [];

    setEditForm({
      title: selectedRecipe.title || selectedRecipe.name || '',
      description: selectedRecipe.description || '',
      recipeType: cleanType,
      sourceUrl: selectedRecipe.sourceUrl || selectedRecipe.source_url || '',
      servings: selectedRecipe.servings || 4,
      prepTimeMinutes: selectedRecipe.prepTimeMinutes || 30,
      cookTimeMinutes: selectedRecipe.cookTimeMinutes || 10,
      imageUrl: selectedRecipe.imageUrl || selectedRecipe.image || '',
      ingredients: rawIngredients.length > 0
        ? rawIngredients.map((ing: any) => ({
            amount: typeof ing === 'string' ? '' : ing.amount || ing.quantity || '',
            unit: typeof ing === 'string' ? '' : ing.unit || '',
            item: typeof ing === 'string' ? ing : ing.item || ing.name || '',
            category: typeof ing === 'string' ? defaultCat : ing.category || defaultCat
          }))
        : [{ amount: '', unit: '', item: '', category: defaultCat }],
      instructions: selectedRecipe.instructions && selectedRecipe.instructions.length > 0
        ? [...selectedRecipe.instructions]
        : ['']
    });
    setEditTab('info');
    setIsReorderingIngredients(false);
    setIsReorderingSteps(false);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!editForm.title.trim()) {
      alert(t('enterRecipeTitleAlert') || 'Please enter a recipe title.');
      setEditTab('info');
      return;
    }

    const cleanType = getCleanRecipeType(editForm);

    const updatedRec = {
      ...selectedRecipe,
      ...editForm,
      userId: currentUser?.id || selectedRecipe.userId || 'usr_admin_1',
      recipeType: cleanType,
      category: cleanType,
      tags: [cleanType]
    };

    setSelectedRecipe(updatedRec);
    const updatedList = recipes.map(r => r.id === updatedRec.id ? updatedRec : r);
    saveAllRecipes(updatedList);
    setIsEditing(false);
  };

  const calculateScaledAmount = (rawAmt: any, baseServings: number, currentServings: number) => {
    if (!rawAmt || isNaN(Number(rawAmt))) {
      if (typeof rawAmt === 'string' && rawAmt.includes('/')) {
        try {
          const parts = rawAmt.trim().split(' ');
          let fractionValue = 0;
          if (parts.length === 2) {
            const [num, den] = parts[1].split('/').map(Number);
            fractionValue = Number(parts[0]) + (num / den);
          } else {
            const [num, den] = parts[0].split('/').map(Number);
            fractionValue = num / den;
          }
          const scaled = (fractionValue / (baseServings || 4)) * currentServings;
          return Number.isInteger(scaled) ? scaled : Number(scaled.toFixed(2));
        } catch {
          return rawAmt;
        }
      }
      return rawAmt;
    }

    const num = Number(rawAmt);
    const scaled = (num / (baseServings || 4)) * currentServings;
    return Number.isInteger(scaled) ? scaled : Number(scaled.toFixed(2));
  };

  const parseIngredientString = (rawStr: string, defaultCat: string) => {
    const trimmed = String(rawStr || '').trim();
    if (!trimmed) return { amount: '1', unit: 'unit', item: '', category: defaultCat };

    const regex = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(?:of\s+)?(.*)$/i;
    const match = trimmed.match(regex);

    if (match) {
      const amount = match[1].trim();
      const possibleUnit = (match[2] || '').trim().toLowerCase();
      const rest = match[3].trim();

      const knownUnits = [
        'cup', 'cups', 'tbsp', 'tbs', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
        'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams', 'kg',
        'ml', 'l', 'liter', 'liters', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices',
        'pinch', 'pinches', 'bunch', 'bunches', 'stalk', 'stalks', 'piece', 'pieces', 'dash'
      ];

      if (knownUnits.includes(possibleUnit)) {
        return { amount, unit: possibleUnit, item: rest || trimmed, category: defaultCat };
      } else if (possibleUnit) {
        return { amount, unit: '', item: `${possibleUnit} ${rest}`.trim(), category: defaultCat };
      }
    }

    return { amount: '1', unit: '', item: trimmed, category: defaultCat };
  };

  const handleOpenShoppingModal = () => {
    if (!selectedRecipe) return;
    const defaultCat = categories[0] || 'Produce';
    const baseServings = selectedRecipe.servings || 4;
    const totalServings = baseServings * servingsMultiplier;

    let rawIngredients = selectedRecipe.ingredients;
    if (typeof rawIngredients === 'string') {
      try { rawIngredients = JSON.parse(rawIngredients); } catch (_) { rawIngredients = [rawIngredients]; }
    }
    if (!Array.isArray(rawIngredients)) rawIngredients = [];

    const items = rawIngredients.map((ing: any, idx: number) => {
      let parsed = { amount: '', unit: '', item: '', category: defaultCat };

      if (typeof ing === 'string') {
        parsed = parseIngredientString(ing, defaultCat);
      } else if (ing && typeof ing === 'object') {
        parsed = {
          amount: String(ing.amount || ing.quantity || '').trim(),
          unit: String(ing.unit || '').trim(),
          item: String(ing.item || ing.name || '').trim(),
          category: String(ing.category || defaultCat).trim()
        };
      }

      const scaledAmt = calculateScaledAmount(parsed.amount, baseServings, totalServings);

      return {
        id: 'shop_item_' + idx + '_' + Math.random().toString(36).substring(2, 6),
        selected: true,
        amount: scaledAmt !== '' ? scaledAmt : (parsed.amount || '1'),
        unit: parsed.unit || '',
        name: parsed.item || 'Ingredient',
        category: parsed.category || defaultCat
      };
    });

    setShoppingModalIngredients(items);
    setIsShoppingModalOpen(true);
  };

  const handleConfirmAddToShoppingList = async () => {
    const selectedItems = shoppingModalIngredients.filter(i => i.selected);
    if (selectedItems.length === 0) {
      alert(t('noIngredientsSelectedAlert') || 'No ingredients selected.');
      return;
    }

    const recTitle = selectedRecipe?.title || selectedRecipe?.name || 'Recipe';
    const recId = selectedRecipe?.id;
    const targetUserId = currentUser?.id || 'usr_admin_1';

    const formatted = selectedItems.map(i => ({
      id: 'shop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: targetUserId,
      user_id: targetUserId,
      createdBy: currentUser?.email || 'user@zecratary.local',
      creatorName: currentUser?.name || 'User',
      name: i.name,
      item: i.name,
      amount: String(i.amount || '1'),
      quantity: String(i.amount || '1'),
      unit: i.unit || 'unit',
      category: i.category || (categories[0] || 'Produce'),
      checked: false,
      completed: false,
      recipeId: recId,
      recipeTitle: recTitle,
      createdAt: new Date().toISOString()
    }));

    try {
      const keys = ['zecratary_shopping_list', 'zecratary_shopping'];
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        const currentList = raw ? JSON.parse(raw) : [];
        const updated = Array.isArray(currentList) ? [...formatted, ...currentList] : formatted;
        localStorage.setItem(k, JSON.stringify(updated));
      }
    } catch (_) {}

    try {
      await Promise.allSettled([
        fetch('/api/shopping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formatted)
        }),
        fetch('/api/shopping-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formatted)
        })
      ]);
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('zecratary_shopping_updated'));
      window.dispatchEvent(new Event('zecratary_shopping_list_updated'));
      window.dispatchEvent(new Event('storage'));
    }

    setIsShoppingModalOpen(false);
    const alertMsg = (t('addedItemsShoppingAlert') || 'Added {count} items to your Shopping List!')
      .replace('{count}', String(selectedItems.length));
    alert(alertMsg);
  };

  const handleAddIngredientFilter = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = ingredientQuery.trim();
    if (!clean) return;
    if (!selectedIngredientsList.includes(clean.toLowerCase())) {
      setSelectedIngredientsList([...selectedIngredientsList, clean.toLowerCase()]);
    }
    setIngredientQuery('');
  };

  const handleRemoveIngredientFilter = (ing: string) => {
    setSelectedIngredientsList(selectedIngredientsList.filter(i => i !== ing));
  };

  const filtered = useMemo(() => {
    return recipes.filter(r => {
      const q = search.toLowerCase().trim();
      const title = (r.title || r.name || '').toLowerCase();
      if (q && !title.includes(q)) return false;

      if (filterFavorites && !r.isFavorite) return false;
      if (filterCooked && !r.isCooked) return false;

      if (selectedType !== 'All Types') {
        const type = getCleanRecipeType(r);
        if (type !== selectedType) return false;
      }

      if (selectedIngredientsList.length > 0) {
        let rIng = r.ingredients;
        if (typeof rIng === 'string') {
          try { rIng = JSON.parse(rIng); } catch (_) { rIng = []; }
        }
        const recipeIngNames = Array.isArray(rIng) 
          ? rIng.map((ing: any) => (typeof ing === 'string' ? ing : ing.item || ing.name || '').toLowerCase())
          : [];
        
        const hasAll = selectedIngredientsList.every(targetIng => 
          recipeIngNames.some(item => item.includes(targetIng))
        );
        if (!hasAll) return false;
      }

      if (selectedRating !== 'All Ratings') {
        const minRating = parseInt(selectedRating);
        if ((r.rating || 0) < minRating) return false;
      }

      if (selectedPrepTime !== 'All Prep Times') {
        const prep = r.prepTimeMinutes || 0;
        if (selectedPrepTime === 'Under 15m' && prep > 15) return false;
        if (selectedPrepTime === '15-30m' && (prep < 15 || prep > 30)) return false;
        if (selectedPrepTime === 'Over 30m' && prep < 30) return false;
      }

      if (selectedCookTime !== 'All Cook Times') {
        const cook = r.cookTimeMinutes || 0;
        if (selectedCookTime === 'Under 15m' && cook > 15) return false;
        if (selectedCookTime === '15-30m' && (cook < 15 || cook > 30)) return false;
        if (selectedCookTime === 'Over 30m' && cook < 30) return false;
      }

      return true;
    });
  }, [recipes, search, filterFavorites, filterCooked, selectedType, selectedIngredientsList, selectedRating, selectedPrepTime, selectedCookTime]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterFavorites, filterCooked, selectedType, selectedIngredientsList, selectedRating, selectedPrepTime, selectedCookTime, gridMode]);

  const itemsPerPage = GRID_CONFIG[gridMode].perPage;
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const paginatedRecipes = filtered.slice(startIndex, startIndex + itemsPerPage);

  const assignedBook = books.find(b => b.id === (selectedRecipe?.bookId || selectedRecipe?.book_id));
  const baseServings = selectedRecipe?.servings || 4;
  const currentTotalServings = baseServings * servingsMultiplier;
  const recipeCategoryBadge = selectedRecipe ? getCleanRecipeType(selectedRecipe) : 'Main Dish';

  return (
    <div 
      className="max-w-6xl mx-auto space-y-6 pb-16 px-4 font-sans transition-colors duration-200" 
      style={{ color: 'var(--color-text)' }}
      onClick={() => setOpenDropdown(null)}
      data-lpignore="true"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-primary)]">
            {t('recipesTitle') || t('savedRecipesTitle') || 'Recipes'}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {(t('savedRecipesSubtitle') || 'Your collection of favorite recipes ({count})').replace('{count}', String(recipes.length))}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div 
            className="flex items-center p-1 rounded-xl border shadow-sm"
            style={{
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: 'var(--color-border)'
            }}
          >
            {(['3x3', '4x4', '5x5'] as GridMode[]).map((mode) => {
              const isActive = gridMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGridMode(mode)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  style={isActive ? {
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(224, 86, 56, 0.3)'
                  } : {
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'transparent'
                  }}
                  title={`Show ${GRID_CONFIG[mode].label} layout (${GRID_CONFIG[mode].perPage} per page)`}
                >
                  {mode === '3x3' && <Grid3X3 className="h-3.5 w-3.5" />}
                  {mode === '4x4' && <LayoutGrid className="h-3.5 w-3.5" />}
                  {mode === '5x5' && <Rows3 className="h-3.5 w-3.5" />}
                  <span>{GRID_CONFIG[mode].label}</span>
                </button>
              );
            })}
          </div>

          <Link 
            className="text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg"
            href="/manual"
            style={{ backgroundColor: 'var(--color-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
          >
            <UploadCloud className="h-4 w-4"/> {t('createRecipe') || 'Create Recipe'}
          </Link>
        </div>
      </div>

      {/* Filter Row */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3.5 top-3.5 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }}/>
            <input
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              placeholder={t('searchByNamePlaceholder') || 'Search by name'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            />
          </div>
          <button 
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="border font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            style={showFilters ? {
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: 'var(--color-emerald)',
              color: 'var(--color-emerald)'
            } : {
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <SlidersHorizontal className="h-4 w-4" style={{ color: 'var(--color-emerald)' }}/> {t('filter') || 'Filter'}
          </button>
        </div>

        {/* Filter Pills */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-in fade-in text-xs font-semibold select-none">
            <button
              type="button"
              onClick={() => setFilterFavorites(!filterFavorites)}
              className="px-3.5 py-2 rounded-2xl border flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              style={filterFavorites ? {
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-primary)',
                color: 'var(--color-primary)'
              } : {
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              <Heart className={`h-3.5 w-3.5 ${filterFavorites ? 'fill-current' : ''}`} style={{ color: filterFavorites ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}/>
              <span>{t('favorites') || 'Favorites'}</span>
            </button>

            {/* Ingredients Popover Filter */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'ingredients' ? null : 'ingredients')}
                className="px-3.5 py-2 rounded-2xl border flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                style={selectedIngredientsList.length > 0 || openDropdown === 'ingredients' ? {
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)'
                } : {
                  backgroundColor: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <Carrot className="h-3.5 w-3.5" style={{ color: 'var(--color-emerald)' }}/>
                <span>{t('ingredientsFilter') || 'Ingredients'} {selectedIngredientsList.length > 0 ? `(${selectedIngredientsList.length})` : ''}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70"/>
              </button>

              {openDropdown === 'ingredients' && (
                <div 
                  className="absolute left-0 top-full mt-2 w-72 border rounded-2xl shadow-2xl p-3 z-50 space-y-2.5 animate-in fade-in"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-primary)'
                  }}
                >
                  <form onSubmit={handleAddIngredientFilter} className="flex items-center gap-2" data-lpignore="true">
                    <div 
                      className="flex-1 border-2 rounded-xl overflow-hidden"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-primary)'
                      }}
                    >
                      <input
                        type="text"
                        autoFocus
                        autoComplete="off"
                        data-lpignore="true"
                        data-form-type="other"
                        placeholder={t('searchIngredientsPlaceholder') || 'Search ingredients'}
                        value={ingredientQuery}
                        onChange={(e) => setIngredientQuery(e.target.value)}
                        className="w-full bg-transparent px-3 py-2 text-xs outline-none"
                        style={{ color: 'var(--color-text)' }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="text-white p-2 rounded-xl transition flex items-center justify-center font-bold text-sm shadow-md cursor-pointer shrink-0"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      <Plus className="h-4 w-4 stroke-[3]"/>
                    </button>
                  </form>

                  {selectedIngredientsList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {selectedIngredientsList.map((ing) => (
                        <span
                          key={ing}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 border"
                          style={{
                            backgroundColor: 'var(--color-inner-dark)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text)'
                          }}
                        >
                          <span className="capitalize">{ing}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredientFilter(ing)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <X className="h-3 w-3"/>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] leading-tight pt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('recipesMustContainIngredients') || 'Recipes must contain all listed ingredients.'}
                  </p>
                </div>
              )}
            </div>

            {/* Recipe Type Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'recipeType' ? null : 'recipeType')}
                className="px-3.5 py-2 rounded-2xl border flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                style={selectedType !== 'All Types' ? {
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)'
                } : {
                  backgroundColor: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <Utensils className="h-3.5 w-3.5 opacity-70"/>
                <span>{selectedType === 'All Types' ? (t('recipeTypeLabel') || 'Recipe Type') : selectedType}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70"/>
              </button>

              {openDropdown === 'recipeType' && (
                <div 
                  className="absolute left-0 top-full mt-2 w-48 border rounded-2xl shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  {RECIPE_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setSelectedType(type); setOpenDropdown(null); }}
                      className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition"
                      style={selectedType === type ? {
                        backgroundColor: 'var(--color-inner-dark)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-primary)'
                      } : {
                        color: 'var(--color-text-secondary)'
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cooked Pill */}
            <button
              type="button"
              onClick={() => setFilterCooked(!filterCooked)}
              className="px-3.5 py-2 rounded-2xl border flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              style={filterCooked ? {
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-emerald)',
                color: 'var(--color-emerald)'
              } : {
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" style={{ color: filterCooked ? 'var(--color-emerald)' : 'var(--color-text-secondary)' }}/>
              <span>{t('cooked') || 'Cooked'}</span>
            </button>

            {/* Rating Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'rating' ? null : 'rating')}
                className="px-3.5 py-2 rounded-2xl border flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                style={selectedRating !== 'All Ratings' ? {
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)'
                } : {
                  backgroundColor: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <Star className="h-3.5 w-3.5 opacity-70"/>
                <span>{selectedRating === 'All Ratings' ? (t('rating') || 'Rating') : selectedRating}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70"/>
              </button>

              {openDropdown === 'rating' && (
                <div 
                  className="absolute left-0 top-full mt-2 w-44 border rounded-2xl shadow-2xl p-1.5 z-50 space-y-1"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  {['All Ratings', '4+ Stars', '3+ Stars', '1+ Stars'].map((rat) => (
                    <button
                      key={rat}
                      type="button"
                      onClick={() => { setSelectedRating(rat); setOpenDropdown(null); }}
                      className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition"
                      style={selectedRating === rat ? {
                        backgroundColor: 'var(--color-inner-dark)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)'
                      } : {
                        color: 'var(--color-text-secondary)'
                      }}
                    >
                      {rat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Prep Time Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'prepTime' ? null : 'prepTime')}
                className="px-3.5 py-2 rounded-2xl border flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                style={selectedPrepTime !== 'All Prep Times' ? {
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-emerald)',
                  color: 'var(--color-emerald)'
                } : {
                  backgroundColor: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <Hourglass className="h-3.5 w-3.5 opacity-70"/>
                <span>{selectedPrepTime === 'All Prep Times' ? (t('prepTime') || 'Prep Time') : selectedPrepTime}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70"/>
              </button>

              {openDropdown === 'prepTime' && (
                <div 
                  className="absolute left-0 top-full mt-2 w-44 border rounded-2xl shadow-2xl p-1.5 z-50 space-y-1"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  {['All Prep Times', 'Under 15m', '15-30m', 'Over 30m'].map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => { setSelectedPrepTime(time); setOpenDropdown(null); }}
                      className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition"
                      style={selectedPrepTime === time ? {
                        backgroundColor: 'var(--color-inner-dark)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)'
                      } : {
                        color: 'var(--color-text-secondary)'
                      }}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cook Time Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'cookTime' ? null : 'cookTime')}
                className="px-3.5 py-2 rounded-2xl border flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                style={selectedCookTime !== 'All Cook Times' ? {
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-emerald)',
                  color: 'var(--color-emerald)'
                } : {
                  backgroundColor: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <Clock className="h-3.5 w-3.5 opacity-70"/>
                <span>{selectedCookTime === 'All Cook Times' ? (t('cookTime') || 'Cook Time') : selectedCookTime}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70"/>
              </button>

              {openDropdown === 'cookTime' && (
                <div 
                  className="absolute left-0 top-full mt-2 w-44 border rounded-2xl shadow-2xl p-1.5 z-50 space-y-1"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  {['All Cook Times', 'Under 15m', '15-30m', 'Over 30m'].map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => { setSelectedCookTime(time); setOpenDropdown(null); }}
                      className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition"
                      style={selectedCookTime === time ? {
                        backgroundColor: 'var(--color-inner-dark)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)'
                      } : {
                        color: 'var(--color-text-secondary)'
                      }}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-xs py-12 text-center" style={{ color: 'var(--color-text-secondary)' }}>
          {t('loadingRecipes') || 'Loading recipes...'}
        </div>
      ) : (
        <div className={`grid ${GRID_CONFIG[gridMode].colsClass} gap-4 sm:gap-5`}>
          {paginatedRecipes.map((r) => {
            const cardBook = books.find(b => b.id === (r.bookId || r.book_id));
            const cardTypeBadge = getCleanRecipeType(r);
            const cfg = GRID_CONFIG[gridMode];

            return (
              <div
                key={r.id}
                onClick={() => {
                  setSelectedRecipe(r);
                  setServingsMultiplier(1);
                  setCompletedSteps([]);
                  setNoteText(r.note || '');
                  setIsBookDropdownOpen(false);
                  setIsEditing(false);
                }}
                className="border rounded-2xl overflow-hidden transition cursor-pointer group shadow-sm hover:shadow-md relative flex flex-col justify-between"
                style={{
                  backgroundColor: 'var(--color-card)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <div>
                  <div className={`relative ${cfg.imgHeight} w-full overflow-hidden`} style={{ backgroundColor: 'var(--color-inner-dark)' }}>
                    <img
                      src={r.imageUrl || r.image || '/recipes/images/default.jpg'}
                      alt={r.title || r.name}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.includes('default.jpg')) {
                          target.src = '/recipes/images/default.jpg';
                        }
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    
                    {/* Card Action Buttons */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => toggleCooked(e, r.id)}
                        className="p-1.5 rounded-full backdrop-blur-md transition shadow-md cursor-pointer border"
                        style={r.isCooked ? {
                          backgroundColor: 'var(--color-emerald)',
                          borderColor: 'var(--color-emerald)',
                          color: '#ffffff'
                        } : {
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-secondary)'
                        }}
                        title={r.isCooked ? (t('cooked') || 'Cooked') : (t('markAsCooked') || 'Mark as Cooked')}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5"/>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(e, r.id)}
                        className="p-1.5 rounded-full backdrop-blur-md transition shadow-md cursor-pointer border"
                        style={r.isFavorite ? {
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        } : {
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-secondary)'
                        }}
                        title={r.isFavorite ? (t('favorites') || 'Favorite') : (t('addToFavorites') || 'Add to Favorites')}
                      >
                        <Heart 
                          className={`h-3.5 w-3.5 ${r.isFavorite ? 'fill-current' : ''}`}
                          style={{ color: r.isFavorite ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
                        />
                      </button>
                    </div>

                    {cardBook && gridMode !== '5x5' && (
                      <div className="absolute bottom-2.5 left-2.5 bg-black/75 backdrop-blur-md text-[10px] text-amber-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-400/30 max-w-[80%] truncate">
                        <Book className="h-3 w-3 shrink-0"/> <span className="truncate">{cardBook.title}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 space-y-1.5">
                    <h3 
                      className={`font-bold ${cfg.titleSize} leading-snug line-clamp-2`}
                      style={{ color: 'var(--color-text)' }}
                    >
                      {r.title || r.name}
                    </h3>
                  </div>
                </div>

                <div className="px-3.5 pb-3 pt-0 flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span 
                      className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {cardTypeBadge}
                    </span>

                    {(r.rating || 0) > 0 && gridMode !== '5x5' ? (
                      <span className="flex items-center gap-0.5 text-amber-500 text-[11px] font-bold bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20 shadow-xs">
                        <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500"/> {r.rating}
                      </span>
                    ) : null}
                  </div>

                  <span className="text-[11px] flex items-center gap-1 shrink-0 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    <Clock className="h-3 w-3"/> {(r.prepTimeMinutes || 15) + (r.cookTimeMinutes || 10)}m
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {filtered.length > 0 && (
        <div 
          className="pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {(t('showingRecipesRange') || 'Showing {start} - {end} of {total} recipes')
              .replace('{start}', String(startIndex + 1))
              .replace('{end}', String(Math.min(startIndex + itemsPerPage, filtered.length)))
              .replace('{total}', String(filtered.length))}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-2 rounded-xl border disabled:opacity-30 transition cursor-pointer shadow-sm"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(num => num === 1 || num === totalPages || Math.abs(num - safeCurrentPage) <= 1)
              .map((num, i, arr) => {
                const prev = arr[i - 1];
                const showEllipsis = prev && num - prev > 1;

                return (
                  <div key={num} className="flex items-center gap-1">
                    {showEllipsis && <span className="px-1 font-bold" style={{ color: 'var(--color-text-secondary)' }}>...</span>}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(num)}
                      className="min-w-[32px] h-8 rounded-xl text-xs font-bold transition flex items-center justify-center border cursor-pointer shadow-sm"
                      style={safeCurrentPage === num ? {
                        backgroundColor: 'var(--color-primary)',
                        borderColor: 'var(--color-primary)',
                        color: '#ffffff',
                        boxShadow: '0 2px 8px rgba(224, 86, 56, 0.3)'
                      } : {
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    >
                      {num}
                    </button>
                  </div>
                );
              })}

            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-2 rounded-xl border disabled:opacity-30 transition cursor-pointer shadow-sm"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* RECIPE DETAILS & EDIT MODAL */}
      {selectedRecipe && (
        <div 
          onClick={() => { setSelectedRecipe(null); setIsEditing(false); setIsBookDropdownOpen(false); }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="border rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative cursor-default transition-colors duration-200"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <button
              onClick={() => { setSelectedRecipe(null); setIsEditing(false); setIsBookDropdownOpen(false); }}
              className="absolute top-4 right-4 z-30 p-2 rounded-xl border transition cursor-pointer shadow-md"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              <X className="h-5 w-5"/>
            </button>

            <div className="overflow-y-auto flex-1">
              {!isEditing ? (
                <div className="space-y-5 pb-6">
                  <div className="relative h-64 sm:h-72 w-full bg-slate-900 overflow-hidden flex flex-col justify-end p-5">
                    <img
                      src={selectedRecipe.imageUrl || selectedRecipe.image || '/recipes/images/default.jpg'}
                      alt={selectedRecipe.title || selectedRecipe.name}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.includes('default.jpg')) {
                          target.src = '/recipes/images/default.jpg';
                        }
                      }}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                    <div className="relative z-10 space-y-3">
                      <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                        {selectedRecipe.title || selectedRecipe.name}
                      </h2>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="border text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-black/60 border-white/20">
                          <Clock className="h-3.5 w-3.5"/> {(t('cookTimePrefix') || 'Cook: {time} minutes').replace('{time}', String(selectedRecipe.cookTimeMinutes || 10))}
                        </span>
                        <span className="border text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-black/60 border-white/20">
                          <Clock className="h-3.5 w-3.5"/> {(t('prepTimePrefix') || 'Prep: {time} minutes').replace('{time}', String(selectedRecipe.prepTimeMinutes || 30))}
                        </span>
                        <span className="border text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-black/60 border-white/20">
                          <Utensils className="h-3.5 w-3.5"/> {recipeCategoryBadge}
                        </span>
                        
                        <button
                          type="button"
                          onClick={(e) => toggleFavorite(e, selectedRecipe.id)}
                          className="ml-auto w-8 h-8 rounded-full flex items-center justify-center shadow-md cursor-pointer transition border"
                          style={{
                            backgroundColor: 'var(--color-card)',
                            borderColor: 'var(--color-border)',
                            color: selectedRecipe.isFavorite ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                          }}
                          title={selectedRecipe.isFavorite ? "Favorite" : "Mark as Favorite"}
                        >
                          <Heart className={`h-4 w-4 ${selectedRecipe.isFavorite ? 'fill-current' : ''}`} style={{ color: selectedRecipe.isFavorite ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}/>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 3 CORE ACTION BUTTONS */}
                  <div className="px-5 grid grid-cols-3 gap-2.5">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsBookDropdownOpen(!isBookDropdownOpen)}
                        className="w-full border font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        style={{
                          backgroundColor: assignedBook ? 'var(--color-inner-dark)' : 'var(--color-card)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        }}
                      >
                        <BookmarkPlus className="h-4 w-4 shrink-0" style={{ color: 'var(--color-primary)' }}/>
                        <span className="truncate">
                          {assignedBook ? assignedBook.title : (t('addToCookbook') || t('addToBook') || 'Add to Cookbook')}
                        </span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-70 ml-0.5"/>
                      </button>

                      {isBookDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsBookDropdownOpen(false)} />
                          <div 
                            className="absolute left-0 top-full mt-2 w-64 border rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in" 
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              backgroundColor: 'var(--color-card)',
                              borderColor: 'var(--color-border)'
                            }}
                          >
                            <div className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 flex items-center justify-between" style={{ color: 'var(--color-text-secondary)' }}>
                              <span>{t('selectCookbook') || 'Select Cookbook'}</span>
                              <Link 
                                className="hover:underline font-bold" 
                                href="/books"
                                style={{ color: 'var(--color-emerald)' }}
                              >
                                {t('manage') || 'Manage'}
                              </Link>
                            </div>

                            <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                              {books.length === 0 ? (
                                <div className="text-xs px-2.5 py-2" style={{ color: 'var(--color-text-secondary)' }}>{t('noCookbooksAvailable') || 'No cookbooks available'}</div>
                              ) : (
                                books.map((b) => {
                                  const isAssigned = (selectedRecipe.bookId || selectedRecipe.book_id) === b.id;
                                  return (
                                    <button
                                      key={b.id}
                                      type="button"
                                      onClick={() => {
                                        handleAssignToBook(b.id);
                                        setIsBookDropdownOpen(false);
                                      }}
                                      className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer"
                                      style={isAssigned ? {
                                        backgroundColor: 'var(--color-inner-dark)',
                                        color: 'var(--color-primary)',
                                        border: '1px solid var(--color-primary)'
                                      } : {
                                        color: 'var(--color-text)'
                                      }}
                                    >
                                      <span className="truncate flex-1 pr-2">{b.title}</span>
                                      {isAssigned && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-primary)' }}/>}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={openAddToPlanModal}
                      className="border font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-primary)',
                        color: 'var(--color-primary)'
                      }}
                    >
                      <CalendarPlus className="h-4 w-4" style={{ color: 'var(--color-primary)' }}/> {t('addToPlan') || 'Add to Plan'}
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenShoppingModal}
                      className="border font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-primary)',
                        color: 'var(--color-primary)'
                      }}
                    >
                      <ShoppingCart className="h-4 w-4" style={{ color: 'var(--color-primary)' }}/> {t('shoppingList') || 'Shopping List'}
                    </button>
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: 'var(--color-border)' }} />

                  {/* Servings Stepper */}
                  <div className="px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span 
                        className="text-xs font-bold flex items-center gap-1.5"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        <Users className="h-4 w-4"/> {t('servingsLabel') || 'Servings'}
                      </span>
                      <div 
                        className="flex items-center border rounded-lg overflow-hidden shadow-xs"
                        style={{
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-border)'
                        }}
                      >
                        <button
                          onClick={() => setServingsMultiplier(Math.max(1, servingsMultiplier - 1))}
                          className="px-2.5 py-1 font-bold cursor-pointer transition"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          -
                        </button>
                        <span className="px-3 py-1 text-xs font-bold min-w-[32px] text-center" style={{ color: 'var(--color-text)' }}>
                          {currentTotalServings}
                        </span>
                        <button
                          onClick={() => setServingsMultiplier(servingsMultiplier + 1)}
                          className="px-2.5 py-1 font-bold cursor-pointer transition"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => alert(t('timerSetAlert') || 'Kitchen Timer set for 15 minutes!')}
                        className="border font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                        style={{
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        }}
                      >
                        <Timer className="h-3.5 w-3.5"/> {t('timerBtn') || 'Timer'}
                      </button>
                      <button
                        onClick={handleOpenEdit}
                        className="border font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                        style={{
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5"/> {t('editBtn') || 'Edit'}
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href);
                          alert(t('recipeLinkCopiedAlert') || 'Recipe link copied!');
                        }}
                        className="border font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                        style={{
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        }}
                      >
                        <Share2 className="h-3.5 w-3.5"/> {t('shareRecipeBtn') || 'Share Recipe'}
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="px-5 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {selectedRecipe.description}
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: 'var(--color-border)' }} />

                  {/* Cooked Status / Star Rating / Note */}
                  <div className="px-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => toggleCooked(e, selectedRecipe.id)}
                        className="flex items-center gap-2.5 text-base font-extrabold group cursor-pointer select-none transition"
                        style={{ color: 'var(--color-text)' }}
                      >
                        <span className="font-extrabold tracking-tight">
                          {selectedRecipe.isCooked ? (t('cooked') || 'Cooked') : (t('markAsCooked') || 'Mark as Cooked')}
                        </span>
                        
                        <span 
                          className="w-5 h-5 rounded-full flex items-center justify-center transition shadow-sm border"
                          style={selectedRecipe.isCooked ? {
                            backgroundColor: 'var(--color-emerald)',
                            borderColor: 'var(--color-emerald)',
                            color: '#ffffff'
                          } : {
                            border: '1px solid var(--color-border)',
                            backgroundColor: 'var(--color-inner-dark)',
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          {selectedRecipe.isCooked && <Check className="h-3.5 w-3.5 stroke-[3]"/>}
                        </span>
                      </button>

                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            onClick={() => updateSelectedRecipeState('rating', star)}
                            className="h-5 w-5 cursor-pointer transition"
                            style={{
                              color: (selectedRecipe.rating || 0) >= star ? 'var(--color-primary)' : 'var(--color-border)',
                              fill: (selectedRecipe.rating || 0) >= star ? 'var(--color-primary)' : 'transparent'
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setIsNoteOpen(!isNoteOpen)}
                        className="flex items-center gap-1.5 text-xs font-medium transition cursor-pointer"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        <Edit3 className="h-3.5 w-3.5"/>
                        <span className="italic">{t('addANote') || 'Add a note'}</span>
                      </button>

                      {isNoteOpen && (
                        <div className="flex gap-2 animate-in fade-in">
                          <input
                            type="text"
                            autoComplete="off"
                            data-lpignore="true"
                            data-form-type="other"
                            placeholder={t('addNotesPlaceholder') || 'Add notes...'}
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            className="flex-1 border rounded-xl px-3 py-2 text-xs outline-none"
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
                            onClick={() => {
                              updateSelectedRecipeState('note', noteText);
                              setIsNoteOpen(false);
                            }}
                            className="text-white font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer shadow-sm"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                          >
                            {t('save') || 'Save'}
                          </button>
                        </div>
                      )}
                      {selectedRecipe.note && !isNoteOpen && (
                        <p 
                          className="text-xs italic"
                          style={{ color: 'var(--color-emerald)' }}
                        >
                          Note: "{selectedRecipe.note}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: 'var(--color-border)' }} />

                  {/* INGREDIENTS SECTION */}
                  <div className="px-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-black" style={{ color: 'var(--color-text)' }}>{t('ingredientsHeading') || 'Ingredients'}</h3>
                      
                      <div 
                        className="flex items-center border rounded-lg overflow-hidden text-xs shadow-xs"
                        style={{
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-border)'
                        }}
                      >
                        <div className="px-2.5 py-1 border-r flex items-center justify-center" style={{ borderColor: 'var(--color-border)' }}>
                          <Type className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }}/>
                        </div>
                        <button
                          onClick={() => setFontSizeScale(Math.max(60, fontSizeScale - 10))}
                          className="px-2.5 py-1 font-bold cursor-pointer"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          -
                        </button>
                        <span className="px-2.5 py-1 font-bold min-w-[42px] text-center" style={{ color: 'var(--color-text)' }}>
                          {fontSizeScale}%
                        </span>
                        <button
                          onClick={() => setFontSizeScale(Math.min(140, fontSizeScale + 10))}
                          className="px-2.5 py-1 font-bold cursor-pointer"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5" style={{ fontSize: `${fontSizeScale}%` }}>
                      {Array.isArray(selectedRecipe.ingredients) && selectedRecipe.ingredients.map((ing: any, idx: number) => {
                        const rawAmt = typeof ing === 'string' ? '' : ing.amount || ing.quantity || '';
                        const scaledAmt = calculateScaledAmount(rawAmt, baseServings, currentTotalServings);
                        const unit = typeof ing === 'string' ? '' : ing.unit || '';
                        const name = typeof ing === 'string' ? ing : ing.item || ing.name || '';
                        return (
                          <div key={idx} className="flex items-start gap-2.5 leading-snug">
                            <span 
                              className="w-2 h-2 rounded-full inline-block shrink-0 mt-1.5"
                              style={{ backgroundColor: 'var(--color-primary)' }}
                            />
                            <span style={{ color: 'var(--color-text)' }}>
                              {(scaledAmt !== '' || unit) && (
                                <strong className="font-semibold" style={{ color: 'var(--color-text)' }}>
                                  {scaledAmt} {unit && unit !== 'Unit' ? unit : ''}{' '}
                                </strong>
                              )}
                              <span>{name}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: 'var(--color-border)' }} />

                  {/* INSTRUCTIONS SECTION */}
                  <div className="px-5 space-y-4">
                    <h3 className="text-xl font-black" style={{ color: 'var(--color-text)' }}>{t('instructionsHeading') || 'Instructions'}</h3>
                    
                    <div className="space-y-3.5" style={{ fontSize: `${fontSizeScale}%` }}>
                      {Array.isArray(selectedRecipe.instructions) && selectedRecipe.instructions.map((step: string, idx: number) => {
                        const isDone = completedSteps.includes(idx);
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              if (completedSteps.includes(idx)) {
                                setCompletedSteps(completedSteps.filter(i => i !== idx));
                              } else {
                                setCompletedSteps([...completedSteps, idx]);
                              }
                            }}
                            className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition select-none shadow-xs ${
                              isDone ? 'opacity-50' : ''
                            }`}
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)'
                            }}
                          >
                            <div 
                              className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition"
                              style={isDone ? {
                                backgroundColor: 'var(--color-primary)',
                                borderColor: 'var(--color-primary)',
                                color: '#ffffff'
                              } : {
                                borderColor: 'var(--color-primary)',
                                backgroundColor: 'transparent'
                              }}
                            >
                              {isDone && <Check className="h-3 w-3 stroke-[3]"/>}
                            </div>

                            <span 
                              className="font-extrabold shrink-0 text-sm"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              {idx + 1}.
                            </span>

                            <span 
                              className={`leading-relaxed flex-1 ${isDone ? 'line-through opacity-50' : ''}`}
                              style={{ color: 'var(--color-text)' }}
                            >
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: 'var(--color-border)' }} />

                  {/* MODAL FOOTER */}
                  <div className="px-5 flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                    <button
                      onClick={() => handleDeleteRecipe(selectedRecipe.id)}
                      className="px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 border transition cursor-pointer shadow-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'rgba(239, 68, 68, 0.4)',
                        color: '#ef4444'
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5"/> {t('deleteRecipeBtn') || 'Delete Recipe'}
                    </button>

                    <div className="flex items-center gap-2 ml-auto text-xs">
                      <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                        {t('source') || 'Source'}:
                      </span>
                      {selectedRecipe.sourceUrl || selectedRecipe.source_url ? (
                        <a
                          href={getSafeHref(selectedRecipe.sourceUrl || selectedRecipe.source_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-xs hover:underline inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition shadow-xs"
                          style={{
                            backgroundColor: 'var(--color-inner-dark)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-primary)'
                          }}
                        >
                          <span className="underline">
                            {(t('visitSource') || 'Visit {domain}').replace('{domain}', getSafeHostname(selectedRecipe.sourceUrl || selectedRecipe.source_url))}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span 
                          className="px-3 py-1.5 rounded-xl border text-xs font-medium"
                          style={{
                            backgroundColor: 'var(--color-inner-dark)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          {t('createdManually') || 'Created manually'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* EDIT RECIPE VIEW */
                <div className="p-6 space-y-6" data-lpignore="true">
                  <div className="flex justify-between items-center border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                      <Edit3 className="h-5 w-5" style={{ color: 'var(--color-primary)' }}/> {t('editRecipeTitle') || 'Edit Recipe'}
                    </h3>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="p-1 rounded-lg transition cursor-pointer"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <X className="h-5 w-5"/>
                    </button>
                  </div>

                  <div 
                    className="flex p-1.5 rounded-2xl border"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    {[
                      { id: 'info', label: t('basicInfoTab') || 'Basic Info' },
                      { id: 'ingredients', label: t('ingredientsTab') || 'Ingredients' },
                      { id: 'steps', label: t('stepsTab') || 'Steps' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setEditTab(tab.id as any)}
                        className="flex-1 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer"
                        style={editTab === tab.id ? {
                          backgroundColor: 'var(--color-card)',
                          color: 'var(--color-text)',
                          border: '1px solid var(--color-border)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        } : {
                          color: 'var(--color-text-secondary)'
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* TAB 1: BASIC INFO */}
                  {editTab === 'info' && (
                    <div className="space-y-5 animate-in fade-in text-xs">
                      <div className="space-y-1.5">
                        <label 
                          className="block font-bold uppercase tracking-wider text-[11px]"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {t('photoLabel') || 'Photo'}
                        </label>
                        <label 
                          className="border-2 border-dashed rounded-2xl h-44 flex flex-col items-center justify-center cursor-pointer transition relative overflow-hidden group"
                          style={{
                            backgroundColor: 'var(--color-inner-dark)',
                            borderColor: 'var(--color-border)'
                          }}
                        >
                          {editForm.imageUrl ? (
                            <>
                              <img
                                src={editForm.imageUrl}
                                alt="Recipe Preview"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                <span 
                                  className="border text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                                  style={{
                                    backgroundColor: 'var(--color-card)',
                                    borderColor: 'var(--color-border)'
                                  }}
                                >
                                  <ImagePlus className="h-4 w-4" style={{ color: 'var(--color-primary)' }}/> {t('changePhoto') || 'Change Photo'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditForm({ ...editForm, imageUrl: '' });
                                  }}
                                  className="bg-red-950/90 border border-red-500/50 text-red-400 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-red-900 cursor-pointer"
                                >
                                  {t('removePhoto') || 'Remove'}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="text-center space-y-2">
                              <ImagePlus className="h-8 w-8 mx-auto transition" style={{ color: 'var(--color-text-secondary)' }}/>
                              <span className="text-xs font-bold block" style={{ color: 'var(--color-text)' }}>{t('addAPhoto') || 'Add a photo'}</span>
                            </div>
                          )}
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                      </div>

                      <div>
                        <label 
                          className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {t('recipeTitle') || 'Recipe Title'}
                        </label>
                        <input
                          type="text"
                          required
                          autoComplete="off"
                          data-lpignore="true"
                          data-form-type="other"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className="w-full border rounded-xl p-3 text-sm outline-none"
                          style={{
                            backgroundColor: 'var(--color-inner-dark)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text)'
                          }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                        />
                      </div>

                      <div>
                        <label 
                          className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {t('description') || 'Description'}
                        </label>
                        <textarea
                          rows={3}
                          autoComplete="off"
                          data-lpignore="true"
                          data-form-type="other"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className="w-full border rounded-xl p-3 text-xs outline-none resize-y leading-relaxed"
                          style={{
                            backgroundColor: 'var(--color-inner-dark)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text)'
                          }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label 
                            className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                            style={{ color: 'var(--color-primary)' }}
                          >
                            {t('recipeTypeLabel') || 'Recipe Type'}
                          </label>
                          <select
                            value={editForm.recipeType}
                            onChange={(e) => setEditForm({ ...editForm, recipeType: e.target.value })}
                            className="w-full border rounded-xl p-3 text-xs outline-none cursor-pointer"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text)'
                            }}
                          >
                            {RECIPE_TYPES.filter(t => t !== 'All Types').map((t) => (
                              <option key={t} value={t} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label 
                            className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                            style={{ color: 'var(--color-primary)' }}
                          >
                            {t('servingsLabel') || 'Servings'}
                          </label>
                          <input
                            type="number"
                            autoComplete="off"
                            data-lpignore="true"
                            data-form-type="other"
                            value={editForm.servings}
                            onChange={(e) => setEditForm({ ...editForm, servings: parseInt(e.target.value) || 1 })}
                            className="w-full border rounded-xl p-3 text-xs outline-none"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text)'
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="px-5 py-2.5 rounded-xl font-bold transition text-xs cursor-pointer"
                          style={{
                            backgroundColor: 'var(--color-inner-dark)',
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          {t('cancel') || 'Cancel'}
                        </button>
                        <button
                          type="submit"
                          onClick={handleSaveEdit}
                          className="px-6 py-2.5 rounded-xl text-white font-bold transition shadow-lg flex items-center gap-2 text-xs cursor-pointer"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
                        >
                          <Save className="h-4 w-4"/> {t('saveChanges') || 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: INGREDIENTS */}
                  {editTab === 'ingredients' && (
                    <div 
                      className="border rounded-2xl p-5 space-y-4 animate-in fade-in text-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)'
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <h2 
                          className="text-sm font-bold uppercase tracking-wider"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {t('ingredientsHeading') || 'Ingredients'}
                        </h2>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsReorderingIngredients(!isReorderingIngredients)}
                            className="font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer"
                            style={isReorderingIngredients ? {
                              backgroundColor: 'var(--color-emerald)',
                              color: '#ffffff',
                              borderColor: 'var(--color-emerald)'
                            } : {
                              backgroundColor: 'var(--color-card)',
                              color: 'var(--color-text)',
                              borderColor: 'var(--color-border)'
                            }}
                          >
                            {isReorderingIngredients ? (t('done') || 'Done') : (t('reorder') || 'Reorder')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditForm({
                              ...editForm,
                              ingredients: [...editForm.ingredients, { amount: '', unit: '', item: '', category: categories[0] || 'Produce' }]
                            })}
                            className="text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
                          >
                            <Plus className="h-3.5 w-3.5"/> {t('addIngredient') || 'Add Ingredient'}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                        {editForm.ingredients.map((ing: any, idx: number) => (
                          <div
                            key={idx}
                            draggable={isReorderingIngredients}
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx, 'ingredients')}
                            onDrop={handleDrop}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border transition ${
                              isReorderingIngredients ? 'cursor-grab' : ''
                            }`}
                            style={{
                              backgroundColor: 'var(--color-card)',
                              borderColor: isReorderingIngredients ? 'var(--color-emerald)' : 'var(--color-border)'
                            }}
                          >
                            <input
                              type="text"
                              autoComplete="off"
                              data-lpignore="true"
                              data-form-type="other"
                              placeholder={t('amt') || 'Amt'}
                              value={ing.amount}
                              onChange={(e) => {
                                const list = [...editForm.ingredients];
                                list[idx].amount = e.target.value;
                                setEditForm({ ...editForm, ingredients: list });
                              }}
                              className="w-16 border rounded-lg p-2 text-center font-bold outline-none"
                              style={{
                                backgroundColor: 'var(--color-inner-dark)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text)'
                              }}
                            />
                            <input
                              type="text"
                              autoComplete="off"
                              data-lpignore="true"
                              data-form-type="other"
                              placeholder={t('unit') || 'Unit'}
                              value={ing.unit}
                              onChange={(e) => {
                                const list = [...editForm.ingredients];
                                list[idx].unit = e.target.value;
                                setEditForm({ ...editForm, ingredients: list });
                              }}
                              className="w-20 border rounded-lg p-2 text-center outline-none"
                              style={{
                                backgroundColor: 'var(--color-inner-dark)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-secondary)'
                              }}
                            />
                            <input
                              type="text"
                              autoComplete="off"
                              data-lpignore="true"
                              data-form-type="other"
                              placeholder={t('ingredientNamePlaceholder') || 'Ingredient name...'}
                              value={ing.item}
                              onChange={(e) => {
                                const list = [...editForm.ingredients];
                                list[idx].item = e.target.value;
                                setEditForm({ ...editForm, ingredients: list });
                              }}
                              className="flex-1 bg-transparent border-none outline-none px-2"
                              style={{ color: 'var(--color-text)' }}
                            />
                            <select
                              value={ing.category}
                              onChange={(e) => {
                                const list = [...editForm.ingredients];
                                list[idx].category = e.target.value;
                                setEditForm({ ...editForm, ingredients: list });
                              }}
                              className="w-36 border rounded-lg p-2 text-[11px] outline-none cursor-pointer"
                              style={{
                                backgroundColor: 'var(--color-inner-dark)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-secondary)'
                              }}
                            >
                              {categories.map((cat) => (
                                <option key={cat} value={cat} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{cat}</option>
                              ))}
                            </select>

                            {isReorderingIngredients ? (
                              <div className="p-2 cursor-grab" style={{ color: 'var(--color-emerald)' }}>
                                <GripVertical className="h-4 w-4"/>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditForm({
                                  ...editForm,
                                  ingredients: editForm.ingredients.filter((_: any, i: number) => i !== idx)
                                })}
                                className="p-2 text-red-500 hover:text-red-600 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4"/>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between pt-3">
                        <button
                          type="button"
                          onClick={() => setEditTab('info')}
                          className="font-bold px-5 py-2 rounded-xl text-xs transition cursor-pointer"
                          style={{
                            backgroundColor: 'var(--color-card)',
                            color: 'var(--color-text)'
                          }}
                        >
                          {t('backBtn') || '← Back'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditTab('steps')}
                          className="text-white font-bold px-6 py-2 rounded-xl text-xs transition shadow-md cursor-pointer"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
                        >
                          {t('nextStepsBtn') || 'Next: Steps →'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: STEPS */}
                  {editTab === 'steps' && (
                    <div 
                      className="border rounded-2xl p-5 space-y-4 animate-in fade-in text-xs"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)'
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <h2 
                          className="text-sm font-bold uppercase tracking-wider"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {t('stepByStepInstructions') || 'Step-by-Step Instructions'}
                        </h2>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsReorderingSteps(!isReorderingSteps)}
                            className="font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer"
                            style={isReorderingSteps ? {
                              backgroundColor: 'var(--color-emerald)',
                              color: '#ffffff',
                              borderColor: 'var(--color-emerald)'
                            } : {
                              backgroundColor: 'var(--color-card)',
                              color: 'var(--color-text-secondary)',
                              borderColor: 'var(--color-border)'
                            }}
                          >
                            {isReorderingSteps ? (t('done') || 'Done') : (t('reorder') || 'Reorder')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditForm({
                              ...editForm,
                              instructions: [...editForm.instructions, '']
                            })}
                            className="text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
                          >
                            <Plus className="h-3.5 w-3.5"/> {t('addStep') || 'Add Step'}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                        {editForm.instructions.map((step: string, idx: number) => (
                          <div
                            key={idx}
                            draggable={isReorderingSteps}
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx, 'steps')}
                            onDrop={handleDrop}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                              isReorderingSteps ? 'cursor-grab' : ''
                            }`}
                            style={{
                              backgroundColor: 'var(--color-card)',
                              borderColor: isReorderingSteps ? 'var(--color-emerald)' : 'var(--color-border)'
                            }}
                          >
                            <span 
                              className="w-6 h-6 rounded-full font-bold flex items-center justify-center shrink-0 mt-1"
                              style={{
                                backgroundColor: 'var(--color-inner-dark)',
                                color: 'var(--color-primary)',
                                borderColor: 'var(--color-primary)',
                                borderWidth: '1px'
                              }}
                            >
                              {idx + 1}
                            </span>
                            <textarea
                              rows={2}
                              autoComplete="off"
                              data-lpignore="true"
                              data-form-type="other"
                              placeholder={(t('describeStepPlaceholder') || 'Describe step {n}...').replace('{n}', String(idx + 1))}
                              value={step}
                              onChange={(e) => {
                                const list = [...editForm.instructions];
                                list[idx] = e.target.value;
                                setEditForm({ ...editForm, instructions: list });
                              }}
                              className="flex-1 bg-transparent border-none outline-none resize-y"
                              style={{ color: 'var(--color-text)' }}
                            />

                            {isReorderingSteps ? (
                              <div className="p-2 cursor-grab mt-1" style={{ color: 'var(--color-emerald)' }}>
                                <GripVertical className="h-4 w-4"/>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditForm({
                                  ...editForm,
                                  instructions: editForm.instructions.filter((_: any, i: number) => i !== idx)
                                })}
                                className="p-2 text-slate-400 hover:text-red-500 h-fit cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4"/>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between pt-3">
                        <button
                          type="button"
                          onClick={() => setEditTab('ingredients')}
                          className="font-bold px-5 py-2 rounded-xl text-xs transition cursor-pointer"
                          style={{
                            backgroundColor: 'var(--color-card)',
                            color: 'var(--color-text)'
                          }}
                        >
                          {t('backBtn') || '← Back'}
                        </button>
                        <button
                          type="submit"
                          onClick={handleSaveEdit}
                          className="text-white font-bold px-8 py-2.5 rounded-xl text-xs transition shadow-lg flex items-center gap-2 cursor-pointer"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
                        >
                          <Save className="h-4 w-4"/> {t('saveChanges') || 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD TO PLAN MODAL */}
      {showAddToPlanModal && selectedRecipe && (
        <div 
          onClick={() => setShowAddToPlanModal(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="border rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative text-xs animate-in fade-in cursor-default transition-colors duration-200"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <button 
              onClick={() => setShowAddToPlanModal(false)} 
              className="absolute top-4 right-4 p-2 rounded-lg transition cursor-pointer"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                color: 'var(--color-text)'
              }}
            >
              <X className="h-4 w-4"/>
            </button>

            <div className="pr-6 space-y-1">
              <h2 
                className="text-xl font-black tracking-tight"
                style={{ color: 'var(--color-primary)' }}
              >
                {t('addToCalendar') || 'Add to Calendar'}
              </h2>
              <p className="text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
                {(t('scheduleRecipeInMealPlan') || 'Schedule {title} in your meal plan').replace('{title}', selectedRecipe.title || selectedRecipe.name)}
              </p>
            </div>

            <form onSubmit={handleSaveToCalendar} className="space-y-4 pt-1" data-lpignore="true">
              <div>
                <label 
                  className="block text-xs font-bold mb-1.5"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {t('date') || 'Date'}
                </label>
                <div className="relative flex items-center">
                  <Calendar className="h-4 w-4 absolute left-3.5 pointer-events-none" style={{ color: 'var(--color-primary)' }}/>
                  <input
                    type="date"
                    required
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={planDate}
                    onChange={(e) => setPlanDate(e.target.value)}
                    className="w-full border rounded-xl pl-10 pr-3 py-2.5 text-xs font-semibold outline-none cursor-pointer"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-primary)'
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  />
                </div>
              </div>

              <div>
                <label 
                  className="block text-xs font-bold mb-1.5"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {t('mealType') || 'Meal Type'}
                </label>
                <div className="relative flex items-center">
                  <select
                    value={planMealType}
                    onChange={(e) => setPlanMealType(e.target.value)}
                    className="w-full border rounded-xl px-3.5 py-2.5 text-xs outline-none cursor-pointer appearance-none"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  >
                    <option value="Breakfast" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t('breakfast') || 'Breakfast'}</option>
                    <option value="Lunch" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t('lunch') || 'Lunch'}</option>
                    <option value="Dinner" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t('dinner') || 'Dinner'}</option>
                    <option value="Snack" style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{t('snack') || 'Snack'}</option>
                  </select>
                  <ChevronDown className="h-4 w-4 absolute right-3 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }}/>
                </div>
              </div>

              <div>
                <label 
                  className="block text-xs font-bold mb-1.5"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {t('time') || 'Time'}
                </label>
                <div className="relative flex items-center">
                  <Clock className="h-4 w-4 absolute left-3.5 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }}/>
                  <input
                    type="time"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={planTime}
                    onChange={(e) => setPlanTime(e.target.value)}
                    className="w-full border rounded-xl px-10 py-2.5 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  />
                  <Clock className="h-4 w-4 absolute right-3.5 pointer-events-none" style={{ color: 'var(--color-primary)' }}/>
                </div>
              </div>

              <div>
                <label 
                  className="block text-xs font-bold mb-1.5"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {t('notes') || 'Notes'}
                </label>
                <textarea
                  value={planNotes}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  onChange={(e) => setPlanNotes(e.target.value)}
                  placeholder={t('addNotesRemindersPlaceholder') || 'Add any notes or reminders...'}
                  rows={3}
                  className="w-full border rounded-xl p-3 text-xs outline-none resize-none"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddToPlanModal(false)}
                  className="px-5 py-2.5 rounded-xl border font-bold text-xs transition cursor-pointer"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-primary)',
                    backgroundColor: 'var(--color-inner-dark)'
                  }}
                >
                  {t('cancel') || 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-white font-bold text-xs transition shadow-md cursor-pointer"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
                >
                  {t('addToCalendarBtn') || 'Add to Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHOPPING LIST MODAL */}
      {isShoppingModalOpen && (
        <div 
          onClick={() => setIsShoppingModalOpen(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-3 sm:p-6 overflow-y-auto cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="border rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl p-6 space-y-5 cursor-default transition-colors duration-200"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                  <ShoppingCart className="h-5 w-5" style={{ color: 'var(--color-primary)' }}/> {t('addToShoppingListTitle') || 'Add to Shopping List'}
                </h3>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t('selectOrEditItemsShopping') || 'Select or edit items to add directly to your list'}</p>
              </div>
              <button 
                onClick={() => setIsShoppingModalOpen(false)} 
                className="cursor-pointer transition"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <X className="h-5 w-5"/>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1 text-xs">
              {shoppingModalIngredients.map((ing, idx) => (
                <div 
                  key={ing.id} 
                  className="flex items-center gap-2 p-2.5 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  <div
                    onClick={() => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].selected = !updated[idx].selected;
                      setShoppingModalIngredients(updated);
                    }}
                    className="w-5 h-5 rounded-lg border flex items-center justify-center cursor-pointer transition shrink-0"
                    style={ing.selected ? {
                      backgroundColor: 'var(--color-primary)',
                      borderColor: 'var(--color-primary)',
                      color: '#ffffff'
                    } : {
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-card)'
                    }}
                  >
                    {ing.selected && <CheckSquare className="h-3.5 w-3.5"/>}
                  </div>

                  <input
                    type="text"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={ing.amount}
                    onChange={(e) => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].amount = e.target.value;
                      setShoppingModalIngredients(updated);
                    }}
                    className="w-16 border rounded-lg p-2 text-center font-bold outline-none"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                    placeholder={t('amt') || 'Amt'}
                  />
                  <input
                    type="text"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={ing.unit}
                    onChange={(e) => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].unit = e.target.value;
                      setShoppingModalIngredients(updated);
                    }}
                    className="w-20 border rounded-lg p-2 text-center outline-none"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)'
                    }}
                    placeholder={t('unit') || 'Unit'}
                  />
                  <input
                    type="text"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={ing.name}
                    onChange={(e) => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].name = e.target.value;
                      setShoppingModalIngredients(updated);
                    }}
                    className="flex-1 bg-transparent border-none outline-none px-2"
                    style={{ color: 'var(--color-text)' }}
                    placeholder={t('ingredientNamePlaceholder') || 'Ingredient name...'}
                  />
                  <select
                    value={ing.category}
                    onChange={(e) => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].category = e.target.value;
                      setShoppingModalIngredients(updated);
                    }}
                    className="w-36 border rounded-lg p-2 text-[11px] outline-none cursor-pointer"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)'
                    }}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>{cat}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setIsShoppingModalOpen(false)}
                className="px-4 py-2 rounded-xl font-bold text-xs cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  color: 'var(--color-text-secondary)'
                }}
              >
                {t('cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmAddToShoppingList}
                className="px-6 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                style={{ backgroundColor: 'var(--color-primary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
              >
                <ShoppingCart className="h-3.5 w-3.5"/> {t('addSelectedToList') || 'Add Selected to List'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
