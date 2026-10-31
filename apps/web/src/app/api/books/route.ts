import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const defaultBooks = [
  { id: 'book_1', title: 'Family Favorites & Weeknight Dinners', description: 'Quick and easy meals.' },
  { id: 'book_2', title: 'Authentic Asian Cuisine', description: 'Traditional recipes & stir-fries.' },
  { id: 'book_3', title: 'Baking & Desserts', description: 'Sweet treats & pastries.' }
];

export async function GET() {
  return NextResponse.json({ success: true, books: defaultBooks });
}

export async function POST(req: Request) {
  const body = await req.json();
  return NextResponse.json({ success: true, book: body });
}
