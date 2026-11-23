'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getEffectiveThemeMode } from '@/lib/themeConfig';
import { 
  Book, Plus, Utensils, Trash2, Edit3, Save, X, 
  ArrowRight, Palette, Check, Clock, Timer, Share2, 
  CheckCircle2, CalendarPlus, ShoppingCart, 
  BookmarkPlus, Heart, Star, ChevronDown, ImagePlus,
  GripVertical, CheckSquare, ExternalLink, Users,
  Search, ChevronLeft, ChevronRight, Grid3X3, LayoutGrid, Rows3,
  Pipette
} from 'lucide-react';
import { getCurrentUser, User, initAuthStorage } from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';

// Safe URL domain extractor getSafeHostname(avoiding) on string primitive errors
const getSafeHostname = (urlStr?: any): string => {
  if (!urlStr || typeof urlStr !== 'string') return '';
  try {
    const raw = urlStr.trim();
    const candidate = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    return new URL(candidate).hostname.replace(/^www\./, '');
  } catch (_) {
    return String(urlStr).replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  }
};

const COVER_GRADIENTS = [
  { label: 'Rose & Pink', value: 'bg-gradient-to-r from-pink-600 via-rose-500 to-rose-600' },
  { label: 'Emerald Green', value: 'bg-gradient-to-r from-emerald-600 to-teal-700' },
  { label: 'Sunset Orange', value: 'bg-gradient-to-r from-orange-500 to-amber-600' },
  { label: 'Royal Purple', value: 'bg-gradient-to-r from-purple-600 to-indigo-800' },
  { label: 'Ocean Blue', value: 'bg-gradient-to-r from-blue-600 to-cyan-600' },
  { label: 'Slate Charcoal', value: 'bg-gradient-to-r from-slate-700 to-slate-900' },
];

const DEFAULT_CATEGORIES = [
  'Produce', 'Meat and Seafood', 'Dairy', 
  'Grains and Pasta', 'Pantry Staples', 
  'Condiments and Sauces', 'Beverages'
];

type GridMode = '3x3' | '4x4' | '5x5';

const GRID_CONFIG: Record<GridMode, { colsClass: string; perPage: number; label: string; headerHeight: string; titleSize: string }> = {
  '3x3': {
    colsClass: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    perPage: 9,
    label: '3×3',
    headerHeight: 'h-36',
    titleSize: 'text-xl'
  },
  '4x4': {
    colsClass: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    perPage: 16,
    label: '4×4',
    headerHeight: 'h-28',
    titleSize: 'text-base'
  },
  '5x5': {
    colsClass: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
    perPage: 25,
    label: '5×5',
    headerHeight: 'h-24',
    titleSize: 'text-sm'
  }
};

const isGradientClass = (color?: string) => {
  if (!color) return true;
  return color.startsWith('bg-') || color.startsWith('from-');
};

const getCoverBgStyle = (color?: string) => {
  if (!color || isGradientClass(color)) return undefined;
  return { backgroundColor: color };
};

const isRecipeInBook = (rec: any, bookId: string): boolean => {
  if (!rec || !bookId) return false;
  if (rec.bookId === bookId || rec.book_id === bookId) return true;
  if (Array.isArray(rec.bookIds) && rec.bookIds.includes(bookId)) return true;
  return false;
};

export default function BooksPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [isDayMode, setIsDayMode] = useState<boolean>(false);
  
  // Search, Grid Density & Pagination States
  const [search, setSearch] = useState('');
  const [gridMode, setGridMode] = useState<GridMode>('3x3');
  const [currentPage, setCurrentPage] = useState(1);

  // Cookbook Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBook, setEditingBook] = useState<any | null>(null);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);

  // In-Modal Recipe Picker States (Add recipes from /recipes into selectedBook)
  const [showAddRecipePicker, setShowAddRecipePicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFilter, setPickerFilter] = useState<'all' | 'available' | 'added'>('all');
  const [selectedPickerIds, setSelectedPickerIds] = useState<string[]>([]);

  // Form States for Cookbook Create
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCoverColor, setNewCoverColor] = useState(COVER_GRADIENTS[0].value);

  // Form States for Cookbook Edit
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCoverColor, setEditCoverColor] = useState(COVER_GRADIENTS[0].value);

  // Specific Recipe Popup State
  const [viewingRecipe, setViewingRecipe] = useState<any | null>(null);
  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);
  const [servingsMultiplier, setServingsMultiplier] = useState(1);
  const [fontSizeScale, setFontSizeScale] = useState(100);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [noteText, setNoteText] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);

  // Recipe Editing State
  const [isEditingRecipe, setIsEditingRecipe] = useState(false);
  const [editRecipeTab, setEditRecipeTab] = useState<'info' | 'ingredients' | 'steps'>('info');
  const [editRecipeForm, setEditRecipeForm] = useState<any>({
    title: '',
    description: '',
    recipeType: 'Main Dish',
    servings: 4,
    prepTimeMinutes: 15,
    cookTimeMinutes: 30,
    imageUrl: '',
    ingredients: [],
    instructions: []
  });
  const [isReorderingIngredients, setIsReorderingIngredients] = useState(false);
  const [isReorderingSteps, setIsReorderingSteps] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Shopping List Modal State
  const [isShoppingModalOpen, setIsShoppingModalOpen] = useState(false);
  const [shoppingModalIngredients, setShoppingModalIngredients] = useState<any[]>([]);

  // Add to Plan Modal State
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [planMealType, setPlanMealType] = useState('Dinner');
  const [planMealTime, setPlanMealTime] = useState('19:00');

  // Dynamic Theme Synchronization
  const applyGlobalTheme = useCallback(() => {
    try {
      // The global theme is already applied by the layout; this page only needs to know the mode.
      setIsDayMode(getEffectiveThemeMode('dark') === 'light');
    } catch (_) {}
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
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.backgroundColor = '';
      }
    };
  }, [applyGlobalTheme]);

  // Load books & recipes from PostgreSQL/MySQL and merge with /recipes localStorage cache
  const loadData = useCallback(async (user: User | null) => {
    if (!user) return;
    const activeUserId = user.id || 'usr_admin_1';

    // 1. Fetch live recipes from /api/recipes/saved and /api/recipes
    const recipeMap = new Map<string, any>();

    try {
      const rRes = await fetch(`/api/recipes/saved?userId=${encodeURIComponent(activeUserId)}`, { cache: 'no-store' });
      if (rRes.ok) {
        const rData = await rRes.json();
        if (Array.isArray(rData.recipes)) {
          rData.recipes.forEach((r: any) => {
            if (r && r.id) recipeMap.set(String(r.id), r);
          });
        }
      }
    } catch (_) {}

    try {
      const rResAlt = await fetch(`/api/recipes?userId=${encodeURIComponent(activeUserId)}`, { cache: 'no-store' });
      if (rResAlt.ok) {
        const rDataAlt = await rResAlt.json();
        const altList = Array.isArray(rDataAlt) ? rDataAlt : (rDataAlt.recipes || []);
        if (Array.isArray(altList)) {
          altList.forEach((r: any) => {
            if (r && r.id && !recipeMap.has(String(r.id))) {
              recipeMap.set(String(r.id), r);
            }
          });
        }
      }
    } catch (_) {}

    // Merge with local storage if any recipes were saved on /recipes locally
    if (typeof window !== 'undefined') {
      for (const key of ['zecratary_saved_recipes', 'zecratary_recipes']) {
        try {
          const localRaw = localStorage.getItem(key);
          if (localRaw) {
            const arr = JSON.parse(localRaw);
            if (Array.isArray(arr)) {
              arr.forEach((r: any) => {
                if (r && r.id && !recipeMap.has(String(r.id))) {
                  recipeMap.set(String(r.id), r);
                }
              });
            }
          }
        } catch (_) {}
      }
    }

    const loadedRecipes = Array.from(recipeMap.values());
    setRecipes(loadedRecipes);

    // 2. Fetch live books from /api/books
    let loadedBooks: any[] = [];
    try {
      const bRes = await fetch(`/api/books?userId=${encodeURIComponent(activeUserId)}`, { cache: 'no-store' });
      if (bRes.ok) {
        const bData = await bRes.json();
        if (Array.isArray(bData.books)) {
          loadedBooks = bData.books;
        }
      }
    } catch (_) {}

    // Fallback/merge with local storage if database books not populated yet
    if (loadedBooks.length === 0 && typeof window !== 'undefined') {
      try {
        const localB = localStorage.getItem('zecratary_recipe_books');
        if (localB) {
          const arrB = JSON.parse(localB);
          if (Array.isArray(arrB) && arrB.length > 0) {
            loadedBooks = arrB;
            fetch('/api/books', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(arrB)
            }).catch(() => {});
          }
        }
      } catch (_) {}
    }

    // Recalculate recipe counts dynamically based on loadedRecipes
    const syncdBooks = loadedBooks.map((b: any) => ({
      ...b,
      recipeCount: loadedRecipes.filter((r: any) => isRecipeInBook(r, b.id)).length
    }));

    setBooks(syncdBooks);

    // Mirror to local storage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('zecratary_recipe_books', JSON.stringify(syncdBooks));
        localStorage.setItem('zecratary_saved_recipes', JSON.stringify(loadedRecipes));
        localStorage.setItem('zecratary_recipes', JSON.stringify(loadedRecipes));
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    document.title = `${t('recipeBooksTitle', 'Recipe Books')} - FoodiePrep`;
    initAuthStorage();
    const user = getCurrentUser();

    if (!user) {
      router.replace('/login');
      return;
    }

    setCurrentUser(user);
    loadData(user);

    const handleSync = () => {
      const active = getCurrentUser();
      if (active) {
        setCurrentUser(active);
        loadData(active);
      }
    };

    window.addEventListener('storage', handleSync);
    window.addEventListener('zecratary_recipes_updated', handleSync);
    window.addEventListener('zecratary_saved_recipes_updated', handleSync);
    window.addEventListener('zecratary_recipe_books_updated', handleSync);
    window.addEventListener('zecratary_auth_changed', handleSync);

    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('zecratary_recipes_updated', handleSync);
      window.removeEventListener('zecratary_saved_recipes_updated', handleSync);
      window.removeEventListener('zecratary_recipe_books_updated', handleSync);
      window.removeEventListener('zecratary_auth_changed', handleSync);
    };
  }, [loadData, router, t]);

  const saveBooks = async (updatedUserBooks: any[]) => {
    if (!currentUser) return;
    setBooks(updatedUserBooks);

    try {
      await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUserBooks)
      });

      const raw = localStorage.getItem('zecratary_recipe_books');
      const allBooks: any[] = raw ? JSON.parse(raw) : [];
      const others = allBooks.filter((b: any) => b.userId !== currentUser.id && b.createdBy !== currentUser.email);
      localStorage.setItem('zecratary_recipe_books', JSON.stringify([...updatedUserBooks, ...others]));

      window.dispatchEvent(new Event('zecratary_recipe_books_updated'));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error('Failed to save books to database', e);
    }
  };

  const saveAllRecipes = async (updatedUserList: any[], changedItems?: any[]) => {
    if (!currentUser) return;
    setRecipes(updatedUserList);

    try {
      const payload = changedItems && changedItems.length > 0 ? changedItems : updatedUserList;
      await fetch('/api/recipes/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      localStorage.setItem('zecratary_recipes', JSON.stringify(updatedUserList));
      localStorage.setItem('zecratary_saved_recipes', JSON.stringify(updatedUserList));

      const updatedBooks = books.map((b: any) => {
        const bookRecipeIds = updatedUserList.filter((r: any) => isRecipeInBook(r, b.id)).map((r: any) => r.id);
        return {
          ...b,
          recipeIds: bookRecipeIds,
          recipe_ids: bookRecipeIds,
          recipeCount: bookRecipeIds.length
        };
      });
      await saveBooks(updatedBooks);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_recipes_updated'));
        window.dispatchEvent(new Event('zecratary_saved_recipes_updated'));
        window.dispatchEvent(new Event('storage'));
      }
    } catch (e) {
      console.error('Failed to save recipes to database', e);
    }
  };

  const handleOpenBookModal = (book: any) => {
    setSelectedBook(book);
    setShowAddRecipePicker(false);
    setPickerSearch('');
    setPickerFilter('all');
    setSelectedPickerIds([]);
  };

  // Toggle a single recipe assignment from /recipes inside the selectedBook modal
  const handleToggleRecipeInSelectedBook = async (rec: any) => {
    if (!selectedBook || !rec) return;
    const currentlyInBook = isRecipeInBook(rec, selectedBook.id);
    const targetBookId = currentlyInBook ? null : selectedBook.id;

    const updatedRec = {
      ...rec,
      bookId: targetBookId,
      book_id: targetBookId
    };

    const updatedList = recipes.map((r: any) => (r.id === rec.id ? updatedRec : r));
    await saveAllRecipes(updatedList, [updatedRec]);
  };

  // Batch add multiple selected recipes from /recipes into selectedBook
  const handleBatchAddRecipesToBook = async () => {
    if (!selectedBook || selectedPickerIds.length === 0) return;

    const changed: any[] = [];
    const updatedList = recipes.map((r: any) => {
      if (selectedPickerIds.includes(r.id)) {
        const updatedRec = {
          ...r,
          bookId: selectedBook.id,
          book_id: selectedBook.id
        };
        changed.push(updatedRec);
        return updatedRec;
      }
      return r;
    });

    await saveAllRecipes(updatedList, changed);
    setSelectedPickerIds([]);
    setShowAddRecipePicker(false);
  };

  const togglePickerSelection = (recipeId: string) => {
    setSelectedPickerIds((prev) =>
      prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
    );
  };

  const handleCreateBook = async (e?: React.SyntheticEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newTitle.trim() || !currentUser) return;

    const newBook = {
      id: 'book_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      userId: currentUser.id,
      createdBy: currentUser.email,
      creatorName: currentUser.name,
      title: newTitle.trim(),
      description: newDesc.trim() || (t('customRecipeCollection', 'Custom recipe collection')),
      recipeCount: 0,
      coverColor: newCoverColor,
      createdAt: new Date().toISOString()
    };

    const updated = [...books, newBook];
    await saveBooks(updated);
    setNewTitle('');
    setNewDesc('');
    setNewCoverColor(COVER_GRADIENTS[0].value);
    setShowAddModal(false);
  };

  const openEditModal = (e: React.MouseEvent, book: any) => {
    e.stopPropagation();
    setEditingBook(book);
    setEditTitle(book.title || '');
    setEditDesc(book.description || '');
    setEditCoverColor(book.coverColor || COVER_GRADIENTS[0].value);
  };

  const handleSaveEdit = async (e?: React.SyntheticEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editingBook || !editTitle.trim() || !currentUser) return;

    const updated = books.map((b) =>
      b.id === editingBook.id
        ? {
            ...b,
            userId: currentUser.id,
            createdBy: currentUser.email,
            creatorName: currentUser.name,
            title: editTitle.trim(),
            description: editDesc.trim(),
            coverColor: editCoverColor,
          }
        : b
    );

    await saveBooks(updated);

    if (selectedBook?.id === editingBook.id) {
      setSelectedBook({
        ...selectedBook,
        userId: currentUser.id,
        createdBy: currentUser.email,
        creatorName: currentUser.name,
        title: editTitle.trim(),
        description: editDesc.trim(),
        coverColor: editCoverColor,
      });
    }

    setEditingBook(null);
  };

  const handleDeleteBook = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(t('confirmDeleteBook', 'Are you sure you want to delete this recipe book?'))) return;
    
    try {
      await fetch(`/api/books?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const updated = books.filter((b) => b.id !== id);
      setBooks(updated);
      
      const cleanedRecipes = recipes.map(r => (isRecipeInBook(r, id) ? { ...r, bookId: null, book_id: null } : r));
      setRecipes(cleanedRecipes);

      if (selectedBook?.id === id) setSelectedBook(null);
      window.dispatchEvent(new Event('zecratary_recipe_books_updated'));
      window.dispatchEvent(new Event('zecratary_recipes_updated'));
    } catch (err) {
      console.error('Error deleting book:', err);
    }
  };

  const handleOpenRecipePopup = (rec: any) => {
    setViewingRecipe(rec);
    setServingsMultiplier(1);
    setFontSizeScale(100);
    setCompletedSteps([]);
    setNoteText(rec.note || '');
    setIsNoteOpen(false);
    setIsBookDropdownOpen(false);
    setIsEditingRecipe(false);
  };

  const updateViewingRecipeState = async (key: string, val: any) => {
    if (!viewingRecipe) return;
    const updatedRec = { ...viewingRecipe, [key]: val };
    setViewingRecipe(updatedRec);
    const updatedList = recipes.map(r => r.id === updatedRec.id ? updatedRec : r);
    await saveAllRecipes(updatedList, [updatedRec]);
  };

  const handleAssignToBook = async (bookId: string) => {
    if (!viewingRecipe) return;
    const isRemoving = isRecipeInBook(viewingRecipe, bookId);
    const targetBookId = isRemoving ? null : bookId;
    const updatedRecipe = { 
      ...viewingRecipe, 
      bookId: targetBookId,
      book_id: targetBookId 
    };
    setViewingRecipe(updatedRecipe);

    const updatedList = recipes.map(r => r.id === viewingRecipe.id ? updatedRecipe : r);
    await saveAllRecipes(updatedList, [updatedRecipe]);

    const targetBookTitle = books.find(b => b.id === bookId)?.title || 'Cookbook';
    const recName = viewingRecipe.title || viewingRecipe.name;
    if (isRemoving) {
      const msg = (t('removedFromBookAlert', 'Removed "{title}" from "{book}"'))
        .replace('{title}', String(recName ?? ''))
        .replace('{book}', String(targetBookTitle ?? ''));
      alert(msg);
    } else {
      const msg = (t('assignedToBookAlert', 'Assigned "{title}" to "{book}"!'))
        .replace('{title}', String(recName ?? ''))
        .replace('{book}', String(targetBookTitle ?? ''));
      alert(msg);
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    if (!confirm(t('confirmDeleteRecipe', 'Are you sure you want to delete this recipe?'))) return;
    try {
      await fetch(`/api/recipes/saved?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const updated = recipes.filter(r => r.id !== id);
      await saveAllRecipes(updated);
      setViewingRecipe(null);
      setIsEditingRecipe(false);
    } catch (err) {
      console.error('Error deleting recipe:', err);
    }
  };

  const toggleStepComplete = (idx: number) => {
    if (completedSteps.includes(idx)) {
      setCompletedSteps(completedSteps.filter(i => i !== idx));
    } else {
      setCompletedSteps([...completedSteps, idx]);
    }
  };

  const calculateScaledAmount = (baseAmount: any, baseServings: number, currentServings: number) => {
    if (!baseAmount || isNaN(Number(baseAmount))) return baseAmount;
    const num = Number(baseAmount);
    const scaled = (num / (baseServings || 4)) * currentServings;
    return Number.isInteger(scaled) ? scaled : Number(scaled.toFixed(2));
  };

  const handleOpenEditRecipe = () => {
    if (!viewingRecipe) return;
    setEditRecipeForm({
      title: viewingRecipe.title || viewingRecipe.name || '',
      description: viewingRecipe.description || '',
      recipeType: viewingRecipe.recipeType || viewingRecipe.tags?.[0] || 'Main Dish',
      servings: viewingRecipe.servings || 4,
      prepTimeMinutes: viewingRecipe.prepTimeMinutes || 15,
      cookTimeMinutes: viewingRecipe.cookTimeMinutes || 30,
      imageUrl: viewingRecipe.imageUrl || viewingRecipe.image || '',
      ingredients: viewingRecipe.ingredients
        ? viewingRecipe.ingredients.map((ing: any) => ({
            amount: typeof ing === 'string' ? '' : ing.amount || ing.quantity || '',
            unit: typeof ing === 'string' ? '' : ing.unit || '',
            item: typeof ing === 'string' ? ing : ing.item || ing.name || '',
            category: typeof ing === 'string' ? 'Pantry Staples' : ing.category || 'Pantry Staples'
          }))
        : [{ amount: '', unit: '', item: '', category: 'Pantry Staples' }],
      instructions: viewingRecipe.instructions && viewingRecipe.instructions.length > 0
        ? [...viewingRecipe.instructions]
        : ['']
    });
    setEditRecipeTab('info');
    setIsReorderingIngredients(false);
    setIsReorderingSteps(false);
    setIsEditingRecipe(true);
  };

  const handleSaveRecipeEdit = async () => {
    if (!editRecipeForm.title.trim() || !currentUser) {
      alert(t('enterRecipeTitleAlert', 'Please enter a recipe title.'));
      setEditRecipeTab('info');
      return;
    }

    const updatedRec = {
      ...viewingRecipe,
      ...editRecipeForm,
      userId: currentUser.id,
      createdBy: currentUser.email,
      creatorName: currentUser.name,
      tags: [editRecipeForm.recipeType]
    };

    setViewingRecipe(updatedRec);
    const updatedList = recipes.map(r => r.id === updatedRec.id ? updatedRec : r);
    await saveAllRecipes(updatedList, [updatedRec]);
    setIsEditingRecipe(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditRecipeForm((prev: any) => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number, type: 'ingredients' | 'steps') => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    if (type === 'ingredients') {
      const list = [...editRecipeForm.ingredients];
      const item = list[draggedIndex];
      list.splice(draggedIndex, 1);
      list.splice(index, 0, item);
      setEditRecipeForm({ ...editRecipeForm, ingredients: list });
    } else {
      const list = [...editRecipeForm.instructions];
      const item = list[draggedIndex];
      list.splice(draggedIndex, 1);
      list.splice(index, 0, item);
      setEditRecipeForm({ ...editRecipeForm, instructions: list });
    }
    setDraggedIndex(index);
  };
  const handleDrop = () => setDraggedIndex(null);

  const handleOpenShoppingModal = () => {
    if (!viewingRecipe) return;
    const items = (viewingRecipe.ingredients || []).map((ing: any, idx: number) => ({
      id: 'shop_item_' + idx,
      selected: true,
      amount: typeof ing === 'string' ? '' : ing.amount || ing.quantity || '',
      unit: typeof ing === 'string' ? '' : ing.unit || '',
      name: typeof ing === 'string' ? ing : ing.item || ing.name || '',
      category: typeof ing === 'string' ? 'Pantry Staples' : ing.category || 'Pantry Staples'
    }));
    setShoppingModalIngredients(items);
    setIsShoppingModalOpen(true);
  };

  const handleConfirmAddToShoppingList = () => {
    if (!currentUser) return;
    const selectedItems = shoppingModalIngredients.filter(i => i.selected);
    if (selectedItems.length === 0) {
      alert(t('noIngredientsSelectedAlert', 'No ingredients selected.'));
      return;
    }
    const local = localStorage.getItem('zecratary_shopping') || localStorage.getItem('zecratary_shopping_list');
    const current = local ? JSON.parse(local) : [];
    const formatted = selectedItems.map(i => ({
      id: 's_' + Date.now() + Math.random(),
      userId: currentUser.id,
      createdBy: currentUser.email,
      creatorName: currentUser.name,
      name: i.name,
      quantity: i.amount || '1',
      unit: i.unit || 'item',
      category: i.category,
      checked: false,
      createdAt: new Date().toISOString()
    }));
    const updated = [...formatted, ...current];
    localStorage.setItem('zecratary_shopping', JSON.stringify(updated));
    localStorage.setItem('zecratary_shopping_list', JSON.stringify(updated));
    setIsShoppingModalOpen(false);
    const alertMsg = (t('addedIngredientsToShoppingAlert', 'Added {count} ingredients to your Shopping List!'))
      .replace('{count}', String(selectedItems.length));
    alert(alertMsg);
  };

  const handleConfirmAddToPlan = () => {
    if (!viewingRecipe || !currentUser) return;
    const localPlan = localStorage.getItem('zecratary_meal_plan');
    const planItems = localPlan ? JSON.parse(localPlan) : [];
    const newMeal = {
      id: 'plan_' + Date.now(),
      userId: currentUser.id,
      createdBy: currentUser.email,
      creatorName: currentUser.name,
      date: planDate,
      recipeId: viewingRecipe.id,
      recipeName: viewingRecipe.title || viewingRecipe.name,
      image: viewingRecipe.imageUrl || viewingRecipe.image,
      mealType: planMealType,
      time: planMealTime,
      isLeftover: false,
      notes: '',
      createdAt: new Date().toISOString()
    };
    const updatedPlan = [...planItems, newMeal];
    localStorage.setItem('zecratary_meal_plan', JSON.stringify(updatedPlan));
    window.dispatchEvent(new Event('zecratary_planner_updated'));
    setIsPlanModalOpen(false);
    const alertMsg = (t('addedToMealPlanAlert', 'Added "{title}" to meal plan on {date}!'))
      .replace('{title}', String((viewingRecipe.title || viewingRecipe.name) || ''))
      .replace('{date}', String(planDate ?? ''));
    alert(alertMsg);
  };

  const filteredBooks = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return books;
    return books.filter((b) =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q)
    );
  }, [books, search]);

  // Filtered recipes for the in-modal "/recipes" picker inside selectedBook
  const pickerFilteredRecipes = useMemo(() => {
    if (!selectedBook) return [];
    const q = pickerSearch.toLowerCase().trim();
    return recipes.filter((rec: any) => {
      const inBook = isRecipeInBook(rec, selectedBook.id);
      if (pickerFilter === 'available' && inBook) return false;
      if (pickerFilter === 'added' && !inBook) return false;
      if (!q) return true;
      const titleMatch = (rec.title || rec.name || '').toLowerCase().includes(q);
      const typeMatch = (rec.recipeType || rec.category || '').toLowerCase().includes(q);
      const cuisineMatch = (rec.cuisine || '').toLowerCase().includes(q);
      return titleMatch || typeMatch || cuisineMatch;
    });
  }, [recipes, selectedBook, pickerSearch, pickerFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, gridMode]);

  const itemsPerPage = GRID_CONFIG[gridMode].perPage;
  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const paginatedBooks = filteredBooks.slice(startIndex, startIndex + itemsPerPage);

  const baseServings = viewingRecipe?.servings || 4;
  const currentTotalServings = baseServings * servingsMultiplier;
  const assignedBook = books.find(b => isRecipeInBook(viewingRecipe, b.id));

  return (
    <div 
      className="w-full max-w-full mx-auto space-y-6 pb-16 px-4 sm:px-6 lg:px-8 xl:px-10 font-sans transition-colors duration-200"
      style={{ color: isDayMode ? '#0f172a' : 'var(--color-text, #ffffff)' }}
    >
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-primary)]">
            {t('recipeBooksTitle', 'Recipe Books')}
          </h1>
          <p className="text-xs" style={{ color: isDayMode ? '#64748b' : 'var(--color-text-secondary, #94a3b8)' }}>
            {currentUser 
              ? (t('recipeBooksSubtitleUser', "{name}'s curated cookbooks ({count})"))
                  .replace('{name}', String(currentUser.name ?? ''))
                  .replace('{count}', String(books.length))
              : (t('recipeBooksSubtitleDefault', 'Organize your saved recipes into curated digital cookbooks'))}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Density Selector */}
          <div 
            className="flex items-center p-1 rounded-xl border shadow-sm"
            style={{
              backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
              borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
            }}
          >
            {(['3x3', '4x4', '5x5'] as GridMode[]).map((mode) => {
              const isActive = gridMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGridMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    isActive 
                      ? 'text-white shadow-md ring-2 ring-blue-500/80 border border-white/20' 
                      : (isDayMode ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                  }`}
                  style={isActive ? {
                    backgroundColor: 'var(--color-primary, #E05638)',
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(224, 86, 56, 0.3)'
                  } : {
                    color: isDayMode ? '#64748b' : '#94a3b8',
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

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg cursor-pointer"
            style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
          >
            <Plus className="h-4 w-4" /> {t('createRecipeBookBtn', 'Create Recipe Book')}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative" role="search">
        <Search className="h-4 w-4 absolute left-3.5 top-3 pointer-events-none" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }} />
        <input
          type="text"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          placeholder={t('searchCookbooksPlaceholder', 'Search cookbooks by title or description...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded-xl pl-10 pr-4 py-2.5 text-xs outline-none transition"
          style={{
            backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
            borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
            color: isDayMode ? '#0f172a' : '#ffffff'
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-2.5 transition cursor-pointer"
            style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Books Grid */}
      {paginatedBooks.length === 0 ? (
        <div 
          className="p-12 rounded-3xl text-center space-y-2 border"
          style={{
            backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
            borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
          }}
        >
          <Book className="h-8 w-8 mx-auto" style={{ color: isDayMode ? '#94a3b8' : '#475569' }} />
          <h4 className="text-sm font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('noCookbooksFound', 'No cookbooks found')}</h4>
          <p className="text-xs" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
            {search 
              ? (t('tryClearingSearch', 'Try clearing your search query.')) 
              : (t('createFirstCookbook', 'Create your first cookbook collection using the button above.'))}
          </p>
        </div>
      ) : (
        <div className={`grid ${GRID_CONFIG[gridMode].colsClass} gap-6`}>
          {paginatedBooks.map((book) => {
            const count = recipes.filter((r: any) => isRecipeInBook(r, book.id)).length;
            const cfg = GRID_CONFIG[gridMode];
            return (
              <div
                key={book.id}
                onClick={() => handleOpenBookModal(book)}
                className="rounded-3xl overflow-hidden transition cursor-pointer group flex flex-col justify-between shadow-sm hover:shadow-md border"
                style={{
                  backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                  borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
                }}
              >
                <div 
                  className={`${cfg.headerHeight} w-full ${isGradientClass(book.coverColor) ? (book.coverColor || COVER_GRADIENTS[0].value) : ''} p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden shadow-inner`}
                  style={getCoverBgStyle(book.coverColor)}
                >
                  <div className="flex items-center justify-between z-10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/90 bg-black/25 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10">
                      {t('cookbookBadge', 'COOKBOOK')}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-black/25 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <Book className="h-3.5 w-3.5" />
                    </div>
                  </div>

                  <h3 className={`font-black text-white ${cfg.titleSize} leading-snug drop-shadow-md z-10 truncate`}>
                    {book.title}
                  </h3>
                </div>

                <div className="p-4 sm:p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <p className="text-xs leading-relaxed line-clamp-2 min-h-[32px]" style={{ color: isDayMode ? '#475569' : '#cbd5e1' }}>
                    {book.description || (t('customRecipeCollection', 'Custom recipe collection'))}
                  </p>

                  <div 
                    className="flex items-center justify-between pt-3 border-t text-xs"
                    style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}
                  >
                    <span className="font-bold flex items-center gap-1.5 truncate pr-1" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                      <Utensils className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-primary, #E05638)' }} /> 
                      {(t('recipesCountSuffix', '{count} recipes')).replace('{count}', String(count))}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => openEditModal(e, book)}
                        className="p-1.5 rounded-xl transition cursor-pointer"
                        style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                        title={t('editCookbookTooltip', 'Edit Cookbook')}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteBook(e, book.id)}
                        className="p-1.5 rounded-xl transition cursor-pointer hover:text-red-500"
                        style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                        title={t('deleteCookbookTooltip', 'Delete Cookbook')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {filteredBooks.length > 0 && (
        <div 
          className="pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}
        >
          <span style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
            {t('showing', 'Showing')} <strong className="font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{startIndex + 1}</strong> - <strong className="font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{Math.min(startIndex + itemsPerPage, filteredBooks.length)}</strong> {t('of', 'of')} <strong className="font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{filteredBooks.length}</strong> {t('cookbooksSuffix', 'cookbooks')}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-2 rounded-xl border disabled:opacity-30 transition cursor-pointer shadow-sm"
              style={{
                backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #07090e)',
                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                color: isDayMode ? '#0f172a' : '#cbd5e1'
              }}
              title={t('previousPageTooltip', 'Previous Page')}
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
                    {showEllipsis && <span className="px-1 font-bold" style={{ color: isDayMode ? '#94a3b8' : '#64748b' }}>...</span>}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(num)}
                      className="min-w-[32px] h-8 rounded-xl text-xs font-bold transition flex items-center justify-center border cursor-pointer shadow-sm"
                      style={safeCurrentPage === num ? {
                        backgroundColor: 'var(--color-primary, #E05638)',
                        borderColor: 'var(--color-primary, #E05638)',
                        color: '#ffffff',
                        boxShadow: '0 2px 8px rgba(224, 86, 56, 0.3)'
                      } : {
                        backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #07090e)',
                        borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                        color: isDayMode ? '#0f172a' : '#cbd5e1'
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
                backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #07090e)',
                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                color: isDayMode ? '#0f172a' : '#cbd5e1'
              }}
              title={t('nextPageTooltip', 'Next Page')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* EDIT BOOK MODAL */}
      {editingBook && (
        <div 
          onClick={() => setEditingBook(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative text-xs animate-in fade-in cursor-default border transition-colors duration-200"
            style={{
              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
              color: isDayMode ? '#0f172a' : '#ffffff'
            }}
          >
            <button
              type="button"
              onClick={() => setEditingBook(null)}
              className="absolute top-4 right-4 p-2 rounded-xl transition cursor-pointer"
              style={{
                backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                color: isDayMode ? '#0f172a' : '#ffffff'
              }}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1 pr-6">
              <h2 className="text-lg font-black flex items-center gap-2" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                <Edit3 className="h-5 w-5" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('editRecipeBookTitle', 'Edit Recipe Book')}
              </h2>
              <p className="text-xs" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                {t('editRecipeBookSub', 'Update your cookbook title, description, and cover color.')}
              </p>
            </div>

            <div role="form" aria-label="Edit Cookbook Form" className="space-y-4">
              <div>
                <label className="block font-bold mb-1.5 text-xs" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  {t('bookTitleLabel', 'Book Title *')}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  placeholder={t('bookTitlePlaceholderEdit', 'e.g. Baking & Desserts')}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(e); }}
                  className="w-full border rounded-xl p-3 text-xs outline-none"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                    color: isDayMode ? '#0f172a' : '#ffffff'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                />
              </div>

              <div>
                <label className="block font-bold mb-1.5 text-xs" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  {t('templateDescriptionLabel', 'Description')}
                </label>
                <textarea
                  rows={3}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  placeholder={t('bookDescPlaceholder', 'Short summary of this cookbook collection...')}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full border rounded-xl p-3 text-xs outline-none resize-none leading-relaxed"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                    color: isDayMode ? '#0f172a' : '#ffffff'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                />
              </div>

              <div>
                <label className="block font-bold mb-2 text-xs flex items-center gap-1.5" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  <Palette className="h-4 w-4" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('backgroundColorLabel', 'Background Color')}
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {COVER_GRADIENTS.map((g) => {
                    const isSelected = editCoverColor === g.value;
                    return (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => setEditCoverColor(g.value)}
                        className={`h-11 rounded-xl ${g.value} flex items-center justify-center transition border-2 cursor-pointer ${
                          isSelected ? 'border-white scale-105 shadow-md' : 'border-transparent opacity-75 hover:opacity-100'
                        }`}
                        title={g.label}
                      >
                        {isSelected && <Check className="h-4 w-4 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>

                <div 
                  className="mt-3 p-3 rounded-2xl border flex items-center justify-between transition"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: !isGradientClass(editCoverColor) ? 'var(--color-primary, #E05638)' : (isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="relative w-9 h-9 rounded-xl border-2 flex items-center justify-center overflow-hidden cursor-pointer shadow-md transition"
                      style={{
                        borderColor: !isGradientClass(editCoverColor) ? '#ffffff' : (isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)'),
                        backgroundColor: !isGradientClass(editCoverColor) ? editCoverColor : '#E05638'
                      }}
                    >
                      <input
                        type="color"
                        value={!isGradientClass(editCoverColor) && editCoverColor.startsWith('#') && editCoverColor.length === 7 ? editCoverColor : '#E05638'}
                        onChange={(e) => setEditCoverColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        title="Pick custom color"
                      />
                      {!isGradientClass(editCoverColor) ? (
                        <Check className="h-4 w-4 text-white stroke-[3] drop-shadow pointer-events-none" />
                      ) : (
                        <Pipette className="h-4 w-4 text-white drop-shadow pointer-events-none" />
                      )}
                    </div>

                    <div>
                      <span className="text-xs font-bold block" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('customColorLabel', 'Custom Color')}</span>
                      <span className="text-[11px]" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>{t('customColorHint', 'Click to pick color wheel or type hex')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>#</span>
                    <input
                      type="text"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      placeholder="E05638"
                      value={!isGradientClass(editCoverColor) ? editCoverColor.replace('#', '') : ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim().replace('#', '');
                        setEditCoverColor('#' + raw);
                      }}
                      maxLength={6}
                      className="w-20 px-2.5 py-1.5 rounded-xl border text-xs font-mono uppercase outline-none"
                      style={{
                        backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                        borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                        color: isDayMode ? '#0f172a' : '#ffffff'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
                <button
                  type="button"
                  onClick={() => setEditingBook(null)}
                  className="px-4 py-2.5 rounded-xl font-bold transition text-xs cursor-pointer"
                  style={{
                    backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                    color: isDayMode ? '#475569' : '#cbd5e1'
                  }}
                >
                  {t('cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-5 py-2.5 rounded-xl text-white font-bold transition flex items-center gap-1.5 shadow-lg text-xs cursor-pointer"
                  style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
                >
                  <Save className="h-4 w-4" /> {t('saveChanges', 'Save Changes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE BOOK MODAL */}
      {showAddModal && (
        <div 
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative text-xs animate-in fade-in cursor-default border transition-colors duration-200"
            style={{
              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
              color: isDayMode ? '#0f172a' : '#ffffff'
            }}
          >
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl transition cursor-pointer"
              style={{
                backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                color: isDayMode ? '#0f172a' : '#ffffff'
              }}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1 pr-6">
              <h2 className="text-lg font-black flex items-center gap-2" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                <Book className="h-5 w-5" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('createRecipeBookTitle', 'Create Recipe Book')}
              </h2>
              <p className="text-xs" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                {t('createRecipeBookSub', 'Create a new curated recipe collection.')}
              </p>
            </div>

            <div role="form" aria-label="Create Cookbook Form" className="space-y-4">
              <div>
                <label className="block font-bold mb-1.5 text-xs" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  {t('bookTitleLabel', 'Book Title *')}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  placeholder={t('bookTitlePlaceholder', 'e.g. Weekend Baking & Desserts')}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBook(e); }}
                  className="w-full border rounded-xl p-3 text-xs outline-none"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                    color: isDayMode ? '#0f172a' : '#ffffff'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                />
              </div>

              <div>
                <label className="block font-bold mb-1.5 text-xs" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  {t('templateDescriptionLabel', 'Description')}
                </label>
                <textarea
                  rows={3}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  placeholder={t('bookDescPlaceholder', 'Short summary of this cookbook collection...')}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full border rounded-xl p-3 text-xs outline-none resize-none leading-relaxed"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                    color: isDayMode ? '#0f172a' : '#ffffff'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                />
              </div>

              <div>
                <label className="block font-bold mb-2 text-xs flex items-center gap-1.5" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  <Palette className="h-4 w-4" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('backgroundColorLabel', 'Background Color')}
                </label>
                
                <div className="grid grid-cols-3 gap-2.5">
                  {COVER_GRADIENTS.map((g) => {
                    const isSelected = newCoverColor === g.value;
                    return (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => setNewCoverColor(g.value)}
                        className={`h-11 rounded-xl ${g.value} flex items-center justify-center transition border-2 cursor-pointer ${
                          isSelected ? 'border-white scale-105 shadow-md' : 'border-transparent opacity-75 hover:opacity-100'
                        }`}
                        title={g.label}
                      >
                        {isSelected && <Check className="h-4 w-4 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>

                <div 
                  className="mt-3 p-3 rounded-2xl border flex items-center justify-between transition"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: !isGradientClass(newCoverColor) ? 'var(--color-primary, #E05638)' : (isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="relative w-9 h-9 rounded-xl border-2 flex items-center justify-center overflow-hidden cursor-pointer shadow-md transition"
                      style={{
                        borderColor: !isGradientClass(newCoverColor) ? '#ffffff' : (isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)'),
                        backgroundColor: !isGradientClass(newCoverColor) ? newCoverColor : '#E05638'
                      }}
                    >
                      <input
                        type="color"
                        value={!isGradientClass(newCoverColor) && newCoverColor.startsWith('#') && newCoverColor.length === 7 ? newCoverColor : '#E05638'}
                        onChange={(e) => setNewCoverColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        title="Click to pick custom color"
                      />
                      {!isGradientClass(newCoverColor) ? (
                        <Check className="h-4 w-4 text-white stroke-[3] drop-shadow pointer-events-none" />
                      ) : (
                        <Pipette className="h-4 w-4 text-white drop-shadow pointer-events-none" />
                      )}
                    </div>

                    <div>
                      <span className="text-xs font-bold block" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('customColorLabel', 'Custom Color')}</span>
                      <span className="text-[11px]" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>{t('customColorHint', 'Pick color wheel or enter hex')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>#</span>
                    <input
                      type="text"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      placeholder="E05638"
                      value={!isGradientClass(newCoverColor) ? newCoverColor.replace('#', '') : ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim().replace('#', '');
                        setNewCoverColor('#' + raw);
                      }}
                      maxLength={6}
                      className="w-20 px-2.5 py-1.5 rounded-xl border text-xs font-mono uppercase outline-none"
                      style={{
                        backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                        borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                        color: isDayMode ? '#0f172a' : '#ffffff'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold transition text-xs cursor-pointer"
                  style={{
                    backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                    color: isDayMode ? '#475569' : '#cbd5e1'
                  }}
                >
                  {t('cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleCreateBook}
                  className="px-5 py-2.5 rounded-xl text-white font-bold transition flex items-center gap-1.5 shadow-lg text-xs cursor-pointer"
                  style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
                >
                  {t('createRecipeBookBtn', 'Create Book')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW BOOK DETAILS MODAL (Task 1: /recipes Link + Task 2: Add Recipe from /recipes) */}
      {selectedBook && (
        <div 
          onClick={() => setSelectedBook(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl relative max-h-[88vh] overflow-y-auto cursor-default border transition-colors duration-200"
            style={{
              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
              color: isDayMode ? '#0f172a' : '#ffffff'
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedBook(null)}
              className="absolute top-4 right-4 p-2 rounded-xl transition cursor-pointer z-20"
              style={{
                backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                color: isDayMode ? '#0f172a' : '#ffffff'
              }}
            >
              <X className="h-4 w-4" />
            </button>

            <div 
              className={`h-32 w-full ${isGradientClass(selectedBook.coverColor) ? (selectedBook.coverColor || COVER_GRADIENTS[0].value) : ''} rounded-2xl p-6 flex flex-col justify-between text-white shadow-md`}
              style={getCoverBgStyle(selectedBook.coverColor)}
            >
              <div className="flex justify-between items-start pr-8">
                <span className="text-[10px] font-black uppercase tracking-widest bg-black/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                  {t('cookbookDetailsBadge', 'Cookbook Details')}
                </span>
                <button
                  type="button"
                  onClick={(e) => openEditModal(e, selectedBook)}
                  className="bg-black/40 hover:bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border border-white/10 cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" /> {t('editBookBtn', 'Edit Book')}
                </button>
              </div>
              <div>
                <h2 className="text-2xl font-black">{selectedBook.title}</h2>
                <p className="text-xs text-white/90 mt-0.5 line-clamp-1">{selectedBook.description}</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Header Bar with Count, Add Recipe from /recipes Toggle, and Updated /recipes Link */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 
                  className="text-sm font-bold uppercase tracking-wider"
                  style={{ color: 'var(--color-primary, #E05638)' }}
                >
                  {(t('recipesInThisBook', 'Recipes in this Book ({count})'))
                    .replace('{count}', String(recipes.filter((r: any) => isRecipeInBook(r, selectedBook.id)).length))}
                </h3>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAddRecipePicker(!showAddRecipePicker)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm border"
                    style={showAddRecipePicker ? {
                      backgroundColor: 'var(--color-inner-dark, #070b13)',
                      borderColor: 'var(--color-border, #1e293b)',
                      color: isDayMode ? '#0f172a' : '#ffffff'
                    } : {
                      backgroundColor: 'var(--color-primary, #E05638)',
                      borderColor: 'var(--color-primary, #E05638)',
                      color: '#ffffff'
                    }}
                  >
                    {showAddRecipePicker ? (
                      <>
                        <X className="h-3.5 w-3.5" /> {t('hideRecipePickerBtn', 'Close Picker')}
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" /> {t('addRecipesFromRecipesBtn', 'Add Recipe')}
                      </>
                    )}
                  </button>

                  <Link
                    href="/recipes"
                    className="text-xs font-bold hover:underline flex items-center gap-1"
                    style={{ color: 'var(--color-accent, #10b981)' }}
                  >
                    {t('browseRecipes', 'Browse Recipes')} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              {/* IN-MODAL RECIPE PICKER (Task 2: Add Recipes from /recipes directly in popup modal) */}
              {showAddRecipePicker && (
                <div
                  className="p-4 rounded-2xl border space-y-3 animate-in fade-in"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: 'var(--color-primary, #E05638)'
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BookmarkPlus className="h-4 w-4" style={{ color: 'var(--color-primary, #E05638)' }} />
                      <span className="text-xs font-extrabold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                        {t('selectRecipesToAddTitle', 'Add Recipes from /recipes')}
                      </span>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1">
                      {([
                        { id: 'all', label: t('filterAllRecipes', 'All') },
                        { id: 'available', label: t('filterAvailableRecipes', 'Available') },
                        { id: 'added', label: t('filterAssignedRecipes', 'Added') }
                      ] as const).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setPickerFilter(tab.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer"
                          style={pickerFilter === tab.id ? {
                            backgroundColor: 'var(--color-primary, #E05638)',
                            color: '#ffffff'
                          } : {
                            backgroundColor: isDayMode ? '#e2e8f0' : 'var(--color-card, #111726)',
                            color: isDayMode ? '#475569' : '#94a3b8'
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Search Input inside Picker */}
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 pointer-events-none" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }} />
                    <input
                      type="text"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      placeholder={t('searchRecipesToAddPlaceholder', 'Search recipes from /recipes by name or category...')}
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className="w-full border rounded-xl pl-9 pr-8 py-2 text-xs outline-none transition"
                      style={{
                        backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                        borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                        color: isDayMode ? '#0f172a' : '#ffffff'
                      }}
                    />
                    {pickerSearch && (
                      <button
                        type="button"
                        onClick={() => setPickerSearch('')}
                        className="absolute right-2.5 top-2 cursor-pointer"
                        style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Recipe List from /recipes */}
                  {pickerFilteredRecipes.length === 0 ? (
                    <div className="py-6 text-center space-y-2 text-xs" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                      <p>{t('noAvailableRecipesToAdd', 'No matching recipes found in /recipes.')}</p>
                      <Link
                        href="/recipes"
                        className="inline-flex items-center gap-1 font-bold hover:underline"
                        style={{ color: 'var(--color-accent, #10b981)' }}
                      >
                        {t('browseRecipes', 'Go to /recipes')} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {pickerFilteredRecipes.map((rec: any) => {
                        const alreadyInBook = isRecipeInBook(rec, selectedBook.id);
                        const isChecked = selectedPickerIds.includes(rec.id);
                        return (
                          <div
                            key={rec.id}
                            className="flex items-center justify-between p-2.5 rounded-xl border text-xs transition"
                            style={{
                              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                              borderColor: alreadyInBook
                                ? 'var(--color-accent, #10b981)'
                                : isChecked
                                ? 'var(--color-primary, #E05638)'
                                : (isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)')
                            }}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                              {!alreadyInBook && (
                                <button
                                  type="button"
                                  onClick={() => togglePickerSelection(rec.id)}
                                  className="w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition"
                                  style={isChecked ? {
                                    backgroundColor: 'var(--color-primary, #E05638)',
                                    borderColor: 'var(--color-primary, #E05638)',
                                    color: '#ffffff'
                                  } : {
                                    borderColor: isDayMode ? '#cbd5e1' : '#475569'
                                  }}
                                  title="Select for batch add"
                                >
                                  {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                                </button>
                              )}

                              <img
                                src={rec.imageUrl || rec.image || 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=200&q=80'}
                                alt={rec.title || rec.name}
                                className="w-9 h-9 rounded-lg object-cover shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <h4 className="font-bold truncate" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                                  {rec.title || rec.name}
                                </h4>
                                <span className="text-[10px] block truncate" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                                  {rec.recipeType || rec.tags?.[0] || 'Main Dish'} • {(t('servingsSuffix', '{count} servings')).replace('{count}', String(rec.servings || 4))}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleRecipeInSelectedBook(rec)}
                              className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 shrink-0 transition cursor-pointer"
                              style={alreadyInBook ? {
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                color: 'var(--color-accent, #10b981)',
                                border: '1px solid var(--color-accent, #10b981)'
                              } : {
                                backgroundColor: 'var(--color-primary, #E05638)',
                                color: '#ffffff'
                              }}
                            >
                              {alreadyInBook ? (
                                <>
                                  <Check className="h-3.5 w-3.5" /> {t('addedToBookBadge', 'In Book')}
                                </>
                              ) : (
                                <>
                                  <Plus className="h-3.5 w-3.5" /> {t('addToThisBookBtn', 'Add')}
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Batch Add Footer when checkboxes are selected */}
                  {selectedPickerIds.length > 0 && (
                    <div
                      className="pt-2 border-t flex items-center justify-between"
                      style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}
                    >
                      <span className="text-[11px] font-bold" style={{ color: isDayMode ? '#475569' : '#cbd5e1' }}>
                        {selectedPickerIds.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={handleBatchAddRecipesToBook}
                        className="px-4 py-1.5 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition"
                        style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {(t('addSelectedRecipesBtn', 'Add Selected ({count})')).replace('{count}', String(selectedPickerIds.length))}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Recipes Currently in This Book */}
              {recipes.filter((r: any) => isRecipeInBook(r, selectedBook.id)).length === 0 ? (
                <div 
                  className="p-8 rounded-2xl text-center space-y-3 border"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
                  }}
                >
                  <Utensils className="h-8 w-8 mx-auto" style={{ color: isDayMode ? '#94a3b8' : '#475569' }} />
                  <h4 className="text-sm font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                    {t('noRecipesInBook', 'No recipes in this book yet')}
                  </h4>
                  <p className="text-xs" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                    {t('assignRecipeHint', 'Click "Add Recipe" above to pick recipes from /recipes, or browse all recipes.')}
                  </p>
                  {!showAddRecipePicker && (
                    <div className="pt-1 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowAddRecipePicker(true)}
                        className="text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 shadow-md cursor-pointer transition"
                        style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                      >
                        <Plus className="h-3.5 w-3.5" /> {t('addRecipesFromRecipesBtn', 'Add Recipe from /recipes')}
                      </button>
                      <Link
                        href="/recipes"
                        className="text-xs font-bold px-4 py-2 rounded-xl border inline-flex items-center gap-1.5 transition"
                        style={{
                          borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                          color: 'var(--color-accent, #10b981)'
                        }}
                      >
                        {t('browseRecipes', 'Browse /recipes')} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recipes
                    .filter((r: any) => isRecipeInBook(r, selectedBook.id))
                    .map((rec: any) => (
                      <div 
                        key={rec.id} 
                        className="flex items-center justify-between p-3 rounded-xl border text-xs"
                        style={{
                          backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                          borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                          <img
                            src={rec.imageUrl || rec.image || 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=200&q=80'}
                            alt={rec.title || rec.name}
                            className="w-10 h-10 rounded-lg object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <h4 className="font-bold truncate" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                              {rec.title || rec.name}
                            </h4>
                            <span className="text-[10px] block truncate" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                              {rec.recipeType || rec.tags?.[0] || 'Main Dish'} • {(t('servingsSuffix', '{count} servings')).replace('{count}', String(rec.servings || 4))}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenRecipePopup(rec)}
                            className="font-bold px-3 py-1.5 rounded-lg transition border cursor-pointer"
                            style={{
                              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#0f172a' : '#ffffff'
                            }}
                          >
                            {t('viewBtn', 'View')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleRecipeInSelectedBook(rec)}
                            className="p-1.5 rounded-lg border transition cursor-pointer hover:text-red-500"
                            style={{
                              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#64748b' : '#94a3b8'
                            }}
                            title={t('removeFromBookTooltip', 'Remove from this book')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SPECIFIC RECIPE POPUP MODAL */}
      {viewingRecipe && (
        <div 
          onClick={() => { setViewingRecipe(null); setIsEditingRecipe(false); setIsBookDropdownOpen(false); }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[80] flex items-center justify-center p-3 sm:p-6 overflow-y-auto cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative cursor-default border transition-colors duration-200"
            style={{
              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
              color: isDayMode ? '#0f172a' : '#ffffff'
            }}
          >
            <button
              type="button"
              onClick={() => { setViewingRecipe(null); setIsEditingRecipe(false); setIsBookDropdownOpen(false); }}
              className="absolute top-4 right-4 z-30 p-2.5 rounded-xl border backdrop-blur-md transition cursor-pointer"
              style={{
                backgroundColor: isDayMode ? '#f1f5f9' : 'rgba(0, 0, 0, 0.7)',
                borderColor: isDayMode ? '#cbd5e1' : '#334155',
                color: isDayMode ? '#0f172a' : '#ffffff'
              }}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="overflow-y-auto flex-1">
              {!isEditingRecipe ? (
                /* RECIPE DETAILS VIEW */
                <div className="space-y-5 pb-8">
                  {/* Hero Banner */}
                  <div className="relative h-64 sm:h-72 w-full bg-slate-900 overflow-hidden flex flex-col justify-end p-5">
                    <img
                      src={viewingRecipe.imageUrl || viewingRecipe.image || 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1000&q=80'}
                      alt={viewingRecipe.title || viewingRecipe.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                    <div className="relative z-10 space-y-3">
                      <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                        {viewingRecipe.title || viewingRecipe.name}
                      </h2>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="border text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-black/60 border-white/20">
                          <Clock className="h-3.5 w-3.5" /> 
                          {(t('cookTimePrefix', 'Cook: {time} minutes')).replace('{time}', String(viewingRecipe.cookTimeMinutes || 10))}
                        </span>
                        <span className="border text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-black/60 border-white/20">
                          <Clock className="h-3.5 w-3.5" /> 
                          {(t('prepTimePrefix', 'Prep: {time} minutes')).replace('{time}', String(viewingRecipe.prepTimeMinutes || 30))}
                        </span>
                        <span className="border text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-black/60 border-white/20">
                          <Utensils className="h-3.5 w-3.5" /> {viewingRecipe.tags?.[0] || viewingRecipe.recipeType || 'Main Dish'}
                        </span>
                        
                        <button
                          type="button"
                          onClick={() => updateViewingRecipeState('isFavorite', !viewingRecipe.isFavorite)}
                          className="ml-auto w-8 h-8 bg-white/95 rounded-full flex items-center justify-center shadow hover:scale-105 transition cursor-pointer"
                          style={{ color: 'var(--color-primary, #E05638)' }}
                        >
                          <Heart className={`h-4 w-4 ${viewingRecipe.isFavorite ? 'fill-current' : 'text-slate-400'}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Top Action Row */}
                  <div className="px-5 grid grid-cols-3 gap-2.5">
                    {/* Add to Book Dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsBookDropdownOpen(!isBookDropdownOpen)}
                        className="w-full border font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        style={assignedBook ? {
                          backgroundColor: 'rgba(224, 86, 56, 0.15)',
                          borderColor: 'var(--color-primary, #E05638)',
                          color: 'var(--color-primary, #E05638)'
                        } : {
                          borderColor: 'var(--color-primary, #E05638)',
                          color: 'var(--color-primary, #E05638)'
                        }}
                      >
                        <BookmarkPlus className="h-4 w-4 shrink-0" style={{ color: 'var(--color-primary, #E05638)' }} />
                        <span className="truncate">
                          {assignedBook ? assignedBook.title : (t('addToBook', 'Add to Book'))}
                        </span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-70 ml-0.5" />
                      </button>

                      {isBookDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsBookDropdownOpen(false)} />
                          <div 
                            className="absolute left-0 top-full mt-2 w-64 border rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in"
                            style={{
                              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)'
                            }}
                          >
                            <div className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 flex items-center justify-between" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                              <span>{t('selectCookbook', 'Select Cookbook')}</span>
                              <button 
                                type="button"
                                onClick={() => { setSelectedBook(null); setIsBookDropdownOpen(false); }} 
                                className="hover:underline cursor-pointer"
                                style={{ color: 'var(--color-accent, #10b981)' }}
                              >
                                {t('books', 'Books')}
                              </button>
                            </div>

                            <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                              {books.length === 0 ? (
                                <div className="text-xs px-2.5 py-2" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>{t('noCookbooksAvailable', 'No cookbooks available')}</div>
                              ) : (
                                books.map((b) => {
                                  const isAssigned = isRecipeInBook(viewingRecipe, b.id);
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
                                        backgroundColor: 'rgba(224, 86, 56, 0.15)',
                                        color: 'var(--color-primary, #E05638)',
                                        border: '1px solid var(--color-primary, #E05638)'
                                      } : {
                                        color: isDayMode ? '#0f172a' : '#cbd5e1'
                                      }}
                                    >
                                      <span className="truncate flex-1 pr-2">{b.title}</span>
                                      {isAssigned && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-primary, #E05638)' }} />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Add to Plan Trigger */}
                    <button
                      type="button"
                      onClick={() => setIsPlanModalOpen(true)}
                      className="border font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      style={{
                        borderColor: 'var(--color-primary, #E05638)',
                        color: 'var(--color-primary, #E05638)'
                      }}
                    >
                      <CalendarPlus className="h-4 w-4" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('addToPlan', 'Add to Plan')}
                    </button>

                    {/* Shopping List Trigger */}
                    <button
                      type="button"
                      onClick={handleOpenShoppingModal}
                      className="border font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      style={{
                        borderColor: 'var(--color-primary, #E05638)',
                        color: 'var(--color-primary, #E05638)'
                      }}
                    >
                      <ShoppingCart className="h-4 w-4" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('shoppingList', 'Shopping List')}
                    </button>
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }} />

                  {/* Servings, Timer, Edit, Share Controls */}
                  <div className="px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span 
                        className="text-xs font-bold flex items-center gap-1.5"
                        style={{ color: 'var(--color-primary, #E05638)' }}
                      >
                        <Users className="h-4 w-4" /> {t('servingsLabel', 'Servings')}
                      </span>
                      <div 
                        className="flex items-center border rounded-lg overflow-hidden"
                        style={{
                          backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                          borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setServingsMultiplier(Math.max(1, servingsMultiplier - 1))}
                          className="px-2.5 py-1 font-bold cursor-pointer transition"
                          style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                        >
                          -
                        </button>
                        <span className="px-3 py-1 text-xs font-bold min-w-[32px] text-center" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                          {currentTotalServings}
                        </span>
                        <button
                          type="button"
                          onClick={() => setServingsMultiplier(servingsMultiplier + 1)}
                          className="px-2.5 py-1 font-bold cursor-pointer transition"
                          style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => alert(t('timerSetAlert', 'Kitchen Timer set for 15 minutes!'))}
                        className="border font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                        style={{
                          borderColor: 'var(--color-primary, #E05638)',
                          color: 'var(--color-primary, #E05638)'
                        }}
                      >
                        <Timer className="h-3.5 w-3.5" /> {t('timerBtn', 'Timer')}
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenEditRecipe}
                        className="border font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                        style={{
                          borderColor: 'var(--color-primary, #E05638)',
                          color: 'var(--color-primary, #E05638)'
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5" /> {t('editBtn', 'Edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href);
                          alert(t('recipeLinkCopiedAlert', 'Recipe link copied!'));
                        }}
                        className="border font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                        style={{
                          borderColor: 'var(--color-primary, #E05638)',
                          color: 'var(--color-primary, #E05638)'
                        }}
                      >
                        <Share2 className="h-3.5 w-3.5" /> {t('shareRecipeBtn', 'Share Recipe')}
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="px-5 text-xs leading-relaxed" style={{ color: isDayMode ? '#475569' : '#cbd5e1' }}>
                    {viewingRecipe.description || (t('defaultRecipeDesc', 'Authentic traditional recipe cooked to perfection.'))}
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }} />

                  {/* Ingredients & Steps Viewer */}
                  <div className="px-5 space-y-6">
                    <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
                      <h3 className="text-base font-extrabold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('ingredientsHeading', 'Ingredients')}</h3>
                      <div 
                        className="flex items-center border rounded-lg text-xs"
                        style={{
                          backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                          borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setFontSizeScale(Math.max(80, fontSizeScale - 10))}
                          className="px-2 py-1 font-bold cursor-pointer"
                          style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                        >
                          -
                        </button>
                        <span className="px-2 py-1 font-bold" style={{ color: isDayMode ? '#0f172a' : '#e2e8f0' }}>{fontSizeScale}%</span>
                        <button
                          type="button"
                          onClick={() => setFontSizeScale(Math.min(140, fontSizeScale + 10))}
                          className="px-2 py-1 font-bold cursor-pointer"
                          style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3" style={{ fontSize: `${fontSizeScale}%` }}>
                      {Array.isArray(viewingRecipe.ingredients) && viewingRecipe.ingredients.map((ing: any, idx: number) => {
                        const amt = typeof ing === 'string' ? '' : ing.amount || ing.quantity || '';
                        const unit = typeof ing === 'string' ? '' : ing.unit || '';
                        const name = typeof ing === 'string' ? ing : ing.item || ing.name || '';
                        const scaledAmount = calculateScaledAmount(amt, baseServings, currentTotalServings);
                        return (
                          <div key={idx} className="flex items-start gap-2.5 text-xs py-1">
                            <span 
                              className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                              style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                            />
                            <span style={{ color: isDayMode ? '#334155' : '#e2e8f0' }}>
                              {(scaledAmount || unit) && <strong className="font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{scaledAmount} {unit !== 'Unit' ? unit : ''} </strong>}
                              {name}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-3 pt-2">
                      <h3 className="text-base font-extrabold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('instructionsHeading', 'Instructions')}</h3>
                      <div className="space-y-2.5" style={{ fontSize: `${fontSizeScale}%` }}>
                        {Array.isArray(viewingRecipe.instructions) && viewingRecipe.instructions.map((step: string, idx: number) => {
                          const isDone = completedSteps.includes(idx);
                          return (
                            <div
                              key={idx}
                              onClick={() => toggleStepComplete(idx)}
                              className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition shadow-xs ${
                                isDone ? 'opacity-50 line-through' : ''
                              }`}
                              style={{
                                backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                                borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
                              }}
                            >
                              <span 
                                className="font-extrabold shrink-0"
                                style={{ color: 'var(--color-primary, #E05638)' }}
                              >
                                {idx + 1}.
                              </span>
                              <span className="leading-relaxed flex-1" style={{ color: isDayMode ? '#1e293b' : '#e2e8f0' }}>{step}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }} />

                  {/* Cooked & Rating */}
                  <div className="px-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => updateViewingRecipeState('isCooked', !viewingRecipe.isCooked)}
                        className="flex items-center gap-2 text-sm font-bold cursor-pointer"
                        style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}
                      >
                        {t('markAsCooked', 'Mark as Cooked')}
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                          viewingRecipe.isCooked ? 'bg-emerald-500 text-white' : (isDayMode ? 'border border-slate-300' : 'border border-slate-600')
                        }`}>
                          {viewingRecipe.isCooked && '✓'}
                        </span>
                      </button>

                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            onClick={() => updateViewingRecipeState('rating', star)}
                            className="h-4 w-4 cursor-pointer transition"
                            style={{
                              color: (viewingRecipe.rating || 0) >= star ? 'var(--color-primary, #E05638)' : (isDayMode ? '#cbd5e1' : '#334155'),
                              fill: (viewingRecipe.rating || 0) >= star ? 'var(--color-primary, #E05638)' : 'transparent'
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setIsNoteOpen(!isNoteOpen)}
                        className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition"
                        style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                      >
                        <Edit3 className="h-3.5 w-3.5" /> {t('addANote', 'Add a note')}
                      </button>

                      {isNoteOpen && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            autoComplete="off"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-form-type="other"
                            placeholder={t('addNotesPlaceholder', 'Add notes...')}
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            className="flex-1 border rounded-xl px-3 py-2 text-xs outline-none"
                            style={{
                              backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#0f172a' : '#ffffff'
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              updateViewingRecipeState('note', noteText);
                              setIsNoteOpen(false);
                            }}
                            className="text-white font-bold text-xs px-3 py-2 rounded-xl cursor-pointer shadow-sm"
                            style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                          >
                            {t('save', 'Save')}
                          </button>
                        </div>
                      )}
                      {viewingRecipe.note && !isNoteOpen && (
                        <p className="text-xs italic" style={{ color: 'var(--color-accent, #10b981)' }}>
                          Note: "{viewingRecipe.note}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border-t mx-5" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }} />

                  {/* Source Footer & Delete Action */}
                  <div className="px-5 flex items-center justify-between text-xs">
                    <div>
                      <span className="block uppercase font-bold text-[10px]" style={{ color: isDayMode ? '#94a3b8' : '#64748b' }}>
                        {t('sourceLabel', 'Source')}
                      </span>
                      {viewingRecipe.sourceUrl ? (
                        <a
                          href={viewingRecipe.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold hover:underline flex items-center gap-1 mt-0.5"
                          style={{ color: 'var(--color-accent, #10b981)' }}
                        >
                          {(t('visitSource', 'Visit {domain}')).replace('{domain}',getSafeHostname(String(new URL(viewingRecipe.sourceUrl ?? ''))).replace('www.', ''))} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                          {t('manualCustomRecipe', 'Manual / Custom Recipe')}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteRecipe(viewingRecipe.id)}
                      className="px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 border transition cursor-pointer shadow-xs"
                      style={isDayMode ? {
                        backgroundColor: '#fef2f2',
                        borderColor: '#fca5a5',
                        color: '#dc2626'
                      } : {
                        backgroundColor: 'rgba(127, 29, 29, 0.4)',
                        borderColor: 'rgba(239, 68, 68, 0.4)',
                        color: '#f87171'
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t('deleteRecipeBtn', 'Delete Recipe')}
                    </button>
                  </div>
                </div>
              ) : (
                /* RECIPE EDIT FORM */
                <div role="form" aria-label="Edit Recipe Form" className="p-6 space-y-6">
                  <div className="flex justify-between items-center border-b pb-3" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
                    <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                      <Edit3 className="h-5 w-5" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('editRecipeTitle', 'Edit Recipe')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsEditingRecipe(false)}
                      className="p-1 rounded-lg transition cursor-pointer"
                      style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div 
                    className="flex p-1.5 rounded-2xl border"
                    style={{
                      backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                      borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
                    }}
                  >
                    {[
                      { id: 'info', label: t('basicInfoTab', 'Basic Info') },
                      { id: 'ingredients', label: t('ingredientsTab', 'Ingredients') },
                      { id: 'steps', label: t('stepsTab', 'Steps') }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setEditRecipeTab(tab.id as any)}
                        className="flex-1 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer"
                        style={editRecipeTab === tab.id ? {
                          backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                          color: isDayMode ? '#0f172a' : '#ffffff',
                          border: isDayMode ? '1px solid #cbd5e1' : '1px solid var(--color-border, #1e293b)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        } : {
                          color: isDayMode ? '#64748b' : '#94a3b8'
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* TAB 1: BASIC INFO */}
                  {editRecipeTab === 'info' && (
                    <div className="space-y-5 animate-in fade-in text-xs">
                      <div className="space-y-1.5">
                        <label 
                          className="block font-bold uppercase tracking-wider text-[11px]"
                          style={{ color: 'var(--color-primary, #E05638)' }}
                        >
                          {t('photoLabel', 'Photo')}
                        </label>
                        <label 
                          className="border-2 border-dashed rounded-2xl h-44 flex flex-col items-center justify-center cursor-pointer transition relative overflow-hidden group"
                          style={{
                            backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                            borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)'
                          }}
                        >
                          {editRecipeForm.imageUrl ? (
                            <>
                              <img
                                src={editRecipeForm.imageUrl}
                                alt="Recipe Preview"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                <span 
                                  className="border text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                                  style={{
                                    backgroundColor: 'rgba(17, 23, 38, 0.9)',
                                    borderColor: 'var(--color-border, #1e293b)'
                                  }}
                                >
                                  <ImagePlus className="h-4 w-4" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('changePhoto', 'Change Photo')}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditRecipeForm({ ...editRecipeForm, imageUrl: '' });
                                  }}
                                  className="bg-red-950/90 border border-red-500/50 text-red-400 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-red-900 cursor-pointer"
                                >
                                  {t('removePhoto', 'Remove')}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="text-center space-y-2">
                              <ImagePlus className="h-8 w-8 mx-auto transition" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }} />
                              <span className="text-xs font-bold block" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                                {t('addAPhoto', 'Add a photo')}
                              </span>
                            </div>
                          )}
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                      </div>

                      <div>
                        <label 
                          className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                          style={{ color: 'var(--color-primary, #E05638)' }}
                        >
                          {t('recipeTitle', 'Recipe Title')}
                        </label>
                        <input
                          type="text"
                          required
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-form-type="other"
                          value={editRecipeForm.title}
                          onChange={(e) => setEditRecipeForm({ ...editRecipeForm, title: e.target.value })}
                          className="w-full border rounded-xl p-3 text-sm outline-none"
                          style={{
                            backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                            borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                            color: isDayMode ? '#0f172a' : '#ffffff'
                          }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                          onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                        />
                      </div>

                      <div>
                        <label 
                          className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                          style={{ color: 'var(--color-primary, #E05638)' }}
                        >
                          {t('templateDescriptionLabel', 'Description')}
                        </label>
                        <textarea
                          rows={3}
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-form-type="other"
                          value={editRecipeForm.description}
                          onChange={(e) => setEditRecipeForm({ ...editRecipeForm, description: e.target.value })}
                          className="w-full border rounded-xl p-3 text-xs outline-none resize-y leading-relaxed"
                          style={{
                            backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                            borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                            color: isDayMode ? '#0f172a' : '#ffffff'
                          }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                          onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label 
                            className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                            style={{ color: 'var(--color-primary, #E05638)' }}
                          >
                            {t('recipeType', 'Recipe Type')}
                          </label>
                          <select
                            value={editRecipeForm.recipeType}
                            onChange={(e) => setEditRecipeForm({ ...editRecipeForm, recipeType: e.target.value })}
                            className="w-full border rounded-xl p-3 text-xs outline-none cursor-pointer"
                            style={{
                              backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#0f172a' : '#ffffff'
                            }}
                          >
                            <option value="Main Dish" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('mainDish', 'Main Dish')}</option>
                            <option value="Appetizer" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>Appetizer</option>
                            <option value="Dessert" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>Dessert</option>
                            <option value="Side Dish" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>Side Dish</option>
                            <option value="Beverage" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>Beverage</option>
                          </select>
                        </div>

                        <div>
                          <label 
                            className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                            style={{ color: 'var(--color-primary, #E05638)' }}
                          >
                            {t('servingsLabel', 'Servings')}
                          </label>
                          <input
                            type="number"
                            value={editRecipeForm.servings}
                            onChange={(e) => setEditRecipeForm({ ...editRecipeForm, servings: parseInt(e.target.value) || 1 })}
                            className="w-full border rounded-xl p-3 text-xs outline-none"
                            style={{
                              backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#0f172a' : '#ffffff'
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label 
                            className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                            style={{ color: 'var(--color-primary, #E05638)' }}
                          >
                            {t('prepTimeMinsLabel', 'Preparation Time (mins)')}
                          </label>
                          <input
                            type="number"
                            value={editRecipeForm.prepTimeMinutes}
                            onChange={(e) => setEditRecipeForm({ ...editRecipeForm, prepTimeMinutes: parseInt(e.target.value) || 0 })}
                            className="w-full border rounded-xl p-3 text-xs outline-none"
                            style={{
                              backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#0f172a' : '#ffffff'
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                          />
                        </div>

                        <div>
                          <label 
                            className="block font-bold uppercase tracking-wider text-[11px] mb-1.5"
                            style={{ color: 'var(--color-primary, #E05638)' }}
                          >
                            {t('cookTimeMinsLabel', 'Cooking Time (mins)')}
                          </label>
                          <input
                            type="number"
                            value={editRecipeForm.cookTimeMinutes}
                            onChange={(e) => setEditRecipeForm({ ...editRecipeForm, cookTimeMinutes: parseInt(e.target.value) || 0 })}
                            className="w-full border rounded-xl p-3 text-xs outline-none"
                            style={{
                              backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#0f172a' : '#ffffff'
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t flex justify-end gap-3" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
                        <button
                          type="button"
                          onClick={() => setIsEditingRecipe(false)}
                          className="px-5 py-2.5 rounded-xl font-bold transition text-xs cursor-pointer"
                          style={{
                            backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                            color: isDayMode ? '#475569' : '#cbd5e1'
                          }}
                        >
                          {t('cancel', 'Cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveRecipeEdit}
                          className="px-6 py-2.5 rounded-xl text-white font-bold transition shadow-lg flex items-center gap-2 text-xs cursor-pointer"
                          style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
                        >
                          <Save className="h-4 w-4" /> {t('saveChanges', 'Save Changes')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: INGREDIENTS */}
                  {editRecipeTab === 'ingredients' && (
                    <div 
                      className="border rounded-2xl p-5 space-y-4 animate-in fade-in text-xs"
                      style={{
                        backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                        borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <h2 
                          className="text-sm font-bold uppercase tracking-wider"
                          style={{ color: 'var(--color-primary, #E05638)' }}
                        >
                          {t('ingredientsHeading', 'Ingredients')}
                        </h2>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsReorderingIngredients(!isReorderingIngredients)}
                            className="font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer"
                            style={isReorderingIngredients ? {
                              backgroundColor: 'var(--color-accent, #10b981)',
                              borderColor: 'var(--color-accent, #10b981)',
                              color: '#ffffff'
                            } : {
                              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#0f172a' : '#cbd5e1'
                            }}
                          >
                            {isReorderingIngredients ? (t('done', 'Done')) : (t('reorderBtn', 'Reorder'))}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditRecipeForm({
                              ...editRecipeForm,
                              ingredients: [...editRecipeForm.ingredients, { amount: '', unit: '', item: '', category: DEFAULT_CATEGORIES[0] }]
                            })}
                            className="text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                            style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
                          >
                            <Plus className="h-3.5 w-3.5" /> {t('addIngredientModalBtn', 'Add Ingredient')}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                        {editRecipeForm.ingredients.map((ing: any, idx: number) => (
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
                              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                              borderColor: isReorderingIngredients ? 'var(--color-accent, #10b981)' : (isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')
                            }}
                          >
                            <input
                              type="text"
                              placeholder="Amt"
                              value={ing.amount}
                              onChange={(e) => {
                                const list = [...editRecipeForm.ingredients];
                                list[idx].amount = e.target.value;
                                setEditRecipeForm({ ...editRecipeForm, ingredients: list });
                              }}
                              className="w-16 border rounded-lg p-2 text-center font-bold outline-none"
                              style={{
                                backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                                color: isDayMode ? '#0f172a' : '#ffffff'
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Unit"
                              value={ing.unit}
                              onChange={(e) => {
                                const list = [...editRecipeForm.ingredients];
                                list[idx].unit = e.target.value;
                                setEditRecipeForm({ ...editRecipeForm, ingredients: list });
                              }}
                              className="w-20 border rounded-lg p-2 text-center outline-none"
                              style={{
                                backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                                color: isDayMode ? '#0f172a' : '#cbd5e1'
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Ingredient name..."
                              value={ing.item}
                              onChange={(e) => {
                                const list = [...editRecipeForm.ingredients];
                                list[idx].item = e.target.value;
                                setEditRecipeForm({ ...editRecipeForm, ingredients: list });
                              }}
                              className="flex-1 bg-transparent border-none outline-none px-2"
                              style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}
                            />
                            <select
                              value={ing.category}
                              onChange={(e) => {
                                const list = [...editRecipeForm.ingredients];
                                list[idx].category = e.target.value;
                                setEditRecipeForm({ ...editRecipeForm, ingredients: list });
                              }}
                              className="w-36 border rounded-lg p-2 text-[11px] outline-none cursor-pointer"
                              style={{
                                backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                                color: isDayMode ? '#0f172a' : '#cbd5e1'
                              }}
                            >
                              {DEFAULT_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat} style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>{cat}</option>
                              ))}
                            </select>

                            {isReorderingIngredients ? (
                              <div className="p-2 cursor-grab" style={{ color: 'var(--color-accent, #10b981)' }}>
                                <GripVertical className="h-4 w-4" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditRecipeForm({
                                  ...editRecipeForm,
                                  ingredients: editRecipeForm.ingredients.filter((_: any, i: number) => i !== idx)
                                })}
                                className="p-2 text-red-500 hover:text-red-600 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between pt-3">
                        <button
                          type="button"
                          onClick={() => setEditRecipeTab('info')}
                          className="font-bold px-5 py-2 rounded-xl text-xs transition cursor-pointer"
                          style={{
                            backgroundColor: isDayMode ? '#e2e8f0' : 'var(--color-card, #111726)',
                            color: isDayMode ? '#0f172a' : '#cbd5e1'
                          }}
                        >
                          {t('backBtn', '← Back')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditRecipeTab('steps')}
                          className="text-white font-bold px-6 py-2 rounded-xl text-xs transition shadow-md cursor-pointer"
                          style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
                        >
                          {t('nextStepsBtn', 'Next: Steps →')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: STEPS */}
                  {editRecipeTab === 'steps' && (
                    <div 
                      className="border rounded-2xl p-5 space-y-4 animate-in fade-in text-xs"
                      style={{
                        backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                        borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <h2 
                          className="text-sm font-bold uppercase tracking-wider"
                          style={{ color: 'var(--color-primary, #E05638)' }}
                        >
                          {t('stepInstructionsHeading', 'Step-by-Step Instructions')}
                        </h2>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsReorderingSteps(!isReorderingSteps)}
                            className="font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer"
                            style={isReorderingSteps ? {
                              backgroundColor: 'var(--color-accent, #10b981)',
                              borderColor: 'var(--color-accent, #10b981)',
                              color: '#ffffff'
                            } : {
                              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                              color: isDayMode ? '#0f172a' : '#cbd5e1'
                            }}
                          >
                            {isReorderingSteps ? (t('done', 'Done')) : (t('reorderBtn', 'Reorder'))}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditRecipeForm({
                              ...editRecipeForm,
                              instructions: [...editRecipeForm.instructions, '']
                            })}
                            className="text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                            style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
                          >
                            <Plus className="h-3.5 w-3.5" /> {t('addStepBtn', 'Add Step')}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                        {editRecipeForm.instructions.map((step: string, idx: number) => (
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
                              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                              borderColor: isReorderingSteps ? 'var(--color-accent, #10b981)' : (isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')
                            }}
                          >
                            <span 
                              className="w-6 h-6 rounded-full font-bold flex items-center justify-center shrink-0 mt-1"
                              style={{
                                backgroundColor: 'rgba(224, 86, 56, 0.2)',
                                color: 'var(--color-primary, #E05638)'
                              }}
                            >
                              {idx + 1}
                            </span>
                            <textarea
                              rows={2}
                              placeholder={(t('describeStepPlaceholder', 'Describe step {n}...')).replace('{n}', String(idx + 1))}
                              value={step}
                              onChange={(e) => {
                                const list = [...editRecipeForm.instructions];
                                list[idx] = e.target.value;
                                setEditRecipeForm({ ...editRecipeForm, instructions: list });
                              }}
                              className="flex-1 bg-transparent border-none outline-none resize-y"
                              style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}
                            />

                            {isReorderingSteps ? (
                              <div className="p-2 cursor-grab mt-1" style={{ color: 'var(--color-accent, #10b981)' }}>
                                <GripVertical className="h-4 w-4" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditRecipeForm({
                                  ...editRecipeForm,
                                  instructions: editRecipeForm.instructions.filter((_: any, i: number) => i !== idx)
                                })}
                                className="p-2 text-slate-400 hover:text-red-500 h-fit cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between pt-3">
                        <button
                          type="button"
                          onClick={() => setEditRecipeTab('ingredients')}
                          className="font-bold px-5 py-2 rounded-xl text-xs transition cursor-pointer"
                          style={{
                            backgroundColor: isDayMode ? '#e2e8f0' : 'var(--color-card, #111726)',
                            color: isDayMode ? '#0f172a' : '#cbd5e1'
                          }}
                        >
                          {t('backBtn', '← Back')}
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveRecipeEdit}
                          className="text-white font-bold px-8 py-2.5 rounded-xl text-xs transition shadow-lg flex items-center gap-2 cursor-pointer"
                          style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
                        >
                          <Save className="h-4 w-4" /> {t('saveChanges', 'Save Changes')}
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

      {/* ADD TO SHOPPING LIST MODAL */}
      {isShoppingModalOpen && (
        <div 
          onClick={() => setIsShoppingModalOpen(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[90] flex items-center justify-center p-3 sm:p-6 overflow-y-auto cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl p-6 space-y-5 cursor-default border transition-colors duration-200"
            style={{
              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
              color: isDayMode ? '#0f172a' : '#ffffff'
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                  <ShoppingCart className="h-5 w-5" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('addToShoppingListTitle', 'Add to Shopping List')}
                </h3>
                <p className="text-xs" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                  {t('addToShoppingListSub', 'Select or edit items to add directly to your list')}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setIsShoppingModalOpen(false)} 
                className="cursor-pointer transition"
                style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1 text-xs">
              {shoppingModalIngredients.map((ing, idx) => (
                <div 
                  key={ing.id} 
                  className="flex items-center gap-2 p-2.5 rounded-xl border"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
                  }}
                >
                  <div
                    onClick={() => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].selected = !updated[idx].selected;
                      setShoppingModalIngredients(updated);
                    }}
                    className="w-5 h-5 rounded-lg border flex items-center justify-center cursor-pointer transition"
                    style={ing.selected ? {
                      backgroundColor: 'var(--color-primary, #E05638)',
                      borderColor: 'var(--color-primary, #E05638)',
                      color: '#ffffff'
                    } : {
                      borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                      backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)'
                    }}
                  >
                    {ing.selected && <CheckSquare className="h-3.5 w-3.5" />}
                  </div>

                  <input
                    type="text"
                    value={ing.amount}
                    onChange={(e) => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].amount = e.target.value;
                      setShoppingModalIngredients(updated);
                    }}
                    className="w-16 border rounded-lg p-2 text-center font-bold outline-none"
                    style={{
                      backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                      borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                      color: isDayMode ? '#0f172a' : '#ffffff'
                    }}
                    placeholder="Amt"
                  />
                  <input
                    type="text"
                    value={ing.unit}
                    onChange={(e) => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].unit = e.target.value;
                      setShoppingModalIngredients(updated);
                    }}
                    className="w-20 border rounded-lg p-2 text-center outline-none"
                    style={{
                      backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                      borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                      color: isDayMode ? '#0f172a' : '#cbd5e1'
                    }}
                    placeholder="Unit"
                  />
                  <input
                    type="text"
                    value={ing.name}
                    onChange={(e) => {
                      const updated = [...shoppingModalIngredients];
                      updated[idx].name = e.target.value;
                      setShoppingModalIngredients(updated);
                    }}
                    className="flex-1 bg-transparent border-none outline-none px-2"
                    style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}
                    placeholder="Ingredient name..."
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
                      backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
                      borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                      color: isDayMode ? '#0f172a' : '#cbd5e1'
                    }}
                  >
                    {DEFAULT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} style={{ backgroundColor: isDayMode ? '#ffffff' : '#111726', color: isDayMode ? '#0f172a' : '#ffffff' }}>{cat}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t flex justify-end gap-2" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
              <button
                type="button"
                onClick={() => setIsShoppingModalOpen(false)}
                className="px-4 py-2 rounded-xl font-bold text-xs cursor-pointer"
                style={{
                  backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                  color: isDayMode ? '#475569' : '#cbd5e1'
                }}
              >
                {t('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmAddToShoppingList}
                className="px-6 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
              >
                <ShoppingCart className="h-3.5 w-3.5" /> {t('addSelectedToListBtn', 'Add Selected to List')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD TO MEAL PLAN MODAL */}
      {isPlanModalOpen && (
        <div 
          onClick={() => setIsPlanModalOpen(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[90] flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-xs cursor-default border transition-colors duration-200"
            style={{
              backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #111726)',
              borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
              color: isDayMode ? '#0f172a' : '#ffffff'
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
              <h3 className="text-base font-black flex items-center gap-2" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                <CalendarPlus className="h-4 w-4" style={{ color: 'var(--color-primary, #E05638)' }} /> {t('addToMealPlanTitle', 'Add to Meal Plan')}
              </h3>
              <button 
                type="button"
                onClick={() => setIsPlanModalOpen(false)} 
                className="cursor-pointer transition"
                style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  {t('dateLabel', 'Date')}
                </label>
                <input
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 outline-none"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                    color: isDayMode ? '#0f172a' : '#ffffff'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                />
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  {t('mealTypeLabel', 'Meal Type')}
                </label>
                <select
                  value={planMealType}
                  onChange={(e) => setPlanMealType(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 outline-none cursor-pointer"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                    color: isDayMode ? '#0f172a' : '#ffffff'
                  }}
                >
                  <option value="Breakfast" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('breakfast', 'Breakfast')}</option>
                  <option value="Lunch" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('lunch', 'Lunch')}</option>
                  <option value="Dinner" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('dinner', 'Dinner')}</option>
                  <option value="Snack" style={{ backgroundColor: isDayMode ? '#ffffff' : '#070b13', color: isDayMode ? '#0f172a' : '#ffffff' }}>{t('snack', 'Snack')}</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                  {t('timeLabel', 'Time')}
                </label>
                <input
                  type="time"
                  value={planMealTime}
                  onChange={(e) => setPlanMealTime(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 outline-none"
                  style={{
                    backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                    borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                    color: isDayMode ? '#0f172a' : '#ffffff'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #E05638)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)')}
                />
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end gap-2" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="px-4 py-2 rounded-xl font-bold text-xs cursor-pointer"
                style={{
                  backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                  color: isDayMode ? '#475569' : '#cbd5e1'
                }}
              >
                {t('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmAddToPlan}
                className="px-5 py-2 rounded-xl text-white font-bold text-xs shadow-lg cursor-pointer"
                style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover, #c94529)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary, #E05638)')}
              >
                {t('scheduleMealBtn', 'Schedule Meal')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
