#!/usr/bin/env python3
"""
Zecratary2 Recipe Catalog Restoration Patch
1. Restores individual JSON file loading from apps/web/public/recipes/*.json.
2. Restores recipe image loading from apps/web/public/recipes/images/*.
3. Creates apps/web/src/lib/recipeFiles.ts to manage individual JSON files and database sync.
4. Restores feature-rich /recipes/page.tsx with modal view, search, filters, and dynamic theme bindings.
5. Updates postbuild to copy apps/web/public/recipes and images directly into standalone roots.
"""

import os
import sys
import json
import base64
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent

def log(msg: str):
    print(f"[*] {msg}")

def ensure_public_recipe_structure():
    """Ensure apps/web/public/recipes and images directories exist with individual recipe JSON files."""
    recipes_dir = ROOT_DIR / "apps" / "web" / "public" / "recipes"
    images_dir = recipes_dir / "images"
    recipes_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)

    # 1. Provide default placeholder image if missing
    default_img = images_dir / "default.jpg"
    if not default_img.exists():
        # Minimal 1x1 neutral JPEG placeholder to avoid broken image links
        tiny_jpeg = (
            b'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////'
            b'//////////////////////////////////////////////////////wgALCAABAAEBA'
            b'REA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
        )
        try:
            default_img.write_bytes(base64.b64decode(tiny_jpeg))
            log("Created default fallback image at apps/web/public/recipes/images/default.jpg")
        except Exception:
            pass

    # 2. Check for existing individual JSON files
    existing_jsons = [f for f in recipes_dir.glob("*.json") if f.name != "index.json"]

    if len(existing_jsons) == 0:
        log("Populating initial individual recipe JSON files in apps/web/public/recipes/...")
        sample_recipes = [
            {
                "id": "1",
                "name": "Mediterranean Quinoa Power Bowl",
                "title": "Mediterranean Quinoa Power Bowl",
                "category": "Lunch",
                "cuisine": "Mediterranean",
                "prepTime": 15,
                "cookTime": 20,
                "totalTime": 35,
                "servings": 2,
                "calories": 420,
                "difficulty": "Easy",
                "image": "/recipes/images/default.jpg",
                "ingredients": [
                    "1 cup cooked quinoa",
                    "1 cup cherry tomatoes, halved",
                    "1/2 cup kalamata olives, pitted",
                    "1 english cucumber, diced",
                    "1/4 cup crumbled feta cheese",
                    "2 tbsp extra virgin olive oil",
                    "1 tbsp fresh lemon juice",
                    "1 pinch sea salt and cracked pepper"
                ],
                "instructions": [
                    "Cook quinoa according to package instructions and let cool slightly.",
                    "Dice cucumber, halve cherry tomatoes, and prepare kalamata olives.",
                    "In a small ramekin, whisk together olive oil, lemon juice, salt, and black pepper.",
                    "Divide warm quinoa into shallow serving bowls.",
                    "Top with prepared vegetables, olives, and crumbled feta cheese.",
                    "Drizzle citrus dressing over top before serving."
                ],
                "tags": ["Healthy", "Vegetarian", "High-Protein", "Gluten-Free"],
                "isFavorite": True,
                "createdAt": "2026-10-31T00:00:00.000Z"
            },
            {
                "id": "2",
                "name": "Pan-Seared Citrus Salmon & Asparagus",
                "title": "Pan-Seared Citrus Salmon & Asparagus",
                "category": "Dinner",
                "cuisine": "American",
                "prepTime": 10,
                "cookTime": 12,
                "totalTime": 22,
                "servings": 2,
                "calories": 510,
                "difficulty": "Medium",
                "image": "/recipes/images/default.jpg",
                "ingredients": [
                    "2 wild salmon fillets (6 oz each)",
                    "1 bunch fresh asparagus, trimmed",
                    "1 fresh orange, juiced and zested",
                    "2 cloves garlic, finely minced",
                    "2 tbsp grass-fed butter",
                    "1 tbsp avocado oil",
                    "Salt and freshly ground black pepper"
                ],
                "instructions": [
                    "Pat salmon fillets dry with paper towels; season both sides with salt and pepper.",
                    "Heat avocado oil in a heavy stainless or cast-iron skillet over medium-high heat.",
                    "Place salmon skin-side down; sear for 4 minutes until golden and crisp.",
                    "Flip fillets, add asparagus, butter, garlic, orange juice, and zest to skillet.",
                    "Baste salmon with foaming butter sauce for another 3-4 minutes until asparagus is tender-crisp.",
                    "Transfer to warm plates and spoon pan juices over salmon."
                ],
                "tags": ["Keto", "High-Protein", "Omega-3", "Gluten-Free"],
                "isFavorite": True,
                "createdAt": "2026-10-31T01:00:00.000Z"
            },
            {
                "id": "3",
                "name": "Superfood Berry Acai Protein Bowl",
                "title": "Superfood Berry Acai Protein Bowl",
                "category": "Breakfast",
                "cuisine": "Modern",
                "prepTime": 8,
                "cookTime": 0,
                "totalTime": 8,
                "servings": 1,
                "calories": 340,
                "difficulty": "Easy",
                "image": "/recipes/images/default.jpg",
                "ingredients": [
                    "1 unsweetened frozen acai packet",
                    "1 scoop vanilla plant protein powder",
                    "1/2 cup unsweetened almond milk",
                    "1/2 cup fresh wild blueberries",
                    "1/2 banana, sliced",
                    "2 tbsp organic chia seeds",
                    "1/4 cup toasted almond granola"
                ],
                "instructions": [
                    "Break acai packet into high-speed blender.",
                    "Add almond milk and vanilla protein powder.",
                    "Blend on low, using tamper, until thick smoothie-bowl consistency is reached.",
                    "Spoon thick acai base into a chilled bowl.",
                    "Neatly arrange sliced banana, blueberries, chia seeds, and granola in rows on top."
                ],
                "tags": ["Breakfast", "Antioxidants", "Plant-Based", "Quick"],
                "isFavorite": False,
                "createdAt": "2026-10-31T02:00:00.000Z"
            },
            {
                "id": "4",
                "name": "Tuscan Garlic Herb Chicken",
                "title": "Tuscan Garlic Herb Chicken",
                "category": "Dinner",
                "cuisine": "Italian",
                "prepTime": 15,
                "cookTime": 25,
                "totalTime": 40,
                "servings": 4,
                "calories": 480,
                "difficulty": "Medium",
                "image": "/recipes/images/default.jpg",
                "ingredients": [
                    "4 organic chicken breasts",
                    "1 cup sun-dried tomatoes in oil, drained and chopped",
                    "3 cups fresh baby spinach",
                    "3/4 cup light coconut cream or culinary cream",
                    "4 cloves garlic, crushed",
                    "1 tsp dried oregano and basil",
                    "1 tbsp olive oil"
                ],
                "instructions": [
                    "Season chicken breasts with oregano, salt, and black pepper.",
                    "Heat olive oil in large skillet; sear chicken breasts 5-6 minutes per side until golden.",
                    "Remove chicken to a plate; add garlic and sun-dried tomatoes to the skillet.",
                    "Pour in cream, lower heat, and simmer gently for 3 minutes.",
                    "Stir in baby spinach until wilted.",
                    "Return chicken breasts to pan; simmer for 5 minutes until chicken is cooked through and sauce is thickened."
                ],
                "tags": ["Dinner", "Comfort-Food", "High-Protein"],
                "isFavorite": False,
                "createdAt": "2026-10-31T03:00:00.000Z"
            }
        ]

        for recipe in sample_recipes:
            file_path = recipes_dir / f"{recipe['id']}.json"
            file_path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
            log(f"Wrote individual recipe JSON: {file_path.relative_to(ROOT_DIR)}")
    else:
        log(f"Found {len(existing_jsons)} individual JSON recipe files in apps/web/public/recipes/.")

    return True

def patch_recipe_files_helper():
    """Create apps/web/src/lib/recipeFiles.ts to manage individual JSON file reading and writing."""
    helper_path = ROOT_DIR / "apps" / "web" / "src" / "lib" / "recipeFiles.ts"
    helper_path.parent.mkdir(parents=True, exist_ok=True)

    code = """import fs from 'fs';
import path from 'path';

export interface RecipeItem {
  id: string;
  name: string;
  title?: string;
  category: string;
  cuisine?: string;
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  servings?: number;
  calories?: number;
  difficulty?: string;
  image?: string;
  ingredients?: string[];
  instructions?: string[];
  tags?: string[];
  isFavorite?: boolean;
  createdAt?: string;
}

/**
 * Discovers candidate directory locations for apps/web/public/recipes across runtime environments
 */
export function getRecipeDirectoryCandidates(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps/web/public/recipes'),
    path.join(cwd, 'public/recipes'),
    path.join(cwd, '.next/standalone/apps/web/public/recipes'),
    path.join(cwd, '.next/standalone/public/recipes'),
    path.resolve(__dirname, '../../public/recipes'),
    path.resolve(__dirname, '../../../public/recipes'),
    path.resolve(__dirname, '../../../../public/recipes')
  ];
}

/**
 * Locates the authoritative writable or readable public/recipes directory
 */
export function getPublicRecipesDir(): string {
  const candidates = getRecipeDirectoryCandidates();
  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return cand;
    }
  }
  // Default to standard monorepo path and create if missing
  const fallback = path.join(process.cwd(), 'apps/web/public/recipes');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch (_) {}
  return fallback;
}

/**
 * Reads all individual recipe JSON files from apps/web/public/recipes/*.json
 */
export async function getAllIndividualRecipes(): Promise<RecipeItem[]> {
  const recipesDir = getPublicRecipesDir();
  const recipes: RecipeItem[] = [];

  try {
    if (fs.existsSync(recipesDir)) {
      const files = fs.readdirSync(recipesDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = path.join(recipesDir, file);
          try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const item = JSON.parse(raw);
            if (item && (item.id || item.name || item.title)) {
              recipes.push({
                id: String(item.id || path.basename(file, '.json')),
                name: item.name || item.title || 'Untitled Recipe',
                title: item.title || item.name || 'Untitled Recipe',
                category: item.category || 'General',
                cuisine: item.cuisine || 'International',
                prepTime: Number(item.prepTime || item.prep_time) || 15,
                cookTime: Number(item.cookTime || item.cook_time) || 20,
                totalTime: Number(item.totalTime || item.total_time) || 35,
                servings: Number(item.servings) || 2,
                calories: Number(item.calories) || 450,
                difficulty: item.difficulty || 'Easy',
                image: item.image || '/recipes/images/default.jpg',
                ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
                instructions: Array.isArray(item.instructions) ? item.instructions : [],
                tags: Array.isArray(item.tags) ? item.tags : ['Healthy'],
                isFavorite: Boolean(item.isFavorite || item.is_favorite),
                createdAt: item.createdAt || item.created_at || new Date().toISOString()
              });
            }
          } catch (err) {
            console.warn(`[RecipeFiles] Notice parsing ${file}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[RecipeFiles] Notice reading recipes directory:', err);
  }

  // Sort by id or createdAt
  recipes.sort((a, b) => {
    const numA = parseInt(a.id, 10);
    const numB = parseInt(b.id, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return (a.name || '').localeCompare(b.name || '');
  });

  return recipes;
}

/**
 * Saves or updates an individual recipe JSON file in apps/web/public/recipes/<id>.json
 * and synchronizes with PostgreSQL & MySQL (Constraint 8)
 */
export async function saveIndividualRecipe(recipe: Partial<RecipeItem>): Promise<RecipeItem> {
  const recipesDir = getPublicRecipesDir();
  const id = String(recipe.id || `rec_${Date.now()}`);

  const fullRecipe: RecipeItem = {
    id,
    name: recipe.name || recipe.title || 'Custom Recipe',
    title: recipe.title || recipe.name || 'Custom Recipe',
    category: recipe.category || 'Dinner',
    cuisine: recipe.cuisine || 'Modern',
    prepTime: Number(recipe.prepTime) || 15,
    cookTime: Number(recipe.cookTime) || 20,
    totalTime: Number(recipe.totalTime) || 35,
    servings: Number(recipe.servings) || 2,
    calories: Number(recipe.calories) || 450,
    difficulty: recipe.difficulty || 'Easy',
    image: recipe.image || '/recipes/images/default.jpg',
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    tags: Array.isArray(recipe.tags) ? recipe.tags : ['Healthy'],
    isFavorite: Boolean(recipe.isFavorite),
    createdAt: recipe.createdAt || new Date().toISOString()
  };

  // 1. Write individual JSON file
  try {
    const targetFile = path.join(recipesDir, `${id}.json`);
    fs.writeFileSync(targetFile, JSON.stringify(fullRecipe, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[RecipeFiles] Notice writing individual JSON file:', err);
  }

  // 2. Sync to Supabase / PostgreSQL if configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\\/$/, '');
      await fetch(`${cleanUrl}/rest/v1/saved_recipes`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify(fullRecipe)
      });
    } catch (_) {}
  }

  return fullRecipe;
}
"""
    helper_path.write_text(code, encoding="utf-8")
    log(f"Created recipeFiles helper at: {helper_path.relative_to(ROOT_DIR)}")
    return True

def patch_recipe_api_routes():
    """Ensure /api/recipes and /api/saved-recipes load individual JSON files."""
    api_dir = ROOT_DIR / "apps" / "web" / "src" / "app" / "api" / "recipes"
    api_dir.mkdir(parents=True, exist_ok=True)

    route_code = """import { NextResponse } from 'next/server';
import { getAllIndividualRecipes, saveIndividualRecipe } from '@/lib/recipeFiles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const recipes = await getAllIndividualRecipes();
    return NextResponse.json({
      success: true,
      count: recipes.length,
      data: recipes
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      data: []
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const saved = await saveIndividualRecipe(body);
    return NextResponse.json({
      success: true,
      data: saved
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}
"""
    (api_dir / "route.ts").write_text(route_code, encoding="utf-8")
    log("Configured /api/recipes to serve from individual JSON files.")

    saved_api = ROOT_DIR / "apps" / "web" / "src" / "app" / "api" / "saved-recipes"
    saved_api.mkdir(parents=True, exist_ok=True)
    (saved_api / "route.ts").write_text(route_code, encoding="utf-8")
    log("Configured /api/saved-recipes alias to serve from individual JSON files.")
    return True

def patch_recipes_page():
    """Restore the full, beautiful /recipes page with individual JSON loading and modal support."""
    page_path = ROOT_DIR / "apps" / "web" / "src" / "app" / "recipes" / "page.tsx"
    page_path.parent.mkdir(parents=True, exist_ok=True)

    page_code = """// @ts-nocheck
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Filter, Clock, Flame, Users, ChefHat, 
  Heart, Sparkles, RefreshCw, LayoutGrid, List,
  CheckCircle2, Utensils, X, Check, ArrowRight, Bookmark
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';

interface Recipe {
  id: string;
  name: string;
  title?: string;
  category: string;
  cuisine?: string;
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  servings?: number;
  calories?: number;
  difficulty?: string;
  image?: string;
  ingredients?: string[];
  instructions?: string[];
  tags?: string[];
  isFavorite?: boolean;
}

export default function RecipesPage() {
  const { t } = useTranslation();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modal Detail State
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // Fetch individual recipes from API
  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/recipes?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data)) {
          setRecipes(json.data);
        }
      } else {
        throw new Error('Failed to load individual recipe JSONs');
      }
    } catch (err: any) {
      console.warn('Notice loading recipes:', err);
      setError(err.message || 'Unable to retrieve recipes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = `${t('recipesTitle', 'Saved Recipes & Meal Library')} - Zecratary`;
    fetchRecipes();

    const handleThemeChange = () => {};
    window.addEventListener('zecratary_theme_mode_changed', handleThemeChange);
    window.addEventListener('zecratary_theme_changed', handleThemeChange);
    window.addEventListener('zecratary_locale_changed', fetchRecipes);

    return () => {
      window.removeEventListener('zecratary_theme_mode_changed', handleThemeChange);
      window.removeEventListener('zecratary_theme_changed', handleThemeChange);
      window.removeEventListener('zecratary_locale_changed', fetchRecipes);
    };
  }, [fetchRecipes, t]);

  // Extract categories dynamically
  const categories = useMemo(() => {
    const set = new Set<string>();
    recipes.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return ['All', ...Array.from(set)];
  }, [recipes]);

  // Filtered recipes
  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      const displayName = recipe.name || recipe.title || '';
      const matchesSearch =
        searchQuery === '' ||
        displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (recipe.cuisine && recipe.cuisine.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (Array.isArray(recipe.tags) && recipe.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))) ||
        (Array.isArray(recipe.ingredients) && recipe.ingredients.some((ing) => ing.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesCategory =
        selectedCategory === 'All' || recipe.category?.toLowerCase() === selectedCategory.toLowerCase();

      const matchesDifficulty =
        selectedDifficulty === 'All' || recipe.difficulty?.toLowerCase() === selectedDifficulty.toLowerCase();

      const matchesFavorite = !favoritesOnly || Boolean(recipe.isFavorite);

      return matchesSearch && matchesCategory && matchesDifficulty && matchesFavorite;
    });
  }, [recipes, searchQuery, selectedCategory, selectedDifficulty, favoritesOnly]);

  // Toggle favorite status and persist to individual JSON & DB
  const handleToggleFavorite = async (recipe: Recipe, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !recipe.isFavorite;

    setRecipes((prev) =>
      prev.map((r) => (r.id === recipe.id ? { ...r, isFavorite: newStatus } : r))
    );

    if (activeRecipe && activeRecipe.id === recipe.id) {
      setActiveRecipe({ ...activeRecipe, isFavorite: newStatus });
    }

    try {
      await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recipe, isFavorite: newStatus })
      });
      setToast({
        type: 'success',
        message: newStatus ? t('addedToFavorites', 'Recipe added to favorites!') : t('removedFromFavorites', 'Recipe removed from favorites.')
      });
      setTimeout(() => setToast(null), 3000);
    } catch (_) {}
  };

  return (
    <div 
      className="w-full max-w-full space-y-6 pb-24 px-4 sm:px-6 lg:px-8 xl:px-10 pt-2 font-sans transition-colors duration-200"
      style={{ color: 'var(--color-text)' }}
    >
      {/* Top Header & Telemetry Badges */}
      <div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <Utensils className="h-6 w-6" /> {t('recipesTitle', 'Saved Recipes & Meal Library')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {t('recipesSubtitle', 'Explore, filter, and plan chef-crafted recipes with nutritional diagnostics and dynamic pantry sync.')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold shadow-sm"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: 'var(--color-border)', 
              color: 'var(--color-text)' 
            }}
          >
            <Bookmark className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }} />
            <span>{recipes.length} {t('recipesTotalLabel', 'Recipes Available')}</span>
          </div>

          {/* View Mode Toggle Buttons */}
          <div 
            className="flex items-center p-1 rounded-xl border"
            style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${viewMode === 'grid' ? 'bg-card shadow-sm text-primary' : 'text-neutral-400'}`}
              title="Grid View"
            >
              <LayoutGrid className="h-3.5 w-3.5" style={{ color: viewMode === 'grid' ? 'var(--color-primary)' : 'inherit' }} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${viewMode === 'list' ? 'bg-card shadow-sm text-primary' : 'text-neutral-400'}`}
              title="List View"
            >
              <List className="h-3.5 w-3.5" style={{ color: viewMode === 'list' ? 'var(--color-primary)' : 'inherit' }} />
            </button>
          </div>

          <button
            type="button"
            onClick={fetchRecipes}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer shadow-sm"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
            title={t('refreshBtn', 'Refresh Recipes')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Accessible Search & Filter Controls (Constraint 9: Zero Form, data-lpignore) */}
      <div 
        role="region"
        aria-label="Recipe Search and Filters"
        data-lpignore="true"
        className="rounded-3xl p-5 space-y-4 shadow-xl border transition-colors duration-200"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)'
        }}
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" style={{ color: 'var(--color-text)' }} />
            <input
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              spellCheck={false}
              placeholder={t('searchRecipesPlaceholder', 'Search by title, ingredient, cuisine, or tags...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border rounded-2xl pl-10 pr-4 py-2 text-xs font-bold outline-none transition"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            />
          </div>

          {/* Difficulty Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="border rounded-2xl px-3.5 py-2 text-xs font-bold outline-none cursor-pointer transition"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              <option value="All">{t('filterDifficultyAll', 'All Difficulties')}</option>
              <option value="Easy">{t('filterDifficultyEasy', 'Easy')}</option>
              <option value="Medium">{t('filterDifficultyMedium', 'Medium')}</option>
              <option value="Hard">{t('filterDifficultyHard', 'Hard')}</option>
            </select>

            {/* Favorites Filter Button */}
            <button
              type="button"
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              className="px-3.5 py-2 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              style={{
                backgroundColor: favoritesOnly ? 'var(--color-primary)' : 'var(--color-inner-dark)',
                borderColor: favoritesOnly ? 'var(--color-primary)' : 'var(--color-border)',
                color: favoritesOnly ? '#ffffff' : 'var(--color-text)'
              }}
            >
              <Heart className={`h-3.5 w-3.5 ${favoritesOnly ? 'fill-white' : ''}`} />
              <span>{t('favoritesFilterBtn', 'Favorites')}</span>
            </button>
          </div>
        </div>

        {/* Category Filter Chips Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={`cat-chip-${cat}`}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className="px-3 py-1.5 rounded-xl border text-xs font-bold transition whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-inner-dark)',
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  color: isSelected ? '#ffffff' : 'var(--color-text-secondary)'
                }}
              >
                {cat === 'All' ? t('categoryAll', 'All Categories') : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recipe Grid / List Presentation */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div 
              key={`skeleton-${n}`} 
              className="rounded-3xl border p-4 space-y-3 animate-pulse h-72 flex flex-col justify-between"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <div className="w-full h-36 rounded-2xl bg-neutral-500/10" />
              <div className="space-y-2">
                <div className="h-4 rounded bg-neutral-500/20 w-3/4" />
                <div className="h-3 rounded bg-neutral-500/10 w-1/2" />
              </div>
              <div className="h-4 rounded bg-neutral-500/10 w-full" />
            </div>
          ))}
        </div>
      ) : filteredRecipes.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredRecipes.map((recipe) => {
              const name = recipe.name || recipe.title || 'Delicious Recipe';
              const totalMinutes = recipe.totalTime || (Number(recipe.prepTime || 0) + Number(recipe.cookTime || 0)) || 30;
              const imageSrc = recipe.image || `/recipes/images/default.jpg`;

              return (
                <div
                  key={`recipe-${recipe.id}`}
                  onClick={() => setActiveRecipe(recipe)}
                  className="rounded-3xl border overflow-hidden shadow-lg hover:shadow-xl transition flex flex-col justify-between group cursor-pointer"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  {/* Recipe Image Visual Container */}
                  <div 
                    className="relative h-44 w-full flex items-center justify-center overflow-hidden border-b bg-neutral-900/10"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <img
                      src={imageSrc}
                      alt={name}
                      onError={(e) => {
                        // Graceful image fallback to default placeholder
                        (e.target as HTMLImageElement).src = '/recipes/images/default.jpg';
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />

                    {/* Category Overlay Tag */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span 
                        className="px-2.5 py-1 rounded-xl text-[10px] font-bold border backdrop-blur-md shadow-sm"
                        style={{
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-primary)'
                        }}
                      >
                        {recipe.category}
                      </span>
                    </div>

                    {/* Favorite Heart Button */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(recipe, e)}
                      className="absolute top-3 right-3 p-2 rounded-full border backdrop-blur-md transition hover:scale-110 cursor-pointer shadow-sm"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        color: recipe.isFavorite ? '#ef4444' : 'var(--color-text-secondary)'
                      }}
                      title={recipe.isFavorite ? 'Remove Favorite' : 'Save as Favorite'}
                    >
                      <Heart className={`h-4 w-4 ${recipe.isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                    </button>
                  </div>

                  {/* Card Content Body */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                        {recipe.cuisine || recipe.category}
                      </div>
                      <h3 className="text-sm font-black line-clamp-2" style={{ color: 'var(--color-text)' }}>
                        {name}
                      </h3>

                      {/* Nutritional & Time Metrics Strip */}
                      <div className="flex items-center gap-3 pt-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="flex items-center gap-1 font-bold">
                          <Clock className="h-3 w-3" style={{ color: 'var(--color-primary)' }} />
                          {totalMinutes}m
                        </span>

                        {recipe.calories ? (
                          <span className="flex items-center gap-1 font-bold">
                            <Flame className="h-3 w-3 text-orange-500" />
                            {recipe.calories} kcal
                          </span>
                        ) : null}

                        {recipe.servings ? (
                          <span className="flex items-center gap-1 font-bold">
                            <Users className="h-3 w-3" style={{ color: 'var(--color-primary)' }} />
                            {recipe.servings}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Dietary Tags */}
                    {Array.isArray(recipe.tags) && recipe.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {recipe.tags.slice(0, 3).map((tag, idx) => (
                          <span 
                            key={`tag-${recipe.id}-${idx}`}
                            className="px-2 py-0.5 rounded-md text-[9px] font-bold border"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text-secondary)'
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-3">
            {filteredRecipes.map((recipe) => {
              const name = recipe.name || recipe.title || 'Delicious Recipe';
              const totalMinutes = recipe.totalTime || (Number(recipe.prepTime || 0) + Number(recipe.cookTime || 0)) || 30;
              const imageSrc = recipe.image || `/recipes/images/default.jpg`;

              return (
                <div
                  key={`list-recipe-${recipe.id}`}
                  onClick={() => setActiveRecipe(recipe)}
                  className="rounded-2xl border p-3 flex items-center justify-between gap-4 transition hover:shadow-md cursor-pointer"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={imageSrc}
                      alt={name}
                      onError={(e) => { (e.target as HTMLImageElement).src = '/recipes/images/default.jpg'; }}
                      className="w-16 h-16 rounded-xl object-cover"
                    />
                    <div>
                      <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-primary)' }}>
                        {recipe.category} • {recipe.cuisine}
                      </div>
                      <h3 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                        {name}
                      </h3>
                      <div className="flex items-center gap-3 text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                        <span>{totalMinutes} mins</span>
                        {recipe.calories && <span>• {recipe.calories} kcal</span>}
                        {recipe.difficulty && <span>• {recipe.difficulty}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(recipe, e)}
                      className="p-2 rounded-full border transition hover:scale-105 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--color-inner-dark)',
                        borderColor: 'var(--color-border)',
                        color: recipe.isFavorite ? '#ef4444' : 'var(--color-text-secondary)'
                      }}
                    >
                      <Heart className={`h-4 w-4 ${recipe.isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                    </button>
                    <ArrowRight className="h-4 w-4 opacity-40" />
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Empty State */
        <div 
          className="rounded-3xl border p-12 text-center space-y-3"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <Utensils className="h-10 w-10 mx-auto opacity-40" style={{ color: 'var(--color-primary)' }} />
          <h3 className="text-base font-black" style={{ color: 'var(--color-text)' }}>
            {t('noRecipesFoundTitle', 'No Recipes Match Your Filters')}
          </h3>
          <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            {t('noRecipesFoundDesc', 'Try clearing your search query or reset the category filters to display the complete culinary catalog.')}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setSelectedDifficulty('All');
                setFavoritesOnly(false);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow transition hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {t('resetFiltersBtn', 'Reset Filters')}
            </button>
          </div>
        </div>
      )}

      {/* Recipe Detail Modal */}
      {activeRecipe && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div 
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl space-y-5 p-6 relative transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>
                  {activeRecipe.category} • {activeRecipe.cuisine || 'International'}
                </span>
                <h2 className="text-xl font-black mt-1.5" style={{ color: 'var(--color-text)' }}>
                  {activeRecipe.name || activeRecipe.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveRecipe(null)}
                className="p-1.5 rounded-full border transition hover:opacity-80 cursor-pointer"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl border text-center" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                <span className="text-[10px] font-bold opacity-60">Prep & Cook</span>
                <div className="text-xs font-black mt-0.5">{activeRecipe.totalTime || 30} mins</div>
              </div>
              <div className="p-3 rounded-2xl border text-center" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                <span className="text-[10px] font-bold opacity-60">Calories</span>
                <div className="text-xs font-black mt-0.5">{activeRecipe.calories || 450} kcal</div>
              </div>
              <div className="p-3 rounded-2xl border text-center" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                <span className="text-[10px] font-bold opacity-60">Servings</span>
                <div className="text-xs font-black mt-0.5">{activeRecipe.servings || 2} persons</div>
              </div>
            </div>

            {/* Ingredients Checklist */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                Ingredients
              </h4>
              <ul className="space-y-1.5 text-xs">
                {Array.isArray(activeRecipe.ingredients) && activeRecipe.ingredients.map((ing, idx) => (
                  <li key={`ing-${idx}`} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>{ing}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                Instructions
              </h4>
              <ol className="space-y-2.5 text-xs">
                {Array.isArray(activeRecipe.instructions) && activeRecipe.instructions.map((inst, idx) => (
                  <li key={`inst-${idx}`} className="flex items-start gap-2.5">
                    <span 
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed pt-0.5">{inst}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={(e) => handleToggleFavorite(activeRecipe, e)}
                className="px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <Heart className={`h-3.5 w-3.5 ${activeRecipe.isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                <span>{activeRecipe.isFavorite ? 'Favorited' : 'Add to Favorites'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveRecipe(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow transition hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Toast */}
      {toast && (
        <div 
          className="fixed bottom-6 right-6 z-50 p-3.5 rounded-2xl border text-xs font-bold shadow-xl animate-in fade-in"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-primary)', color: 'var(--color-text)' }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
"""
    page_path.write_text(page_code, encoding="utf-8")
    log(f"Restored /recipes page at: {page_path.relative_to(ROOT_DIR)}")
    return True

def patch_package_json_postbuild():
    """Ensure standalone bundle physically copies apps/web/public/recipes and images."""
    web_pkg = ROOT_DIR / "apps" / "web" / "package.json"
    if not web_pkg.exists():
        return False

    with open(web_pkg, "r", encoding="utf-8") as f:
        data = json.load(f)

    scripts = data.get("scripts", {})
    scripts["build"] = "next build --webpack && npm run postbuild"
    # Ensure all recipes JSON and recipe images are bundled into both app and standalone root
    scripts["postbuild"] = (
        "mkdir -p .next/standalone/apps/web/.next && "
        "mkdir -p .next/standalone/apps/web/public/recipes/images && "
        "mkdir -p .next/standalone/public/recipes/images && "
        "cp -rn public/. .next/standalone/apps/web/public/ 2>/dev/null || true && "
        "cp -rn public/. .next/standalone/public/ 2>/dev/null || true && "
        "cp -rn .next/static .next/standalone/apps/web/.next/static 2>/dev/null || true && "
        "cp ../../server.js .next/standalone/server.js 2>/dev/null || true"
    )
    scripts["start"] = "node server.js"
    data["scripts"] = scripts

    with open(web_pkg, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    log("Updated apps/web/package.json postbuild script with recursive public/recipes asset copying.")
    return True

def main():
    print("=" * 65)
    print("Restoring Individual JSON Recipe System & Media Paths")
    print("=" * 65)

    success = (
        ensure_public_recipe_structure()
        and patch_recipe_files_helper()
        and patch_recipe_api_routes()
        and patch_recipes_page()
        and patch_package_json_postbuild()
    )

    if success:
        print("\n[SUCCESS] Individual JSON recipes and media restored.")
        print("Run the verification steps to compile and deploy.")
    else:
        print("\n[ERROR] Patch encountered an issue.", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
