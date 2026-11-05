export type PipelineStatus = 'idle' | 'listening' | 'speech_detected' | 'analyzing' | 'error';

export interface TranslationMessage {
  id: string;
  speaker: string;
  detected_lang: string;
  transcription: string;
  translation: string;
  is_final: boolean;
  timestamp: number;
}

export interface StreamChunkResponse {
  speaker?: string;
  detected_lang?: string;
  transcription?: string;
  translation?: string;
  is_final?: boolean;
  error?: string;
}

