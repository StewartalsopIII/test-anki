import { NextRequest, NextResponse } from 'next/server';
import { getAllCards, getCardsByDeck, searchCards, createNote, createCard, deleteCard, moveCardToDeck, getNoteTypes } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deckId = searchParams.get('deckId');
    const query = searchParams.get('q');

    let cards;
    if (query) {
      cards = searchCards(query);
    } else if (deckId) {
      cards = getCardsByDeck(parseInt(deckId));
    } else {
      cards = getAllCards();
    }

    return NextResponse.json(cards);
  } catch (error) {
    console.error('Error fetching cards:', error);
    return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deckId, front, back, tags = '' } = body;

    // Get first note type
    const noteTypes = getNoteTypes() as { id: number; name: string }[];
    if (noteTypes.length === 0) {
      return NextResponse.json({ error: 'No note types found' }, { status: 400 });
    }

    const flds = `${front}\x1f${back}`;
    const noteId = createNote(noteTypes[0].id, flds, tags);
    const cardId = createCard(noteId, deckId);

    return NextResponse.json({ cardId, noteId });
  } catch (error) {
    console.error('Error creating card:', error);
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cardId = searchParams.get('id');

    if (!cardId) {
      return NextResponse.json({ error: 'Card ID required' }, { status: 400 });
    }

    deleteCard(parseInt(cardId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting card:', error);
    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardId, deckId } = body;

    if (!cardId || !deckId) {
      return NextResponse.json({ error: 'Card ID and Deck ID required' }, { status: 400 });
    }

    moveCardToDeck(cardId, deckId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error moving card:', error);
    return NextResponse.json({ error: 'Failed to move card' }, { status: 500 });
  }
}
