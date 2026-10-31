export async function syncUserSavedRecipes(userId?: string): Promise<any[]> {
  try {
    const res = await fetch(`/api/recipes?userId=${encodeURIComponent(userId || '')}&t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) return json.data;
      if (Array.isArray(json.recipes) && json.recipes.length > 0) return json.recipes;
      if (Array.isArray(json) && json.length > 0) return json;
    }
  } catch (e) {
    console.warn('[recipeSync] API fetch failed, checking local storage:', e);
  }

  if (typeof window !== 'undefined') {
    try {
      const local = localStorage.getItem('zecratary_saved_recipes') || localStorage.getItem('zecratary_recipes');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
  }
  return [];
}

export async function persistSavedRecipe(userId: string, recipes: any[]): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('zecratary_saved_recipes', JSON.stringify(recipes));
      localStorage.setItem('zecratary_recipes', JSON.stringify(recipes));
    } catch (_) {}
  }
  try {
    await fetch('/api/recipes/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, recipes })
    });
  } catch (e) {
    console.warn('[recipeSync] persistSavedRecipe call failed:', e);
  }
}

export async function deleteSavedRecipe(userId: string, recipeId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const local = localStorage.getItem('zecratary_saved_recipes');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((r: any) => r.id !== recipeId);
          localStorage.setItem('zecratary_saved_recipes', JSON.stringify(filtered));
        }
      }
    } catch (_) {}
  }
  try {
    await fetch(`/api/recipes/saved?id=${encodeURIComponent(recipeId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recipeId, userId })
    });
  } catch (e) {
    console.warn('[recipeSync] deleteSavedRecipe call failed:', e);
  }
}
