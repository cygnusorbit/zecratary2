import fs from 'fs';
import path from 'path';

export interface RecipeItem {
  id: string;
  name: string;
  title?: string;
  category: string;
  recipeType?: string;
  cuisine?: string;
  prepTime?: number;
  prepTimeMinutes?: number;
  cookTime?: number;
  cookTimeMinutes?: number;
  totalTime?: number;
  servings?: number;
  calories?: number;
  rating?: number;
  difficulty?: string;
  image?: string;
  imageUrl?: string;
  ingredients?: any[];
  instructions?: string[];
  tags?: string[];
  isFavorite?: boolean;
  isCooked?: boolean;
  bookId?: string | null;
  book_id?: string | null;
  note?: string;
  sourceUrl?: string;
  source_url?: string;
  createdAt?: string;
}

export type Recipe = RecipeItem;

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

export const getPublicRecipesDir = getRecipeJsonDir;

export function getRecipeImagesDir(): string {
  const jsonDir = getRecipeJsonDir();
  const imagesDir = path.join(jsonDir, 'images');
  try {
    fs.mkdirSync(imagesDir, { recursive: true });
  } catch (_) {}
  return imagesDir;
}

export const getRecipeImageDir = getRecipeImagesDir;

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
                category: item.category || item.recipeType || 'Main Dish',
                recipeType: item.recipeType || item.category || 'Main Dish',
                cuisine: item.cuisine || 'International',
                prepTime: Number(item.prepTime || item.prepTimeMinutes || item.prep_time) || 15,
                prepTimeMinutes: Number(item.prepTimeMinutes || item.prepTime || item.prep_time) || 15,
                cookTime: Number(item.cookTime || item.cookTimeMinutes || item.cook_time) || 10,
                cookTimeMinutes: Number(item.cookTimeMinutes || item.cookTime || item.cook_time) || 10,
                totalTime: Number(item.totalTime || item.total_time) || 25,
                servings: Number(item.servings) || 4,
                calories: Number(item.calories) || 450,
                rating: Number(item.rating) || 0,
                difficulty: item.difficulty || 'Easy',
                image: item.image || item.imageUrl || '/recipes/images/default.jpg',
                imageUrl: item.imageUrl || item.image || '/recipes/images/default.jpg',
                ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
                instructions: Array.isArray(item.instructions) ? item.instructions : [],
                tags: Array.isArray(item.tags) ? item.tags : ['Main Dish'],
                isFavorite: Boolean(item.isFavorite || item.is_favorite),
                isCooked: Boolean(item.isCooked || item.is_cooked),
                bookId: item.bookId || item.book_id || null,
                book_id: item.book_id || item.bookId || null,
                note: item.note || '',
                sourceUrl: item.sourceUrl || item.source_url || '',
                source_url: item.source_url || item.sourceUrl || '',
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
        category: item.category || item.recipeType || 'Main Dish',
        recipeType: item.recipeType || item.category || 'Main Dish',
        cuisine: item.cuisine || 'International',
        prepTimeMinutes: Number(item.prepTimeMinutes || item.prepTime) || 15,
        cookTimeMinutes: Number(item.cookTimeMinutes || item.cookTime) || 10,
        servings: Number(item.servings) || 4,
        calories: Number(item.calories) || 450,
        rating: Number(item.rating) || 0,
        difficulty: item.difficulty || 'Easy',
        imageUrl: item.imageUrl || item.image || '/recipes/images/default.jpg',
        image: item.image || item.imageUrl || '/recipes/images/default.jpg',
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
        instructions: Array.isArray(item.instructions) ? item.instructions : [],
        tags: Array.isArray(item.tags) ? item.tags : ['Main Dish'],
        isFavorite: Boolean(item.isFavorite || item.is_favorite),
        isCooked: Boolean(item.isCooked || item.is_cooked),
        bookId: item.bookId || item.book_id || null,
        book_id: item.book_id || item.bookId || null,
        note: item.note || '',
        sourceUrl: item.sourceUrl || item.source_url || '',
        source_url: item.source_url || item.sourceUrl || '',
        createdAt: item.createdAt || item.created_at || new Date().toISOString()
      };
    } catch (_) {}
  }
  return null;
}

export const getRecipeById = getRecipeByFilename;

export async function saveIndividualRecipe(recipe: Partial<RecipeItem>): Promise<RecipeItem> {
  const recipesDir = getRecipeJsonDir();
  const id = String(recipe.id || `rec_${Date.now()}`);

  const fullRecipe: RecipeItem = {
    id,
    name: recipe.name || recipe.title || 'Custom Recipe',
    title: recipe.title || recipe.name || 'Custom Recipe',
    category: recipe.category || recipe.recipeType || 'Main Dish',
    recipeType: recipe.recipeType || recipe.category || 'Main Dish',
    cuisine: recipe.cuisine || 'Modern',
    prepTimeMinutes: Number(recipe.prepTimeMinutes || recipe.prepTime) || 15,
    cookTimeMinutes: Number(recipe.cookTimeMinutes || recipe.cookTime) || 10,
    servings: Number(recipe.servings) || 4,
    calories: Number(recipe.calories) || 450,
    rating: Number(recipe.rating) || 0,
    difficulty: recipe.difficulty || 'Easy',
    imageUrl: recipe.imageUrl || recipe.image || '/recipes/images/default.jpg',
    image: recipe.image || recipe.imageUrl || '/recipes/images/default.jpg',
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    tags: Array.isArray(recipe.tags) ? recipe.tags : [recipe.category || 'Main Dish'],
    isFavorite: Boolean(recipe.isFavorite),
    isCooked: Boolean(recipe.isCooked),
    bookId: recipe.bookId || recipe.book_id || null,
    book_id: recipe.book_id || recipe.bookId || null,
    note: recipe.note || '',
    sourceUrl: recipe.sourceUrl || recipe.source_url || '',
    source_url: recipe.source_url || recipe.sourceUrl || '',
    createdAt: recipe.createdAt || new Date().toISOString()
  };

  try {
    const targetFile = path.join(recipesDir, `${id}.json`);
    fs.writeFileSync(targetFile, JSON.stringify(fullRecipe, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[RecipeFiles] Notice writing individual JSON file:', err);
  }

  // Synchronize to PostgreSQL / Supabase if configured
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
