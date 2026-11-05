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

export async function translateAudioChunk({
  audioBase64,
  mimeType = 'audio/wav',
  previousContext = [],
  speaker = 'Speaker A',
}: TranslateAudioChunkParams): Promise<StreamChunkResponse> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINIKEY;

  if (!apiKey) {
    return {
      speaker,
      detected_lang: 'Error',
      transcription: '',
      translation: 'Missing GEMINI_API_KEY. Please provide a valid Gemini API key in .env.local',
      is_final: true,
      error: 'NO_API_KEY',
    };
  }

  const promptText = buildTranslationPrompt(previousContext);

  try {
    // Direct REST call to Gemini 2.0 Flash with x-goog-api-key header supporting both legacy AIza and new AQ authorization keys
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

    // Clean text in case of backticks
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

