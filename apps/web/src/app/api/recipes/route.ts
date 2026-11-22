import { NextResponse } from 'next/server';
import { getAllIndividualRecipes, saveIndividualRecipe } from '@/lib/recipeFiles';
import { scopeToSession } from '@/lib/requestUser';

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
    const scoped = scopeToSession(req, {});
    if (scoped.error) return scoped.error;
    const raw = await req.json();
    // Accept both a bare recipe and the { recipe, userId } wrapper the chef sends.
    const body = raw && typeof raw.recipe === 'object' && raw.recipe ? raw.recipe : raw;
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
