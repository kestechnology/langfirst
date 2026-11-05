import { NextRequest } from 'next/server';
import { translateAudioChunk } from '@/lib/gemini/translator';
import { checkRateLimit } from '@/lib/ratelimit';

export const maxDuration = 30; // Max execution timeout

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting check (Stage 12)
    const rateLimit = await checkRateLimit(req);
    if (!rateLimit.success) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded. Please wait a moment before sending more audio.',
          remaining: 0,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        }
      );
    }

    const body = await req.json();
    const { audio, mimeType, previousContext, speaker } = body;

    if (!audio) {
      return new Response(JSON.stringify({ error: 'Audio chunk data is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Set up Server-Sent Events (SSE) stream via ReadableStream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Emit initial processing heartbeat event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ status: 'processing', speaker: speaker || 'Speaker A' })}\n\n`
            )
          );

          // Process direct audio translation via Gemini 2.0 Flash
          const result = await translateAudioChunk({
            audioBase64: audio,
            mimeType: mimeType || 'audio/wav',
            previousContext: Array.isArray(previousContext) ? previousContext : [],
            speaker: speaker || 'Speaker A',
          });

          // Emit final translation chunk to client
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(result)}\n\n`)
          );

          // Close stream cleanly
          controller.close();
        } catch (err: unknown) {
          const errMessage = err instanceof Error ? err.message : 'Streaming execution failed';
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errMessage, is_final: true })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
