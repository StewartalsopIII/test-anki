'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Deck {
  id: number;
  name: string;
}

interface Card {
  id: number;
  nid: number;
  did: number;
  note_flds: string;
  note_tags: string;
  deck_name: string;
  reps: number;
  lapses: number;
}

function parseFields(flds: string): string[] {
  return flds.split('\x1f');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

// Rewrite image src paths to point to /media/ folder
function fixMediaPaths(html: string): string {
  return html.replace(
    /<img\s+([^>]*?)src=["'](?!https?:\/\/)(?!\/)([^"']+)["']/gi,
    '<img $1src="/media/$2"'
  );
}

export default function Home() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editTags, setEditTags] = useState('');
  const [showAddCard, setShowAddCard] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newTags, setNewTags] = useState('');
  const [semanticSearch, setSemanticSearch] = useState(false);
  const [relatedCards, setRelatedCards] = useState<Array<{ cardId: number; score: number; text: string; deckName: string }>>([]);

  useEffect(() => {
    fetchDecks();
    fetchCards();
  }, []);

  async function fetchDecks() {
    const res = await fetch('/api/decks');
    const data = await res.json();
    setDecks(data);
  }

  async function fetchCards(deckId?: number, query?: string) {
    setLoading(true);
    let url = '/api/cards';
    if (query) {
      url += `?q=${encodeURIComponent(query)}`;
    } else if (deckId) {
      url += `?deckId=${deckId}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    setCards(data);
    setLoading(false);
  }

  function handleDeckSelect(deckId: number | null) {
    setSelectedDeck(deckId);
    setSelectedCard(null);
    setSearchQuery('');
    if (deckId) {
      fetchCards(deckId);
    } else {
      fetchCards();
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSelectedDeck(null);
      if (semanticSearch) {
        // Use semantic search
        setLoading(true);
        try {
          const res = await fetch(`/api/embeddings?action=search&q=${encodeURIComponent(searchQuery)}&limit=50`);
          const data = await res.json();
          if (data.results) {
            // Fetch full card data for the results
            const cardIds = data.results.map((r: { cardId: number }) => r.cardId);
            const allCardsRes = await fetch('/api/cards');
            const allCards = await allCardsRes.json();
            const matchedCards = allCards.filter((c: Card) => cardIds.includes(c.id));
            // Sort by semantic score
            matchedCards.sort((a: Card, b: Card) => {
              const scoreA = data.results.find((r: { cardId: number }) => r.cardId === a.id)?.score || 0;
              const scoreB = data.results.find((r: { cardId: number }) => r.cardId === b.id)?.score || 0;
              return scoreB - scoreA;
            });
            setCards(matchedCards);
          }
        } catch (error) {
          console.error('Semantic search failed:', error);
        }
        setLoading(false);
      } else {
        fetchCards(undefined, searchQuery);
      }
    }
  }

  async function handleCardSelect(card: Card) {
    setSelectedCard(card);
    const fields = parseFields(card.note_flds);
    setEditFront(fields[0] || '');
    setEditBack(fields[1] || '');
    setEditTags(card.note_tags);
    setEditMode(false);
    setRelatedCards([]);

    // Fetch related cards
    try {
      const res = await fetch(`/api/embeddings?action=related&cardId=${card.id}&limit=5`);
      const data = await res.json();
      if (data.results) {
        setRelatedCards(data.results);
      }
    } catch (error) {
      console.error('Failed to fetch related cards:', error);
    }
  }

  async function handleSaveEdit() {
    if (!selectedCard) return;
    const flds = `${editFront}\x1f${editBack}`;
    await fetch('/api/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteId: selectedCard.nid,
        flds,
        tags: editTags,
      }),
    });
    setEditMode(false);
    if (selectedDeck) {
      fetchCards(selectedDeck);
    } else if (searchQuery) {
      fetchCards(undefined, searchQuery);
    } else {
      fetchCards();
    }
  }

  async function handleDeleteCard() {
    if (!selectedCard) return;
    if (!confirm('Delete this card?')) return;
    await fetch(`/api/cards?id=${selectedCard.id}`, { method: 'DELETE' });
    setSelectedCard(null);
    if (selectedDeck) {
      fetchCards(selectedDeck);
    } else if (searchQuery) {
      fetchCards(undefined, searchQuery);
    } else {
      fetchCards();
    }
  }

  async function handleAddCard() {
    if (!selectedDeck) {
      alert('Select a deck first');
      return;
    }
    await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: selectedDeck,
        front: newFront,
        back: newBack,
        tags: newTags,
      }),
    });
    setShowAddCard(false);
    setNewFront('');
    setNewBack('');
    setNewTags('');
    fetchCards(selectedDeck);
  }

  async function handleMoveToDeck(deckId: number) {
    if (!selectedCard) return;
    await fetch('/api/cards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: selectedCard.id,
        deckId,
      }),
    });
    if (selectedDeck) {
      fetchCards(selectedDeck);
    } else {
      fetchCards();
    }
    setSelectedCard(null);
  }

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex">
      {/* Fixed Sidebar */}
      <aside className="w-64 min-w-64 bg-gray-800 border-r border-gray-700 flex flex-col h-screen">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">Anki Cards</h1>
          <p className="text-sm text-gray-400 mt-1">{cards.length} cards</p>
          <Link
            href="/review"
            className="mt-3 w-full block text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Start Review
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <button
              onClick={() => handleDeckSelect(null)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                selectedDeck === null
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              All Cards
            </button>
          </div>

          <div className="px-2 pb-4">
            <h2 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Decks ({decks.length})
            </h2>
            <div className="space-y-1">
              {decks.map((deck) => (
                <button
                  key={deck.id}
                  onClick={() => handleDeckSelect(deck.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg truncate transition-colors ${
                    selectedDeck === deck.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  title={deck.name}
                >
                  {deck.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Search Bar */}
        <header className="p-4 bg-gray-800 border-b border-gray-700 flex gap-3">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2 items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={semanticSearch ? "Semantic search (by meaning)..." : "Keyword search..."}
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={semanticSearch}
                onChange={(e) => setSemanticSearch(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span>AI</span>
            </label>
            <button
              type="submit"
              className={`px-5 py-2 text-white rounded-lg transition-colors font-medium ${
                semanticSearch ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Search
            </button>
          </form>
          {selectedDeck && (
            <button
              onClick={() => setShowAddCard(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              + Add Card
            </button>
          )}
        </header>

        {/* Cards Grid */}
        <div className="flex-1 flex min-h-0">
          {/* Card List */}
          <section className="w-1/2 min-w-80 border-r border-gray-700 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-gray-400 text-center">Loading cards...</div>
              ) : cards.length === 0 ? (
                <div className="p-6 text-gray-400 text-center">No cards found</div>
              ) : (
                <div className="divide-y divide-gray-700">
                  {cards.map((card) => {
                    const fields = parseFields(card.note_flds);
                    const isSelected = selectedCard?.id === card.id;
                    return (
                      <button
                        key={card.id}
                        onClick={() => handleCardSelect(card)}
                        className={`w-full text-left p-4 transition-colors ${
                          isSelected
                            ? 'bg-blue-900/50 border-l-4 border-blue-500'
                            : 'hover:bg-gray-800/50 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="font-medium text-white truncate">
                          {stripHtml(fields[0] || 'No content')}
                        </div>
                        <div className="text-sm text-gray-400 truncate mt-1">
                          {stripHtml(fields[1] || '')}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <span className="px-2 py-0.5 bg-gray-700 rounded">{card.deck_name}</span>
                          <span>{card.reps} reviews</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Card Detail */}
          <section className="w-1/2 min-w-80 bg-gray-800 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {selectedCard ? (
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold text-white">Card Details</h2>
                    <div className="flex gap-2">
                      {editMode ? (
                        <>
                          <button
                            onClick={handleSaveEdit}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditMode(false)}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditMode(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={handleDeleteCard}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {editMode ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Front</label>
                        <textarea
                          value={editFront}
                          onChange={(e) => setEditFront(e.target.value)}
                          className="w-full h-32 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Back</label>
                        <textarea
                          value={editBack}
                          onChange={(e) => setEditBack(e.target.value)}
                          className="w-full h-32 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Tags</label>
                        <input
                          type="text"
                          value={editTags}
                          onChange={(e) => setEditTags(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-2">Front</h3>
                        <div
                          className="p-4 bg-gray-700 rounded-lg text-white prose prose-invert prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: fixMediaPaths(parseFields(selectedCard.note_flds)[0] || '<em>Empty</em>') }}
                        />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-2">Back</h3>
                        <div
                          className="p-4 bg-gray-700 rounded-lg text-white prose prose-invert prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: fixMediaPaths(parseFields(selectedCard.note_flds)[1] || '<em>Empty</em>') }}
                        />
                      </div>
                      {selectedCard.note_tags && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-400 mb-2">Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {selectedCard.note_tags.split(' ').filter(Boolean).map((tag, i) => (
                              <span key={i} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-2">Move to Deck</h3>
                        <select
                          value={selectedCard.did}
                          onChange={(e) => handleMoveToDeck(parseInt(e.target.value))}
                          className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {decks.map((deck) => (
                            <option key={deck.id} value={deck.id}>
                              {deck.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="pt-4 border-t border-gray-700 text-sm text-gray-400 space-y-1">
                        <p><span className="text-gray-500">Deck:</span> {selectedCard.deck_name}</p>
                        <p><span className="text-gray-500">Reviews:</span> {selectedCard.reps}</p>
                        <p><span className="text-gray-500">Lapses:</span> {selectedCard.lapses}</p>
                      </div>

                      {/* Related Cards */}
                      {relatedCards.length > 0 && (
                        <div className="pt-4 border-t border-gray-700">
                          <h3 className="text-sm font-medium text-gray-400 mb-3">Related Cards</h3>
                          <div className="space-y-2">
                            {relatedCards.map((related) => (
                              <button
                                key={related.cardId}
                                onClick={() => {
                                  const card = cards.find(c => c.id === related.cardId);
                                  if (card) handleCardSelect(card);
                                }}
                                className="w-full text-left p-2 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                              >
                                <div className="text-xs text-purple-400 mb-1">
                                  {(related.score * 100).toFixed(0)}% similar
                                </div>
                                <div className="text-sm text-gray-300 line-clamp-2">
                                  {related.text.substring(0, 100)}...
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {related.deckName}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>Select a card to view details</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg mx-4 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Add New Card</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Front</label>
                <textarea
                  value={newFront}
                  onChange={(e) => setNewFront(e.target.value)}
                  className="w-full h-24 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Question or prompt..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Back</label>
                <textarea
                  value={newBack}
                  onChange={(e) => setNewBack(e.target.value)}
                  className="w-full h-24 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Answer..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tags (space separated)</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="tag1 tag2 tag3"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddCard(false)}
                className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCard}
                className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Add Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
