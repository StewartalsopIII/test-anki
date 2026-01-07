import { NextRequest, NextResponse } from 'next/server';
import {
  semanticSearch,
  findRelatedCards,
  checkForDuplicates,
  addCardEmbeddingsBatch,
  deleteCardEmbedding,
  getEmbeddingStats,
} from '@/lib/embeddings';
import { getAllCards } from '@/lib/db';

// GET /api/embeddings - Semantic search or get stats
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  try {
    // Get embedding stats
    if (action === 'stats') {
      const stats = await getEmbeddingStats();
      return NextResponse.json(stats);
    }

    // Semantic search
    if (action === 'search') {
      const query = searchParams.get('q');
      if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 });
      }
      const limit = parseInt(searchParams.get('limit') || '10');
      const deck = searchParams.get('deck') || undefined;

      const results = await semanticSearch(query, limit, deck);
      return NextResponse.json({ results });
    }

    // Find related cards
    if (action === 'related') {
      const cardId = searchParams.get('cardId');
      if (!cardId) {
        return NextResponse.json({ error: 'cardId required' }, { status: 400 });
      }
      const limit = parseInt(searchParams.get('limit') || '5');

      const results = await findRelatedCards(parseInt(cardId), limit);
      return NextResponse.json({ results });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Embeddings GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/embeddings - Generate embeddings or check duplicates
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Check for duplicates before adding a new card
    if (action === 'check-duplicates') {
      const { front, back, threshold } = body;
      if (!front && !back) {
        return NextResponse.json({ error: 'front or back required' }, { status: 400 });
      }
      const duplicates = await checkForDuplicates(front || '', back || '', threshold);
      return NextResponse.json({ duplicates, hasDuplicates: duplicates.length > 0 });
    }

    // Generate embeddings for all cards (one-time setup)
    if (action === 'generate-all') {
      const cards = getAllCards();

      // Parse fields and prepare for embedding
      const cardsForEmbedding = cards.map(card => {
        const fields = card.note_flds.split('\x1f');
        return {
          cardId: card.id,
          noteId: card.nid,
          front: fields[0] || '',
          back: fields[1] || '',
          deckName: card.deck_name,
          tags: card.note_tags,
        };
      });

      const result = await addCardEmbeddingsBatch(cardsForEmbedding);
      return NextResponse.json({
        success: true,
        ...result,
        total: cards.length,
      });
    }

    // Add embedding for a single card
    if (action === 'add') {
      const { cardId, noteId, front, back, deckName, tags } = body;
      await addCardEmbeddingsBatch([{ cardId, noteId, front, back, deckName, tags }]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Embeddings POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/embeddings - Delete a card's embedding
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cardId = searchParams.get('cardId');

    if (!cardId) {
      return NextResponse.json({ error: 'cardId required' }, { status: 400 });
    }

    await deleteCardEmbedding(parseInt(cardId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Embeddings DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
