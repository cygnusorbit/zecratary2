import { NextResponse } from 'next/server';
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
