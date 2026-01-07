// DeepInfra BGE-M3 Embedding Service + Chroma Vector Storage

import { ChromaClient, Collection } from 'chromadb';

const DEEPINFRA_API_URL = 'https://api.deepinfra.com/v1/inference/BAAI/bge-m3';
const COLLECTION_NAME = 'anki_cards';
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';

let chromaClient: ChromaClient | null = null;
let collection: Collection | null = null;

// Initialize Chroma client
export async function getChromaCollection(): Promise<Collection> {
  if (collection) return collection;

  chromaClient = new ChromaClient({
    path: CHROMA_URL,
  });

  // Get or create collection
  collection = await chromaClient.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { 'hnsw:space': 'cosine' },
  });

  return collection;
}

// Generate embeddings using DeepInfra BGE-M3
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPINFRA_API_KEY environment variable not set');
  }

  const response = await fetch(DEEPINFRA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      inputs: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepInfra API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.embeddings;
}

// Generate embedding for a single text
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}

// Strip HTML and clean text for embedding
export function cleanTextForEmbedding(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/\{\{c\d+::/g, '') // Remove Anki cloze markers
    .replace(/\}\}/g, '')       // Remove closing cloze markers
    .replace(/&nbsp;/g, ' ')    // Replace nbsp
    .replace(/&amp;/g, '&')     // Replace amp
    .replace(/&lt;/g, '<')      // Replace lt
    .replace(/&gt;/g, '>')      // Replace gt
    .replace(/\s+/g, ' ')       // Collapse whitespace
    .trim();
}

// Add a card to the vector store
export async function addCardEmbedding(
  cardId: number,
  noteId: number,
  front: string,
  back: string,
  deckName: string,
  tags: string
): Promise<void> {
  const col = await getChromaCollection();

  // Combine front and back for embedding
  const cleanFront = cleanTextForEmbedding(front);
  const cleanBack = cleanTextForEmbedding(back);
  const combinedText = `${cleanFront} ${cleanBack}`.trim();

  if (!combinedText) return; // Skip empty cards

  const embedding = await generateEmbedding(combinedText);

  await col.add({
    ids: [cardId.toString()],
    embeddings: [embedding],
    metadatas: [{
      noteId,
      deckName,
      tags,
      text: combinedText.substring(0, 500), // Store truncated text for reference
    }],
    documents: [combinedText],
  });
}

// Add multiple cards in batch
export async function addCardEmbeddingsBatch(
  cards: Array<{
    cardId: number;
    noteId: number;
    front: string;
    back: string;
    deckName: string;
    tags: string;
  }>
): Promise<{ processed: number; errors: number }> {
  const col = await getChromaCollection();

  // Prepare texts for batch embedding
  const validCards: typeof cards = [];
  const texts: string[] = [];

  for (const card of cards) {
    const cleanFront = cleanTextForEmbedding(card.front);
    const cleanBack = cleanTextForEmbedding(card.back);
    const combinedText = `${cleanFront} ${cleanBack}`.trim();

    if (combinedText) {
      validCards.push(card);
      texts.push(combinedText);
    }
  }

  if (texts.length === 0) {
    return { processed: 0, errors: 0 };
  }

  // Generate embeddings in batches of 100 (API limit)
  const BATCH_SIZE = 100;
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batchTexts = texts.slice(i, i + BATCH_SIZE);
    const batchCards = validCards.slice(i, i + BATCH_SIZE);

    try {
      const embeddings = await generateEmbeddings(batchTexts);

      await col.add({
        ids: batchCards.map(c => c.cardId.toString()),
        embeddings,
        metadatas: batchCards.map((c, idx) => ({
          noteId: c.noteId,
          deckName: c.deckName,
          tags: c.tags,
          text: batchTexts[idx].substring(0, 500),
        })),
        documents: batchTexts,
      });

      processed += batchCards.length;
    } catch (e) {
      console.error(`Error processing batch ${i}-${i + BATCH_SIZE}:`, e);
      errors += batchCards.length;
    }
  }

  return { processed, errors };
}

// Semantic search - find cards by meaning
export async function semanticSearch(
  query: string,
  limit: number = 10,
  deckFilter?: string
): Promise<Array<{ cardId: number; score: number; text: string; deckName: string }>> {
  const col = await getChromaCollection();

  const cleanQuery = cleanTextForEmbedding(query);
  const queryEmbedding = await generateEmbedding(cleanQuery);

  const whereClause = deckFilter ? { deckName: deckFilter } : undefined;

  const results = await col.query({
    queryEmbeddings: [queryEmbedding],
    nResults: limit,
    where: whereClause,
  });

  if (!results.ids[0]) return [];

  return results.ids[0].map((id, idx) => ({
    cardId: parseInt(id),
    score: results.distances ? 1 - (results.distances[0][idx] || 0) : 0, // Convert distance to similarity
    text: results.metadatas?.[0][idx]?.text as string || '',
    deckName: results.metadatas?.[0][idx]?.deckName as string || '',
  }));
}

// Find related cards - similar to a given card
export async function findRelatedCards(
  cardId: number,
  limit: number = 5
): Promise<Array<{ cardId: number; score: number; text: string; deckName: string }>> {
  const col = await getChromaCollection();

  // Get the card's embedding
  const existing = await col.get({
    ids: [cardId.toString()],
    include: ['embeddings'],
  });

  if (!existing.embeddings || existing.embeddings.length === 0) {
    return [];
  }

  // Query for similar cards (excluding itself)
  const results = await col.query({
    queryEmbeddings: [existing.embeddings[0] as number[]],
    nResults: limit + 1, // Get one extra since we'll filter out the card itself
  });

  if (!results.ids[0]) return [];

  return results.ids[0]
    .map((id, idx) => ({
      cardId: parseInt(id),
      score: results.distances ? 1 - (results.distances[0][idx] || 0) : 0,
      text: results.metadatas?.[0][idx]?.text as string || '',
      deckName: results.metadatas?.[0][idx]?.deckName as string || '',
    }))
    .filter(r => r.cardId !== cardId) // Exclude the card itself
    .slice(0, limit);
}

// Check for duplicates - find cards too similar to new content
export async function checkForDuplicates(
  front: string,
  back: string,
  threshold: number = 0.85 // 85% similarity threshold
): Promise<Array<{ cardId: number; score: number; text: string; deckName: string }>> {
  const cleanFront = cleanTextForEmbedding(front);
  const cleanBack = cleanTextForEmbedding(back);
  const combinedText = `${cleanFront} ${cleanBack}`.trim();

  if (!combinedText) return [];

  const col = await getChromaCollection();
  const queryEmbedding = await generateEmbedding(combinedText);

  const results = await col.query({
    queryEmbeddings: [queryEmbedding],
    nResults: 5,
  });

  if (!results.ids[0]) return [];

  return results.ids[0]
    .map((id, idx) => ({
      cardId: parseInt(id),
      score: results.distances ? 1 - (results.distances[0][idx] || 0) : 0,
      text: results.metadatas?.[0][idx]?.text as string || '',
      deckName: results.metadatas?.[0][idx]?.deckName as string || '',
    }))
    .filter(r => r.score >= threshold); // Only return if above threshold
}

// Delete a card's embedding
export async function deleteCardEmbedding(cardId: number): Promise<void> {
  const col = await getChromaCollection();
  await col.delete({ ids: [cardId.toString()] });
}

// Get embedding stats
export async function getEmbeddingStats(): Promise<{ count: number }> {
  const col = await getChromaCollection();
  const count = await col.count();
  return { count };
}
