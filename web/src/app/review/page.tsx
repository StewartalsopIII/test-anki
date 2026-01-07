'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Card {
  id: number;
  nid: number;
  did: number;
  note_flds: string;
  note_tags: string;
  deck_name: string;
  reps: number;
  due: number;
  ivl: number;
}

interface DeckWithCount {
  id: number;
  name: string;
  dueCount: number;
}

interface ReviewState {
  cards: Card[];
  urgentCount: number;
  isBlocking: boolean;
}

function parseFields(flds: string): string[] {
  return flds.split('\x1f');
}

// Rewrite image src paths to point to /media/ folder
function fixMediaPaths(html: string): string {
  // Replace src="filename" with src="/media/filename"
  // But don't modify URLs that already have http/https or start with /
  return html.replace(
    /<img\s+([^>]*?)src=["'](?!https?:\/\/)(?!\/)([^"']+)["']/gi,
    '<img $1src="/media/$2"'
  );
}

export default function ReviewPage() {
  const [reviewState, setReviewState] = useState<ReviewState>({
    cards: [],
    urgentCount: 0,
    isBlocking: false,
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);

  // Deck selection state
  const [decks, setDecks] = useState<DeckWithCount[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [urgentDeckId, setUrgentDeckId] = useState<number | null>(null);

  // Fetch decks with due counts
  const fetchDecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/review?listDecks=true');
      const data = await res.json();
      setDecks(data.decks || []);
      setUrgentDeckId(data.urgentDeckId || null);
    } catch (error) {
      console.error('Failed to fetch decks:', error);
    }
    setLoading(false);
  }, []);

  const fetchQueue = useCallback(async (deckId?: number) => {
    setLoading(true);
    try {
      const url = deckId ? `/api/review?deckId=${deckId}` : '/api/review';
      const res = await fetch(url);
      const data = await res.json();
      setReviewState({
        cards: data.cards || [],
        urgentCount: data.urgentCount || 0,
        isBlocking: data.isBlocking || false,
      });
      if (data.cards.length === 0) {
        setSessionComplete(true);
      }
    } catch (error) {
      console.error('Failed to fetch review queue:', error);
    }
    setLoading(false);
  }, []);

  // On mount, fetch decks (not cards)
  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  // When a deck is selected, fetch its cards
  const handleSelectDeck = (deckId: number) => {
    setSelectedDeckId(deckId);
    setSessionComplete(false);
    setReviewedCount(0);
    setCurrentIndex(0);
    fetchQueue(deckId);
  };

  // Go back to deck selection
  const handleBackToDecks = () => {
    setSelectedDeckId(null);
    setSessionComplete(false);
    setReviewedCount(0);
    setCurrentIndex(0);
    setReviewState({ cards: [], urgentCount: 0, isBlocking: false });
    fetchDecks();
  };

  const currentCard = reviewState.cards[currentIndex];

  async function handleAction(action: 'repeat' | 'soon' | 'later' | 'complete') {
    if (!currentCard) return;

    try {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: currentCard.id, action }),
      });

      setReviewedCount((prev) => prev + 1);

      // Remove the card from local state or move to end if repeat
      if (action === 'repeat') {
        // Move to end of queue
        setReviewState((prev) => ({
          ...prev,
          cards: [...prev.cards.slice(0, currentIndex), ...prev.cards.slice(currentIndex + 1), currentCard],
        }));
      } else {
        // Remove from queue
        setReviewState((prev) => ({
          ...prev,
          cards: prev.cards.filter((_, i) => i !== currentIndex),
          urgentCount: currentCard.deck_name === 'High importance or urgence tasks'
            ? prev.urgentCount - 1
            : prev.urgentCount,
        }));
      }

      setShowBack(false);

      // Check if we need to fetch more cards (urgent cards cleared)
      if (reviewState.isBlocking && action !== 'repeat') {
        const remainingUrgent = reviewState.cards.filter(
          (c, i) => i !== currentIndex && c.deck_name === 'High importance or urgence tasks'
        ).length;
        if (remainingUrgent === 0) {
          // Urgent queue cleared, fetch all cards
          await fetchQueue();
        }
      }

      // Keep index valid
      if (currentIndex >= reviewState.cards.length - 1) {
        setCurrentIndex(Math.max(0, reviewState.cards.length - 2));
      }

      // Check if session is done
      if (reviewState.cards.length <= 1 && action !== 'repeat') {
        setSessionComplete(true);
      }
    } catch (error) {
      console.error('Failed to record review:', error);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (sessionComplete || loading) return;

      if (!showBack) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setShowBack(true);
        }
      } else {
        switch (e.key) {
          case '1':
          case 'r':
            handleAction('repeat');
            break;
          case '2':
          case 's':
            handleAction('soon');
            break;
          case '3':
          case 'l':
            handleAction('later');
            break;
          case '4':
          case 'd':
          case 'c':
            handleAction('complete');
            break;
          case ' ':
          case 'Enter':
            e.preventDefault();
            handleAction('soon'); // Default action
            break;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showBack, currentCard, sessionComplete, loading]);

  // Deck selection screen
  if (selectedDeckId === null) {
    const totalDue = decks.reduce((sum, d) => sum + d.dueCount, 0);

    return (
      <div className="min-h-screen bg-gray-900 text-gray-100">
        <header className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            ← Back to Cards
          </Link>
          <div className="text-sm text-gray-400">
            {totalDue} cards due today
          </div>
        </header>

        <main className="p-8 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Choose a Deck to Review</h1>

          {decks.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-5xl mb-4">✓</div>
              <p className="text-xl">No cards due today!</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {decks.map((deck) => {
                const isUrgent = deck.id === urgentDeckId;
                return (
                  <button
                    key={deck.id}
                    onClick={() => handleSelectDeck(deck.id)}
                    className={`w-full p-4 rounded-xl text-left transition-all hover:scale-[1.01] ${
                      isUrgent
                        ? 'bg-amber-900/30 border-2 border-amber-600 hover:bg-amber-900/50'
                        : 'bg-gray-800 border border-gray-700 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isUrgent && (
                          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                        )}
                        <span className={`font-medium ${isUrgent ? 'text-amber-200' : 'text-white'}`}>
                          {deck.name}
                        </span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        isUrgent
                          ? 'bg-amber-600 text-white'
                          : 'bg-gray-600 text-gray-200'
                      }`}>
                        {deck.dueCount} due
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Review All button */}
          {decks.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-700">
              <button
                onClick={() => {
                  setSelectedDeckId(-1); // -1 means "all decks"
                  fetchQueue();
                }}
                className="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-lg font-medium"
              >
                Review All ({totalDue} cards)
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading review queue...</div>
      </div>
    );
  }

  if (sessionComplete || reviewState.cards.length === 0) {
    return (
      <div className="h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-6">✓</div>
          <h1 className="text-3xl font-bold mb-4">Review Complete!</h1>
          <p className="text-xl text-gray-400 mb-2">You reviewed {reviewedCount} cards</p>
          <div className="flex gap-4 justify-center mt-8">
            <button
              onClick={handleBackToDecks}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg"
            >
              Choose Another Deck
            </button>
            <Link
              href="/"
              className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-lg"
            >
              Browse Cards
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const fields = parseFields(currentCard.note_flds);
  const front = fixMediaPaths(fields[0] || '');
  const back = fixMediaPaths(fields[1] || '');
  const isUrgent = currentCard.deck_name === 'High importance or urgence tasks';

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <button
          onClick={handleBackToDecks}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ← Back to Decks
        </button>
        <div className="flex items-center gap-6">
          {reviewState.isBlocking && (
            <div className="flex items-center gap-2 text-amber-400">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              <span className="text-sm font-medium">
                {reviewState.urgentCount} urgent remaining
              </span>
            </div>
          )}
          <div className="text-sm text-gray-400">
            {currentIndex + 1} of {reviewState.cards.length} cards
          </div>
          <div className="text-sm text-gray-500">
            Reviewed: {reviewedCount}
          </div>
        </div>
      </header>

      {/* Card Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Deck Bubbles - always visible around the card */}
        <div className="mb-6 flex flex-wrap justify-center gap-2 max-w-4xl">
          {decks.map((deck) => {
            const isSelected = deck.id === selectedDeckId || deck.id === currentCard.did;
            const isDeckUrgent = deck.id === urgentDeckId;
            return (
              <button
                key={deck.id}
                onClick={() => handleSelectDeck(deck.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 scale-105'
                    : isDeckUrgent
                    ? 'bg-amber-900/40 text-amber-300 border border-amber-600 hover:bg-amber-900/60'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {deck.name.length > 20 ? deck.name.substring(0, 18) + '...' : deck.name}
                <span className={`ml-1.5 ${isSelected ? 'text-blue-200' : 'opacity-60'}`}>
                  {deck.dueCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Card */}
        <div
          className={`w-full max-w-3xl bg-gray-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
            isUrgent ? 'ring-2 ring-amber-500/50' : ''
          }`}
        >
          {/* Front */}
          <div className="p-8 min-h-[200px]">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-4">Front</div>
            <div
              className="text-xl text-white prose prose-invert prose-lg max-w-none"
              dangerouslySetInnerHTML={{ __html: front }}
            />
          </div>

          {/* Back (shown on click/space) */}
          {showBack && (
            <>
              <div className="border-t border-gray-700" />
              <div className="p-8 bg-gray-800/50 min-h-[150px]">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-4">Back</div>
                <div
                  className="text-lg text-gray-200 prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: back || '<em class="text-gray-500">No back content</em>' }}
                />
              </div>
            </>
          )}

          {/* Tags */}
          {currentCard.note_tags && (
            <div className="px-8 pb-4">
              <div className="flex flex-wrap gap-2">
                {currentCard.note_tags.split(' ').filter(Boolean).map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-gray-700/50 text-gray-400 rounded text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Area */}
        <div className="mt-8 w-full max-w-3xl">
          {!showBack ? (
            <button
              onClick={() => setShowBack(true)}
              className="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-lg font-medium"
            >
              Show Answer
              <span className="ml-2 text-blue-300 text-sm">(Space)</span>
            </button>
          ) : (
            <div className="space-y-4">
              {/* Primary Actions - 3 buttons */}
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => handleAction('repeat')}
                  className="py-4 bg-red-600/80 text-white rounded-xl hover:bg-red-600 transition-colors text-lg font-medium flex flex-col items-center"
                >
                  <span>Repeat</span>
                  <span className="text-red-300 text-xs mt-1">Again now (1)</span>
                </button>
                <button
                  onClick={() => handleAction('soon')}
                  className="py-4 bg-amber-600/80 text-white rounded-xl hover:bg-amber-600 transition-colors text-lg font-medium flex flex-col items-center"
                >
                  <span>Soon</span>
                  <span className="text-amber-300 text-xs mt-1">Tomorrow (2)</span>
                </button>
                <button
                  onClick={() => handleAction('later')}
                  className="py-4 bg-green-600/80 text-white rounded-xl hover:bg-green-600 transition-colors text-lg font-medium flex flex-col items-center"
                >
                  <span>Later</span>
                  <span className="text-green-300 text-xs mt-1">7 days (3)</span>
                </button>
              </div>

              {/* Complete/Done Action */}
              <button
                onClick={() => handleAction('complete')}
                className="w-full py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <span>Mark Complete</span>
                <span className="text-gray-500 text-sm">(removes from review)</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Keyboard Hints */}
      <footer className="p-4 bg-gray-800/50 border-t border-gray-700">
        <div className="flex justify-center gap-8 text-xs text-gray-500">
          <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Space</kbd> Show / Default</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded">1</kbd> Repeat</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded">2</kbd> Soon</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded">3</kbd> Later</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded">4</kbd> Complete</span>
        </div>
      </footer>
    </div>
  );
}
