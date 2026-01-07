import { getDb } from './db';

export interface LearnerInsight {
  id: number;
  deck_id: number;
  concept: string;
  insight_type: 'struggle' | 'strength' | 'misconception' | 'preference';
  details: string;
  created_at: string;
  last_referenced: string;
}

// Save a new insight about the learner
export function saveInsight(
  deckId: number,
  concept: string,
  insightType: LearnerInsight['insight_type'],
  details: string
): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO learner_insights (deck_id, concept, insight_type, details)
    VALUES (?, ?, ?, ?)
  `).run(deckId, concept, insightType, details);

  return Number(result.lastInsertRowid);
}

// Get recent insights for a deck
export function getInsights(deckId: number, limit: number = 10): LearnerInsight[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM learner_insights
    WHERE deck_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(deckId, limit) as LearnerInsight[];
}

// Get insights for a specific concept
export function getInsightsByConcept(deckId: number, concept: string): LearnerInsight[] {
  const db = getDb();
  // Use LIKE for fuzzy matching on concept
  return db.prepare(`
    SELECT * FROM learner_insights
    WHERE deck_id = ? AND concept LIKE ?
    ORDER BY created_at DESC
  `).all(deckId, `%${concept}%`) as LearnerInsight[];
}

// Update last_referenced timestamp when an insight is used
export function markInsightReferenced(insightId: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE learner_insights
    SET last_referenced = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(insightId);
}

// Get all insights formatted for the agent's system prompt
export function getInsightsForPrompt(deckId: number, limit: number = 10): string {
  const insights = getInsights(deckId, limit);

  if (insights.length === 0) {
    return 'No previous insights yet - this is a fresh start!';
  }

  // Group by type for better readability
  const struggles = insights.filter(i => i.insight_type === 'struggle');
  const strengths = insights.filter(i => i.insight_type === 'strength');
  const misconceptions = insights.filter(i => i.insight_type === 'misconception');
  const preferences = insights.filter(i => i.insight_type === 'preference');

  const sections: string[] = [];

  if (struggles.length > 0) {
    sections.push('STRUGGLES:\n' + struggles.map(i => `- ${i.concept}: ${i.details}`).join('\n'));
  }
  if (strengths.length > 0) {
    sections.push('STRENGTHS:\n' + strengths.map(i => `- ${i.concept}: ${i.details}`).join('\n'));
  }
  if (misconceptions.length > 0) {
    sections.push('MISCONCEPTIONS:\n' + misconceptions.map(i => `- ${i.concept}: ${i.details}`).join('\n'));
  }
  if (preferences.length > 0) {
    sections.push('LEARNING PREFERENCES:\n' + preferences.map(i => `- ${i.concept}: ${i.details}`).join('\n'));
  }

  return sections.join('\n\n');
}

// Delete old insights (cleanup)
export function pruneOldInsights(deckId: number, keepCount: number = 50): void {
  const db = getDb();
  db.prepare(`
    DELETE FROM learner_insights
    WHERE deck_id = ? AND id NOT IN (
      SELECT id FROM learner_insights
      WHERE deck_id = ?
      ORDER BY last_referenced DESC
      LIMIT ?
    )
  `).run(deckId, deckId, keepCount);
}
