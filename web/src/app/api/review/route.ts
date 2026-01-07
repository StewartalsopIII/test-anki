import { NextRequest, NextResponse } from 'next/server';
import {
  getReviewQueue,
  getReviewQueueByDeck,
  getDecksWithDueCounts,
  getUrgentCount,
  updateCardSchedule,
  URGENT_DECK_ID,
  type ReviewAction,
} from '@/lib/db';

// GET /api/review - Get review queue
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeAll = searchParams.get('all') === 'true';
    const deckId = searchParams.get('deckId');
    const listDecks = searchParams.get('listDecks') === 'true';

    // Return list of decks with due counts
    if (listDecks) {
      const decks = getDecksWithDueCounts();
      return NextResponse.json({ decks, urgentDeckId: URGENT_DECK_ID });
    }

    // Filter by specific deck
    if (deckId) {
      const cards = getReviewQueueByDeck(parseInt(deckId, 10));
      const urgentCount = getUrgentCount();
      return NextResponse.json({
        cards,
        urgentCount,
        isBlocking: false, // No blocking when filtering by deck
        urgentDeckId: URGENT_DECK_ID,
      });
    }

    // Default: get all due cards with blocking logic
    const cards = getReviewQueue(!includeAll);
    const urgentCount = getUrgentCount();
    const isBlocking = urgentCount > 0;

    return NextResponse.json({
      cards,
      urgentCount,
      isBlocking,
      urgentDeckId: URGENT_DECK_ID,
    });
  } catch (error) {
    console.error('Failed to fetch review queue:', error);
    return NextResponse.json({ error: 'Failed to fetch review queue' }, { status: 500 });
  }
}

// POST /api/review - Record a review action
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardId, action } = body as { cardId: number; action: ReviewAction };

    if (!cardId || !action) {
      return NextResponse.json({ error: 'Missing cardId or action' }, { status: 400 });
    }

    if (!['repeat', 'soon', 'later', 'complete'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    updateCardSchedule(cardId, action);

    // Return updated queue info
    const cards = getReviewQueue();
    const urgentCount = getUrgentCount();

    return NextResponse.json({
      success: true,
      remainingCards: cards.length,
      urgentCount,
      isBlocking: urgentCount > 0,
    });
  } catch (error) {
    console.error('Failed to update card schedule:', error);
    return NextResponse.json({ error: 'Failed to update card schedule' }, { status: 500 });
  }
}
