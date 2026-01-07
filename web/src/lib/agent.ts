import { getInsightsForPrompt } from './learner-model';

// Coding deck ID
export const CODING_DECK_ID = 1743361245682;

const CODING_AGENT_PROMPT = `You are a Pair Programmer - a collaborative coding tutor.

PERSONALITY:
- Friendly and encouraging, like a senior dev helping a junior
- Technical but accessible - you explain jargon when you use it
- You celebrate wins and normalize struggles ("this trips everyone up!")
- You ask clarifying questions before diving into explanations
- You're concise but thorough - no walls of text unless explaining a complex concept

MEMORY CONTEXT (what I know about this learner):
{learnerInsights}

BEHAVIOR:
1. When reviewing a card, check if you have relevant insights about this concept
2. If the learner struggled before, try a DIFFERENT explanation approach
3. Note new struggles or breakthroughs to remember for next time using the save_insight tool
4. Connect current concepts to things they've already mastered
5. Before revealing answers, ask what their intuition is

WHEN TO SAVE INSIGHTS:
- When learner reveals a misconception (insight_type: "misconception")
- When learner struggles with a concept (insight_type: "struggle")
- When learner demonstrates clear mastery (insight_type: "strength")
- When learner mentions how they prefer to learn (insight_type: "preference")

Be SPECIFIC in your observations. Instead of "you struggle with loops",
say "you tend to forget to handle the empty array edge case in loops".

Keep responses focused and conversational. You're a pair, not a lecturer.`;

export interface AgentConfig {
  systemPrompt: string;
  deckId: number;
  deckName: string;
}

// Create agent configuration for the Coding deck
export function createCodingAgentConfig(deckId: number): AgentConfig {
  // Load learner history into system prompt
  const insightText = getInsightsForPrompt(deckId, 15);

  const systemPrompt = CODING_AGENT_PROMPT.replace('{learnerInsights}', insightText);

  return {
    systemPrompt,
    deckId,
    deckName: 'Coding',
  };
}

// Tool definitions for Claude API
export const AGENT_TOOLS = [
  {
    name: 'save_insight',
    description: 'Save an observation about the learner to remember for future sessions. Use this when you notice patterns in their understanding, misconceptions, strengths, or learning preferences.',
    input_schema: {
      type: 'object' as const,
      properties: {
        concept: {
          type: 'string',
          description: 'The coding concept this insight relates to (e.g., "recursion", "async/await", "React hooks", "SQL joins")',
        },
        insight_type: {
          type: 'string',
          enum: ['struggle', 'strength', 'misconception', 'preference'],
          description: 'The type of insight: struggle (they find this hard), strength (they get this well), misconception (they have a wrong mental model), preference (how they like to learn)',
        },
        details: {
          type: 'string',
          description: 'Specific details about the observation. Be precise - not "struggles with loops" but "forgets to handle empty arrays in forEach"',
        },
      },
      required: ['concept', 'insight_type', 'details'],
    },
  },
];

// Check if a deck should have an agent
export function deckHasAgent(deckId: number): boolean {
  // For now, only Coding deck has an agent
  return deckId === CODING_DECK_ID;
}

// Get agent name for a deck
export function getAgentName(deckId: number): string | null {
  if (deckId === CODING_DECK_ID) {
    return 'Pair Programmer';
  }
  return null;
}
