export type PipelineStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speech_detected'
  | 'analyzing'
  | 'error';

export interface TranslationMessage {
  id: string;
  speaker: string;
  detected_lang: string;
  transcription: string;
  translation: string;
  is_final: boolean;
  timestamp: number;
  is_mismatch?: boolean;
  suggested_lang?: string;
}

export interface StreamChunkResponse {
  speaker?: string;
  detected_lang?: string;
  transcription?: string;
  translation?: string;
  is_final?: boolean;
  error?: string;
  is_mismatch?: boolean;
  suggested_lang?: string;
}
