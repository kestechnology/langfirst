import { NextRequest } from 'next/server';
import { TranslationMessage } from '@/types/translation';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: TranslationMessage[] };

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided to summarize.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const conversationTranscript = messages
      .map(
        (m, idx) =>
          `[${idx + 1}] ${m.speaker} (${m.detected_lang || 'Esan'}): "${m.transcription || ''}" -> English: "${m.translation}"`
      )
      .join('\n');

    const claudeKey = process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    const systemPrompt = `
You are an expert bilingual conversation analyst.
You will receive a conversation transcript originally spoken in Central Edo (Esan) code-mixed with Nigerian English, translated into English.

Generate a comprehensive, structured conversation report in clean Markdown formatting:
# Conversation Executive Report
### 1. Summary
(2-3 concise sentences summarizing what was discussed)

### 2. Key Discussion Points & Takeaways
(Bullet points of main ideas, agreements, or statements)

### 3. Action Items & Next Steps
(List of any agreed commitments, tasks, or follow-ups; or "None specified" if purely conversational)

### 4. Cultural & Linguistic Nuances
(Brief notes on notable Esan idioms or expressions used, such as erọlọ, ọya waigbe, etc.)
`.trim();

    // Call Claude
    if (claudeKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Here is the conversation transcript to analyze:\n\n${conversationTranscript}`,
            },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const report = data.content?.[0]?.text || '';
        return new Response(JSON.stringify({ report }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Fallback to OpenAI GPT-4o-mini
    if (openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Here is the conversation transcript to analyze:\n\n${conversationTranscript}`,
            },
          ],
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const report = data.choices?.[0]?.message?.content || '';
        return new Response(JSON.stringify({ report }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(
      JSON.stringify({ error: 'No active AI key available to generate report.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Report generation error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

