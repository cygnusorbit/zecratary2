import { NextResponse } from 'next/server';
import { getAllIndividualRecipes, saveIndividualRecipe, deleteIndividualRecipe, getRecipeById } from '@/lib/recipeFiles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const recipes = await getAllIndividualRecipes();
  return NextResponse.json({ success: true, count: recipes.length, data: recipes });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (Array.isArray(body.recipes)) {
    for (const r of body.recipes) {
      await saveIndividualRecipe(r);
    }
    return NextResponse.json({ success: true, message: 'All recipes saved.' });
  }
  const saved = await saveIndividualRecipe(body);
  return NextResponse.json({ success: true, data: saved });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const existing = await getRecipeById(body.id);
  if (existing) {
    const updated = await saveIndividualRecipe({ ...existing, ...body });
    return NextResponse.json({ success: true, data: updated });
  }
  const saved = await saveIndividualRecipe(body);
  return NextResponse.json({ success: true, data: saved });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  let id = searchParams.get('id');
  if (!id) {
    try {
      const body = await req.json();
      id = body.id;
    } catch (_) {}
  }
  if (id) {
    await deleteIndividualRecipe(id);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
}
