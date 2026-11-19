import {
  UNIVERSAL_TRANSLATION_SYSTEM_PROMPT,
  getSystemPromptForLanguage,
  buildTranslationPrompt,
} from './prompts';
import { getSourceLanguageByCode } from '@/config/languages';
import { StreamChunkResponse } from '@/types/translation';

export interface TranslateAudioChunkParams {
  audioBase64: string;
  mimeType?: string;
  previousContext?: string[];
  speaker?: string;
  sourceLanguage?: string;
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
  sourceLanguage = 'edo',
}: TranslateAudioChunkParams): Promise<StreamChunkResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINIKEY;

  // If OpenAI key is present, use Whisper for acoustic transcription + Claude or GPT-4o-mini for dialect translation
  if (openaiKey) {
    return translateWithWhisperPipeline({
      audioBase64,
      mimeType,
      openaiKey,
      claudeKey,
      previousContext,
      speaker,
      sourceLanguage,
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
      sourceLanguage,
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
 * Detects Whisper subtitle hallucinations, autoregressive repetition loops, and prompt regurgitations.
 */
function isWhisperHallucination(text: string): boolean {
  if (!text || text.trim().length < 2) return true;
  const cleaned = text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_'\"\`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Known Whisper subtitle / YouTube dataset hallucination strings
  const HALLUCINATIONS = [
    'thank you for watching',
    'thanks for watching',
    'thank you',
    'thank you very much',
    'subtitles by',
    'please subscribe',
    'subscribe to my channel',
    'see you in the next video',
    'see you next time',
    'you',
    'bye',
    'goodbye',
    'mbc',
    'amara org',
    'edo language and nigerian english',
    'central edo language',
    'esan language and nigerian english',
    'watching',
  ];

  for (const h of HALLUCINATIONS) {
    if (cleaned === h || cleaned.startsWith(h + ' ') || cleaned.endsWith(' ' + h)) {
      return true;
    }
  }

  // 2. Repetition loop detection (any n-gram repeating >= 3 times)
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 6) {
    const ngrams: Record<string, number> = {};
    for (let len = 1; len <= 3; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const gram = words.slice(i, i + len).join(' ');
        ngrams[gram] = (ngrams[gram] || 0) + 1;
        if (ngrams[gram] >= 3 && gram.length >= 3) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Pipeline: OpenAI Whisper transcribes acoustic audio -> Claude (or GPT-4o-mini)
 * applies Esan linguistic dictionary and formats into structured English JSON.
 */
async function translateWithWhisperPipeline({
  audioBase64,
  mimeType = 'audio/webm',
  openaiKey,
  claudeKey,
  previousContext = [],
  speaker = 'Speaker A',
  sourceLanguage = 'edo',
}: {
  audioBase64: string;
  mimeType?: string;
  openaiKey: string;
  claudeKey?: string;
  previousContext?: string[];
  speaker?: string;
  sourceLanguage?: string;
}): Promise<StreamChunkResponse> {
  try {
    // Step 1: Transcribe audio slice using OpenAI Whisper
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const cleanMime = mimeType ? mimeType.split(';')[0].trim() : 'audio/wav';
    const ext = cleanMime.includes('webm')
      ? 'webm'
      : cleanMime.includes('mp4') || cleanMime.includes('m4a')
        ? 'm4a'
        : cleanMime.includes('ogg')
          ? 'ogg'
          : cleanMime.includes('mp3')
            ? 'mp3'
            : 'wav';
    const filename = `audio.${ext}`;
    const blob = new Blob([bytes], { type: cleanMime });

    const langConfig = getSourceLanguageByCode(sourceLanguage);

    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');
    formData.append('temperature', '0.0');
    formData.append('prompt', langConfig.whisperPrompt);

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

    // Filter out Whisper subtitle hallucinations, repetition loops, and prompt leaks
    if (isWhisperHallucination(rawTranscript)) {
      console.log(`[Whisper] Filtered acoustic hallucination: "${rawTranscript}"`);
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
        sourceLanguage,
      });
    } else {
      return refineWithGPT4oMini({
        rawTranscript,
        openaiKey,
        previousContext,
        speaker,
        sourceLanguage,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Whisper pipeline error';
    return {
      speaker,
      detected_lang: 'Error',
      transcription: '',
      translation: '',
      is_final: true,
      error: msg,
    };
  }
}

/**
 * Strips raw JSON syntax, curly braces, and keys if raw JSON ever appears in text.
 */
export function sanitizeCleanText(str: string): string {
  if (!str) return '';
  let s = str.trim();

  // Strip markdown code fences ```json ... ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // If text is wrapped in JSON braces e.g. {"speaker": ...}
  if (s.startsWith('{') && s.endsWith('}')) {
    const match = s.match(/"translation"\s*:\s*"([\s\S]*?)"/);
    if (match) {
      return match[1].replace(/\\"/g, '"').trim();
    }
  }

  // Remove common JSON field keys if accidentally leaked
  s = s.replace(/"?(?:speaker|detected_lang|transcription|translation|is_final)"?\s*:\s*/gi, '');
  // Strip outer quotes and brackets
  s = s.replace(/^[{\[\s"]+|[}\]\s"]+$/g, '');
  return s.trim();
}

/**
 * Robustly parses model output, extracting ONLY pure English translation and native transcription.
 * Protects against malformed JSON, unescaped quotes, or conversational wrapper text.
 */
function extractTranslationFields(
  rawResponseText: string,
  fallbackTranscript: string,
  fallbackSpeaker: string = 'Speaker A'
): StreamChunkResponse {
  let cleaned = rawResponseText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // 1. Try standard JSON.parse
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        let translation = typeof parsed.translation === 'string' ? parsed.translation : '';
        let transcription = typeof parsed.transcription === 'string' ? parsed.transcription : '';
        let lang = typeof parsed.detected_lang === 'string' ? parsed.detected_lang.trim() : 'Edo (Esan)';
        let speaker = typeof parsed.speaker === 'string' ? parsed.speaker : fallbackSpeaker;
        const isMismatch = Boolean(parsed.is_mismatch);
        const suggestedLang = typeof parsed.suggested_lang === 'string' ? parsed.suggested_lang.trim() : '';

        if (!lang || lang.toLowerCase() === 'undefined' || lang.toLowerCase() === 'null') {
          lang = 'Edo (Esan)';
        }

        translation = sanitizeCleanText(translation);
        transcription = sanitizeCleanText(transcription);

        if (!translation) {
          translation = fallbackTranscript;
        }

        return {
          speaker,
          detected_lang: lang,
          transcription: transcription || fallbackTranscript,
          translation,
          is_final: true,
          is_mismatch: isMismatch,
          suggested_lang: suggestedLang,
        };
      }
    }
  } catch {
    // JSON syntax error -> fall through to regex extraction
  }

  // 2. Fallback regex extraction
  const translationMatch =
    cleaned.match(/"translation"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"|\s*\}|\s*$)/) ||
    cleaned.match(/"translation"\s*:\s*"([\s\S]*?)"/);

  const transcriptionMatch =
    cleaned.match(/"transcription"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"|\s*\}|\s*$)/) ||
    cleaned.match(/"transcription"\s*:\s*"([\s\S]*?)"/);

  const langMatch = cleaned.match(/"detected_lang"\s*:\s*"([^"]+)"/);
  const speakerMatch = cleaned.match(/"speaker"\s*:\s*"([^"]+)"/);
  const is_mismatch = /"is_mismatch"\s*:\s*true/i.test(cleaned);
  const suggestedMatch = cleaned.match(/"suggested_lang"\s*:\s*"([^"]+)"/);
  const suggested_lang = suggestedMatch ? suggestedMatch[1].trim() : '';

  let translation = translationMatch ? translationMatch[1].trim() : '';
  let transcription = transcriptionMatch ? transcriptionMatch[1].trim() : fallbackTranscript;
  let detected_lang = langMatch ? langMatch[1].trim() : 'Edo (Esan)';
  let speaker = speakerMatch ? speakerMatch[1].trim() : fallbackSpeaker;

  if (!detected_lang || detected_lang.toLowerCase() === 'undefined') {
    detected_lang = 'Edo (Esan)';
  }

  // If translation was missing or was raw JSON
  if (!translation || translation.startsWith('{') || translation.includes('"translation":')) {
    translation = cleaned.startsWith('{') ? fallbackTranscript : cleaned;
  }

  translation = sanitizeCleanText(translation);
  transcription = sanitizeCleanText(transcription);

  return {
    speaker,
    detected_lang,
    transcription: transcription || fallbackTranscript,
    translation: translation || fallbackTranscript,
    is_final: true,
    is_mismatch,
    suggested_lang,
  };
}

/**
 * Refines transcription with Anthropic Claude applying Esan phonetic rules & formatting
 */
async function refineWithClaude({
  rawTranscript,
  claudeKey,
  previousContext = [],
  speaker = 'Speaker A',
  sourceLanguage = 'edo',
}: {
  rawTranscript: string;
  claudeKey: string;
  previousContext?: string[];
  speaker?: string;
  sourceLanguage?: string;
}): Promise<StreamChunkResponse> {
  try {
    const promptText = buildTranslationPrompt(previousContext, sourceLanguage);
    const systemPrompt = getSystemPromptForLanguage(sourceLanguage);
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
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[Claude] Refinement error, returning raw transcript:', err);
      return {
        speaker,
        detected_lang: 'Edo (Esan)',
        transcription: rawTranscript,
        translation: rawTranscript,
        is_final: true,
      };
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || '';
    return extractTranslationFields(content, rawTranscript, speaker);
  } catch (err) {
    return {
      speaker,
      detected_lang: 'Edo (Esan)',
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
  sourceLanguage = 'edo',
}: {
  rawTranscript: string;
  openaiKey: string;
  previousContext?: string[];
  speaker?: string;
  sourceLanguage?: string;
}): Promise<StreamChunkResponse> {
  try {
    const promptText = buildTranslationPrompt(previousContext, sourceLanguage);
    const systemPrompt = getSystemPromptForLanguage(sourceLanguage);

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
          { role: 'system', content: systemPrompt },
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
        detected_lang: 'Edo (Esan)',
        transcription: rawTranscript,
        translation: rawTranscript,
        is_final: true,
      };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    return extractTranslationFields(content, rawTranscript, speaker);
  } catch {
    return {
      speaker,
      detected_lang: 'Edo (Esan)',
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
      translation: '',
      is_final: true,
      error: `Whisper error: ${errText}`,
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
  sourceLanguage = 'edo',
}: {
  audioBase64: string;
  mimeType: string;
  apiKey: string;
  previousContext?: string[];
  speaker?: string;
  sourceLanguage?: string;
}): Promise<StreamChunkResponse> {
  const promptText = buildTranslationPrompt(previousContext, sourceLanguage);
  const systemPrompt = getSystemPromptForLanguage(sourceLanguage);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
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
      detected_lang: parsed.detected_lang || 'Edo (Esan)',
      transcription: parsed.transcription || '',
      translation: parsed.translation || '',
      is_final: parsed.is_final ?? true,
      is_mismatch: Boolean(parsed.is_mismatch),
      suggested_lang: parsed.suggested_lang || '',
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
