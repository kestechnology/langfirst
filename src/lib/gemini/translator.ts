import {
  ESAN_TRANSLATION_SYSTEM_PROMPT,
  buildTranslationPrompt,
} from './prompts';
import { StreamChunkResponse } from '@/types/translation';

export interface TranslateAudioChunkParams {
  audioBase64: string;
  mimeType?: string;
  previousContext?: string[];
  speaker?: string;
}

/**
 * Universal Multi-Provider Audio Translator.
 * Automatically utilizes available API keys:
 * 1. OpenAI (Whisper + Claude or Whisper + GPT-4o-mini)
 * 2. Google Gemini (gemini-2.0-flash)
 */
export async function translateAudioChunk({
  audioBase64,
  mimeType = 'audio/wav',
  previousContext = [],
  speaker = 'Speaker A',
}: TranslateAudioChunkParams): Promise<StreamChunkResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINIKEY;

  // If OpenAI key is present, use Whisper for acoustic transcription + Claude or GPT-4o-mini for dialect translation
  if (openaiKey) {
    return translateWithWhisperPipeline({
      audioBase64,
      openaiKey,
      claudeKey,
      previousContext,
      speaker,
    });
  }

  // If Gemini key is present
  if (geminiKey && !geminiKey.startsWith('AQ.')) {
    return translateWithGemini({
      audioBase64,
      mimeType,
      apiKey: geminiKey,
      previousContext,
      speaker,
    });
  }

  return {
    speaker,
    detected_lang: 'Error',
    transcription: '',
    translation:
      'Please ensure OPENAI_API_KEY or GEMINI_API_KEY is configured in .env.local',
    is_final: true,
    error: 'NO_ACTIVE_KEY',
  };
}

/**
 * Pipeline: OpenAI Whisper transcribes acoustic audio -> Claude (or GPT-4o-mini)
 * applies Esan linguistic dictionary and formats into structured English JSON.
 */
async function translateWithWhisperPipeline({
  audioBase64,
  openaiKey,
  claudeKey,
  previousContext = [],
  speaker = 'Speaker A',
}: {
  audioBase64: string;
  openaiKey: string;
  claudeKey?: string;
  previousContext?: string[];
  speaker?: string;
}): Promise<StreamChunkResponse> {
  try {
    // Step 1: Transcribe audio slice using OpenAI Whisper
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.warn('[Whisper] Transcription error:', err);
      // Fallback: try whisper direct translation endpoint
      return translateWithWhisperDirect({ blob, openaiKey, speaker });
    }

    const whisperData = await whisperRes.json();
    const rawTranscript = whisperData.text?.trim() || '';

    // If completely silent or empty text, return early
    if (!rawTranscript || rawTranscript.length < 2) {
      return {
        speaker,
        detected_lang: 'None',
        transcription: '',
        translation: '',
        is_final: true,
      };
    }

    // Step 2: Pass acoustic transcript through Claude (if available) or GPT-4o-mini
    if (claudeKey) {
      return refineWithClaude({
        rawTranscript,
        claudeKey,
        previousContext,
        speaker,
      });
    } else {
      return refineWithGPT4oMini({
        rawTranscript,
        openaiKey,
        previousContext,
        speaker,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Whisper pipeline error';
    return {
      speaker,
      detected_lang: 'Error',
      transcription: '',
      translation: `Audio processing error: ${msg}`,
      is_final: true,
      error: msg,
    };
  }
}

/**
 * Refines transcription with Anthropic Claude applying Esan phonetic rules & formatting
 */
async function refineWithClaude({
  rawTranscript,
  claudeKey,
  previousContext = [],
  speaker = 'Speaker A',
}: {
  rawTranscript: string;
  claudeKey: string;
  previousContext?: string[];
  speaker?: string;
}): Promise<StreamChunkResponse> {
  try {
    const promptText = buildTranslationPrompt(previousContext);
    const userMessage = `${promptText}\n\nSpoken acoustic transcript to translate:\n"${rawTranscript}"`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: ESAN_TRANSLATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[Claude] Refinement error, returning raw transcript:', err);
      return {
        speaker,
        detected_lang: 'Detected Speech',
        transcription: rawTranscript,
        translation: rawTranscript,
        is_final: true,
      };
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || '';
    const cleanedJson = content.replace(/```json/g, '').replace(/```/g, '').trim();

    // Find JSON boundary if extra text was included
    const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        speaker: parsed.speaker || speaker,
        detected_lang: parsed.detected_lang || 'Esan',
        transcription: parsed.transcription || rawTranscript,
        translation: parsed.translation || rawTranscript,
        is_final: parsed.is_final ?? true,
      };
    }

    return {
      speaker,
      detected_lang: 'Esan',
      transcription: rawTranscript,
      translation: content,
      is_final: true,
    };
  } catch (err) {
    return {
      speaker,
      detected_lang: 'Esan',
      transcription: rawTranscript,
      translation: rawTranscript,
      is_final: true,
    };
  }
}

/**
 * Refines transcription with OpenAI GPT-4o-mini
 */
async function refineWithGPT4oMini({
  rawTranscript,
  openaiKey,
  previousContext = [],
  speaker = 'Speaker A',
}: {
  rawTranscript: string;
  openaiKey: string;
  previousContext?: string[];
  speaker?: string;
}): Promise<StreamChunkResponse> {
  try {
    const promptText = buildTranslationPrompt(previousContext);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ESAN_TRANSLATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `${promptText}\n\nSpoken acoustic transcript to translate:\n"${rawTranscript}"`,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      return {
        speaker,
        detected_lang: 'Speech',
        transcription: rawTranscript,
        translation: rawTranscript,
        is_final: true,
      };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);

    return {
      speaker: parsed.speaker || speaker,
      detected_lang: parsed.detected_lang || 'Esan',
      transcription: parsed.transcription || rawTranscript,
      translation: parsed.translation || rawTranscript,
      is_final: parsed.is_final ?? true,
    };
  } catch {
    return {
      speaker,
      detected_lang: 'Speech',
      transcription: rawTranscript,
      translation: rawTranscript,
      is_final: true,
    };
  }
}

/**
 * Direct Whisper translation fallback
 */
async function translateWithWhisperDirect({
  blob,
  openaiKey,
  speaker = 'Speaker A',
}: {
  blob: Blob;
  openaiKey: string;
  speaker?: string;
}): Promise<StreamChunkResponse> {
  const formData = new FormData();
  formData.append('file', blob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/translations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      speaker,
      detected_lang: 'Error',
      transcription: '',
      translation: `Whisper error: ${errText}`,
      is_final: true,
      error: errText,
    };
  }

  const data = await res.json();
  return {
    speaker,
    detected_lang: 'Esan / English',
    transcription: '',
    translation: data.text || '',
    is_final: true,
  };
}

/**
 * Google Gemini 2.0 Flash Direct Translation
 */
async function translateWithGemini({
  audioBase64,
  mimeType,
  apiKey,
  previousContext = [],
  speaker = 'Speaker A',
}: {
  audioBase64: string;
  mimeType: string;
  apiKey: string;
  previousContext?: string[];
  speaker?: string;
}): Promise<StreamChunkResponse> {
  const promptText = buildTranslationPrompt(previousContext);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: ESAN_TRANSLATION_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: 'application/json',
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsedErr: { error?: { message?: string } } | null = null;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        // ignore
      }

      const errorMessage = parsedErr?.error?.message || errText || res.statusText;

      return {
        speaker,
        detected_lang: 'Error',
        transcription: '',
        translation: `Gemini API error (${res.status}): ${errorMessage}`,
        is_final: true,
        error: errorMessage,
      };
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return {
        speaker,
        detected_lang: 'None',
        transcription: '',
        translation: '',
        is_final: true,
      };
    }

    const cleanedJson = candidateText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanedJson) as StreamChunkResponse;

    return {
      speaker: parsed.speaker || speaker,
      detected_lang: parsed.detected_lang || 'Esan',
      transcription: parsed.transcription || '',
      translation: parsed.translation || '',
      is_final: parsed.is_final ?? true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown translation failure.';
    return {
      speaker,
      detected_lang: 'Error',
      transcription: '',
      translation: `Translation processing failed: ${message}`,
      is_final: true,
      error: message,
    };
  }
}
