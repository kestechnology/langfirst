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
 * Automatically detects which API key is configured:
 * 1. OpenAI (gpt-4o-mini-audio-preview / whisper) -> OPENAI_API_KEY
 * 2. Google Gemini (gemini-2.0-flash) -> GEMINI_API_KEY
 * 3. Anthropic Claude (claude-3-5-haiku / sonnet) -> ANTHROPIC_API_KEY
 */
export async function translateAudioChunk({
  audioBase64,
  mimeType = 'audio/wav',
  previousContext = [],
  speaker = 'Speaker A',
}: TranslateAudioChunkParams): Promise<StreamChunkResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINIKEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    return translateWithOpenAIAudio({
      audioBase64,
      apiKey: openaiKey,
      previousContext,
      speaker,
    });
  }

  if (geminiKey) {
    return translateWithGemini({
      audioBase64,
      mimeType,
      apiKey: geminiKey,
      previousContext,
      speaker,
    });
  }

  if (anthropicKey) {
    return {
      speaker,
      detected_lang: 'Anthropic Notice',
      transcription: '',
      translation:
        'Anthropic Claude requires an audio transcription step (like OpenAI Whisper) before text translation. Please configure OPENAI_API_KEY for direct audio translation.',
      is_final: true,
      error: 'ANTHROPIC_AUDIO_UNSUPPORTED',
    };
  }

  return {
    speaker,
    detected_lang: 'Error',
    transcription: '',
    translation:
      'No API key detected. Please set OPENAI_API_KEY or GEMINI_API_KEY in your .env.local file.',
    is_final: true,
    error: 'NO_API_KEY',
  };
}

/**
 * OpenAI Multimodal Audio translation (gpt-4o-mini-audio-preview)
 */
async function translateWithOpenAIAudio({
  audioBase64,
  apiKey,
  previousContext = [],
  speaker = 'Speaker A',
}: {
  audioBase64: string;
  apiKey: string;
  previousContext?: string[];
  speaker?: string;
}): Promise<StreamChunkResponse> {
  const promptText = buildTranslationPrompt(previousContext);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-audio-preview',
        modalities: ['text'],
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: ESAN_TRANSLATION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptText,
              },
              {
                type: 'input_audio',
                input_audio: {
                  data: audioBase64,
                  format: 'wav',
                },
              },
            ],
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        errMsg = parsed.error?.message || errText;
      } catch {
        // ignore
      }

      // If audio model not accessible, attempt Whisper fallback
      console.warn('[OpenAI] Audio model error, attempting Whisper translation:', errMsg);
      return translateWithOpenAIWhisper({ audioBase64, apiKey, speaker });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        speaker,
        detected_lang: 'None',
        transcription: '',
        translation: '',
        is_final: true,
      };
    }

    const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      speaker: parsed.speaker || speaker,
      detected_lang: parsed.detected_lang || 'Esan',
      transcription: parsed.transcription || '',
      translation: parsed.translation || '',
      is_final: parsed.is_final ?? true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'OpenAI translation failed';
    return translateWithOpenAIWhisper({ audioBase64, apiKey, speaker });
  }
}

/**
 * OpenAI Whisper audio translation fallback (/v1/audio/translations)
 */
async function translateWithOpenAIWhisper({
  audioBase64,
  apiKey,
  speaker = 'Speaker A',
}: {
  audioBase64: string;
  apiKey: string;
  speaker?: string;
}): Promise<StreamChunkResponse> {
  try {
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

    const res = await fetch('https://api.openai.com/v1/audio/translations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        speaker,
        detected_lang: 'Error',
        transcription: '',
        translation: `OpenAI API Error: ${errText}`,
        is_final: true,
        error: errText,
      };
    }

    const data = await res.json();
    return {
      speaker,
      detected_lang: 'Esan / West African',
      transcription: '',
      translation: data.text || '',
      is_final: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Whisper failed';
    return {
      speaker,
      detected_lang: 'Error',
      transcription: '',
      translation: `Translation failed: ${msg}`,
      is_final: true,
      error: msg,
    };
  }
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
