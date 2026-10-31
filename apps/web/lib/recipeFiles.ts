import fs from 'fs';
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

export type Recipe = RecipeItem;

/**
 * Searches candidate directory locations for individual recipe JSON files
 * across standard local dev, Monorepo build, and Hostinger standalone runtimes.
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
 * Authoritative directory locator for individual JSON recipe files
 */
export function getRecipeJsonDir(): string {
  const candidates = getRecipeDirectoryCandidates();
  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return cand;
    }
  }
  const fallback = path.join(process.cwd(), 'apps/web/public/recipes');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch (_) {}
  return fallback;
}

// Backward-compatible alias
export const getPublicRecipesDir = getRecipeJsonDir;

/**
 * Authoritative directory locator for recipe images
 */
export function getRecipeImagesDir(): string {
  const jsonDir = getRecipeJsonDir();
  const imagesDir = path.join(jsonDir, 'images');
  try {
    fs.mkdirSync(imagesDir, { recursive: true });
  } catch (_) {}
  return imagesDir;
}

// Backward-compatible alias
export const getRecipeImageDir = getRecipeImagesDir;

/**
 * Downloads a remote image or decodes Base64 data and writes it into apps/web/public/recipes/images/
 * Returns a hybrid String object satisfying both string paths and destructured object properties.
 */
export async function saveRecipeImageLocally(
  imageUrlOrData: string,
  preferredFileName?: string
): Promise<any> {
  const imagesDir = getRecipeImagesDir();
  const defaultUrl = '/recipes/images/default.jpg';

  if (!imageUrlOrData) {
    const res = new String(defaultUrl);
    (res as any).fileName = 'default.jpg';
    (res as any).localPath = defaultUrl;
    (res as any).url = defaultUrl;
    (res as any).filePath = path.join(imagesDir, 'default.jpg');
    return res;
  }

  // If already a local public URL, return as-is with attached properties
  if (imageUrlOrData.startsWith('/recipes/images/') || imageUrlOrData.startsWith('/images/')) {
    const fileName = path.basename(imageUrlOrData);
    const res = new String(imageUrlOrData);
    (res as any).fileName = fileName;
    (res as any).localPath = imageUrlOrData;
    (res as any).url = imageUrlOrData;
    (res as any).filePath = path.join(imagesDir, fileName);
    return res;
  }

  const safeName = preferredFileName
    ? preferredFileName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
    : `recipe_${Date.now()}`;

  const ext = imageUrlOrData.includes('.png') ? '.png' : imageUrlOrData.includes('.webp') ? '.webp' : '.jpg';
  const targetFileName = safeName.endsWith('.jpg') || safeName.endsWith('.png') || safeName.endsWith('.webp')
    ? safeName
    : `${safeName}${ext}`;

  const targetDiskPath = path.join(imagesDir, targetFileName);
  const publicUrl = `/recipes/images/${targetFileName}`;

  try {
    if (imageUrlOrData.startsWith('data:image/')) {
      const base64Data = imageUrlOrData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(targetDiskPath, buffer);
    } else if (imageUrlOrData.startsWith('http://') || imageUrlOrData.startsWith('https://')) {
      const fetchRes = await fetch(imageUrlOrData, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (fetchRes.ok) {
        const arrayBuf = await fetchRes.arrayBuffer();
        fs.writeFileSync(targetDiskPath, Buffer.from(arrayBuf));
      } else {
        const fallback = new String(defaultUrl);
        (fallback as any).fileName = 'default.jpg';
        (fallback as any).localPath = defaultUrl;
        (fallback as any).url = defaultUrl;
        (fallback as any).filePath = path.join(imagesDir, 'default.jpg');
        return fallback;
      }
    } else {
      const fallback = new String(defaultUrl);
      (fallback as any).fileName = 'default.jpg';
      (fallback as any).localPath = defaultUrl;
      (fallback as any).url = defaultUrl;
      (fallback as any).filePath = path.join(imagesDir, 'default.jpg');
      return fallback;
    }

    const res = new String(publicUrl);
    (res as any).fileName = targetFileName;
    (res as any).localPath = publicUrl;
    (res as any).url = publicUrl;
    (res as any).filePath = targetDiskPath;
    return res;
  } catch (err) {
    console.warn('[RecipeFiles] Notice in saveRecipeImageLocally:', err);
    const fallback = new String(defaultUrl);
    (fallback as any).fileName = 'default.jpg';
    (fallback as any).localPath = defaultUrl;
    (fallback as any).url = defaultUrl;
    (fallback as any).filePath = path.join(imagesDir, 'default.jpg');
    return fallback;
  }
}

/**
 * Reads all individual recipe JSON files from apps/web/public/recipes/*.json
 */
export async function getAllIndividualRecipes(): Promise<RecipeItem[]> {
  const recipesDir = getRecipeJsonDir();
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

  recipes.sort((a, b) => {
    const numA = parseInt(a.id, 10);
    const numB = parseInt(b.id, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return (a.name || '').localeCompare(b.name || '');
  });

  return recipes;
}

export const getAllRecipes = getAllIndividualRecipes;

/**
 * Retrieves a single recipe by its filename or ID
 */
export async function getRecipeByFilename(filename: string): Promise<RecipeItem | null> {
  const recipesDir = getRecipeJsonDir();
  const cleanName = filename.endsWith('.json') ? filename : `${filename}.json`;
  const filePath = path.join(recipesDir, cleanName);

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const item = JSON.parse(raw);
      return {
        id: String(item.id || path.basename(cleanName, '.json')),
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
      };
    } catch (_) {}
  }
  return null;
}

export const getRecipeById = getRecipeByFilename;

/**
 * Saves or updates an individual recipe JSON file in apps/web/public/recipes/<id>.json
 * and synchronizes the record with PostgreSQL (Supabase) and MySQL catalogs.
 */
export async function saveIndividualRecipe(recipe: Partial<RecipeItem>): Promise<RecipeItem> {
  const recipesDir = getRecipeJsonDir();
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

  // 2. Synchronize to PostgreSQL / Supabase if configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/$/, '');
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

export const saveRecipe = saveIndividualRecipe;
export const saveRecipeItem = saveIndividualRecipe;

/**
 * Deletes an individual recipe JSON file and purges the database row
 */
export async function deleteIndividualRecipe(id: string): Promise<boolean> {
  const recipesDir = getRecipeJsonDir();
  const targetFile = path.join(recipesDir, `${id}.json`);
  let success = false;

  if (fs.existsSync(targetFile)) {
    try {
      fs.unlinkSync(targetFile);
      success = true;
    } catch (_) {}
  }

  // Synchronize delete with PostgreSQL / Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/$/, '');
      await fetch(`${cleanUrl}/rest/v1/saved_recipes?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (_) {}
  }

  return success;
}

export const deleteRecipe = deleteIndividualRecipe;
