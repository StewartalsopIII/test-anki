import { NextResponse } from 'next/server';
import { getDecks } from '@/lib/db';

export async function GET() {
  try {
    const decks = getDecks();
    return NextResponse.json(decks);
  } catch (error) {
    console.error('Error fetching decks:', error);
    return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 });
  }
}
