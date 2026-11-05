'use client';

import { useState, useCallback, useRef } from 'react';
import { TranslationMessage, StreamChunkResponse, PipelineStatus } from '@/types/translation';
import { blobToBase64 } from '@/lib/audio/audioPipeline';
import { fetchWithRetry } from '@/lib/utils/retry';

export interface UseTranslationStreamOptions {
  onNewMessage?: (msg: TranslationMessage) => void;
  onInterimUpdate?: (msg: TranslationMessage | null) => void;
  onStatusChange?: (status: PipelineStatus) => void;
  onError?: (errorMsg: string) => void;
}

export function useTranslationStream({
  onNewMessage,
  onInterimUpdate,
  onStatusChange,
  onError,
}: UseTranslationStreamOptions = {}) {
  const [messages, setMessages] = useState<TranslationMessage[]>([]);
  const [interimMessage, setInterimMessage] = useState<TranslationMessage | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [latestLatencyMs, setLatestLatencyMs] = useState<number | undefined>(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Rolling context memory (last 2 translated sentences)
  const contextHistoryRef = useRef<string[]>([]);
  const messagesRef = useRef<TranslationMessage[]>([]);
  messagesRef.current = messages;

  // Track session start time for 45-second stream rollover
  const sessionStartTimeRef = useRef<number>(0);

  const processAudioSlice = useCallback(
    async (audioBlob: Blob, durationMs: number, isFinal: boolean) => {
      const now = Date.now();
      if (sessionStartTimeRef.current === 0) {
        sessionStartTimeRef.current = now;
      }
      const startTime = now;
      setIsTranslating(true);
      setSessionError(null);
      onStatusChange?.('analyzing');

      // Check if session has exceeded 45 seconds -> roll over session cleanly
      if (now - sessionStartTimeRef.current > 45000) {
        console.log('[TranslationStream] Session rollover triggered (45s Vercel ceiling protection)');
        sessionStartTimeRef.current = now;
      }

      // Optimistic interim UI badge
      const interimId = `interim-${Date.now()}`;
      const placeholder: TranslationMessage = {
        id: interimId,
        speaker: 'Speaker A',
        detected_lang: 'Analyzing...',
        transcription: 'Processing audio slice...',
        translation: 'Translating with Gemini 2.0 Flash...',
        is_final: false,
        timestamp: Date.now(),
      };
      setInterimMessage(placeholder);
      onInterimUpdate?.(placeholder);

      try {
        const audioBase64 = await blobToBase64(audioBlob);

        // Send to Vercel SSE endpoint with exponential backoff retry
        const response = await fetchWithRetry(
          '/api/translate-stream',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio: audioBase64,
              mimeType: audioBlob.type || 'audio/wav',
              previousContext: contextHistoryRef.current.slice(-2),
              speaker: 'Speaker A',
            }),
          },
          { maxRetries: 2, initialDelayMs: 600 }
        );

        if (!response.ok || !response.body) {
          throw new Error(`API stream error (${response.status}): ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const payload = JSON.parse(trimmed.slice(6)) as StreamChunkResponse;

                if (payload.error) {
                  setSessionError(payload.error);
                  onError?.(payload.error);
                }

                if (payload.translation) {
                  const latency = Date.now() - startTime;
                  setLatestLatencyMs(latency);

                  const newMessage: TranslationMessage = {
                    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    speaker: payload.speaker || 'Speaker A',
                    detected_lang: payload.detected_lang || 'Esan',
                    transcription: payload.transcription || '',
                    translation: payload.translation,
                    is_final: payload.is_final ?? true,
                    timestamp: Date.now(),
                  };

                  // Update rolling context memory
                  contextHistoryRef.current.push(payload.translation);
                  if (contextHistoryRef.current.length > 4) {
                    contextHistoryRef.current.shift();
                  }

                  // Clear interim message
                  setInterimMessage(null);
                  onInterimUpdate?.(null);

                  // Append to message list
                  setMessages((prev) => [...prev, newMessage]);
                  onNewMessage?.(newMessage);
                }
              } catch (parseErr) {
                console.warn('[SSE] Chunk parse warning:', parseErr);
              }
            }
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Processing failed';
        console.error('[TranslationStream] Processing failed:', errorMsg);
        setSessionError(errorMsg);
        onError?.(errorMsg);
        setInterimMessage(null);
        onInterimUpdate?.(null);
      } finally {
        setIsTranslating(false);
        onStatusChange?.('listening');
      }
    },
    [onError, onInterimUpdate, onNewMessage, onStatusChange]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setInterimMessage(null);
    setSessionError(null);
    contextHistoryRef.current = [];
    sessionStartTimeRef.current = Date.now();
  }, []);

  const setManualMessages = useCallback((newMsgs: TranslationMessage[]) => {
    setMessages(newMsgs);
  }, []);

  return {
    messages,
    interimMessage,
    isTranslating,
    latestLatencyMs,
    sessionError,
    processAudioSlice,
    clearMessages,
    setManualMessages,
  };
}
