import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createCodingAgentConfig, AGENT_TOOLS, deckHasAgent } from '@/lib/agent';
import { saveInsight } from '@/lib/learner-model';

// Initialize Anthropic client
const anthropic = new Anthropic();

// In-memory session storage (messages persist within a browser session)
// In production, consider using Redis or database
interface Session {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  deckId: number;
  systemPrompt: string;
}

const sessions = new Map<string, Session>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId, deckId, cardContext } = body as {
      message: string;
      sessionId: string;
      deckId: number;
      cardContext?: { front: string; back: string };
    };

    if (!message || !sessionId || !deckId) {
      return NextResponse.json(
        { error: 'Missing required fields: message, sessionId, deckId' },
        { status: 400 }
      );
    }

    // Check if this deck has an agent
    if (!deckHasAgent(deckId)) {
      return NextResponse.json(
        { error: 'This deck does not have an agent configured' },
        { status: 400 }
      );
    }

    // Get or create session
    let session = sessions.get(sessionId);
    if (!session) {
      const agentConfig = createCodingAgentConfig(deckId);
      session = {
        messages: [],
        deckId,
        systemPrompt: agentConfig.systemPrompt,
      };
      sessions.set(sessionId, session);
    }

    // Build user message with optional card context
    let userMessage = message;
    if (cardContext) {
      userMessage = `[Currently reviewing card]\nFront: ${cardContext.front}\nBack: ${cardContext.back}\n\nUser: ${message}`;
    }

    // Add user message to session
    session.messages.push({ role: 'user', content: userMessage });

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: session.systemPrompt,
      messages: session.messages,
      tools: AGENT_TOOLS,
    });

    // Process response - handle both text and tool use
    let assistantMessage = '';
    const toolResults: Array<{ concept: string; type: string; details: string }> = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        assistantMessage += block.text;
      } else if (block.type === 'tool_use' && block.name === 'save_insight') {
        const input = block.input as {
          concept: string;
          insight_type: 'struggle' | 'strength' | 'misconception' | 'preference';
          details: string;
        };

        // Save the insight to database
        saveInsight(session.deckId, input.concept, input.insight_type, input.details);
        toolResults.push({
          concept: input.concept,
          type: input.insight_type,
          details: input.details,
        });
      }
    }

    // If Claude used tools, we need to continue the conversation
    // For simplicity, we just acknowledge tool use in this version
    if (response.stop_reason === 'tool_use') {
      // Add tool results and continue conversation
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      // Build tool result messages
      const toolResultContent = toolUseBlocks.map(block => ({
        type: 'tool_result' as const,
        tool_use_id: (block as Anthropic.ToolUseBlock).id,
        content: 'Insight saved successfully.',
      }));

      // Get continuation from Claude
      const continuation = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: session.systemPrompt,
        messages: [
          ...session.messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResultContent },
        ],
        tools: AGENT_TOOLS,
      });

      // Extract text from continuation
      for (const block of continuation.content) {
        if (block.type === 'text') {
          assistantMessage += block.text;
        }
      }
    }

    // Add assistant message to session
    if (assistantMessage) {
      session.messages.push({ role: 'assistant', content: assistantMessage });
    }

    // Keep session history manageable (last 20 messages)
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    return NextResponse.json({
      message: assistantMessage,
      sessionId,
      insightsSaved: toolResults.length,
      insights: toolResults,
    });
  } catch (error) {
    console.error('Agent chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}

// GET endpoint to check session status
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const session = sessions.get(sessionId);

  return NextResponse.json({
    exists: !!session,
    messageCount: session?.messages.length || 0,
  });
}
