'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { encodeWAV } from '@/lib/audio/wavEncoder';

export interface UseVadPipelineOptions {
  onSpeechSlice?: (sliceBlob: Blob, durationMs: number, isFinal: boolean) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  minSliceDurationMs?: number; // Minimum speech duration to dispatch (e.g., 1200ms)
  maxSliceDurationMs?: number; // Maximum speech segment before slicing continuous speech (e.g., 2800ms)
}

export function useVadPipeline({
  onSpeechSlice,
  onSpeechStart,
  onSpeechEnd,
  minSliceDurationMs = 1200,
  maxSliceDurationMs = 2800,
}: UseVadPipelineOptions = {}) {
  const [isVadActive, setIsVadActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vadInstanceRef = useRef<{
    start: () => Promise<void>;
    pause: () => void;
    destroy: () => void;
  } | null>(null);

  const accumulatedSamplesRef = useRef<Float32Array[]>([]);
  const totalSamplesCountRef = useRef<number>(0);

  // Helper to concatenate collected Float32Array chunks
  const concatenateBuffers = (buffers: Float32Array[], totalLength: number): Float32Array => {
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  };

  // Flush accumulated speech samples into a 16kHz WAV blob
  const flushSpeechBuffer = useCallback(
    (isFinal: boolean) => {
      if (accumulatedSamplesRef.current.length === 0 || totalSamplesCountRef.current === 0) {
        return;
      }

      const sampleRate = 16000;
      const durationMs = Math.round((totalSamplesCountRef.current / sampleRate) * 1000);

      // Only dispatch if it meets minimum speech threshold
      if (durationMs >= minSliceDurationMs || (isFinal && durationMs >= 400)) {
        const mergedSamples = concatenateBuffers(
          accumulatedSamplesRef.current,
          totalSamplesCountRef.current
        );
        const wavBlob = encodeWAV(mergedSamples, sampleRate);

        if (onSpeechSlice) {
          onSpeechSlice(wavBlob, durationMs, isFinal);
        }
      }

      // Reset buffer
      accumulatedSamplesRef.current = [];
      totalSamplesCountRef.current = 0;
    },
    [minSliceDurationMs, onSpeechSlice]
  );

  // Initialize and start VAD
  const startVad = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Dynamic client-side import of vad-web to prevent SSR errors
      const vadWeb = await import('@ricky0123/vad-web');

      const vad = await vadWeb.MicVAD.new({
        model: 'v5',
        positiveSpeechThreshold: 0.75,
        negativeSpeechThreshold: 0.5,
        minSpeechMs: 200,
        preSpeechPadMs: 300, // 300ms lookback buffer to preserve initial consonants
        redemptionMs: 250,
        baseAssetPath: '/vad',
        onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/',
        onSpeechStart: () => {
          setIsSpeaking(true);
          accumulatedSamplesRef.current = [];
          totalSamplesCountRef.current = 0;
          onSpeechStart?.();
        },
        onFrameProcessed: (probs: { isSpeech: number }, frame: Float32Array) => {
          // If speech is ongoing, accumulate frames
          if (probs.isSpeech > 0.5) {
            accumulatedSamplesRef.current.push(frame);
            totalSamplesCountRef.current += frame.length;

            const currentDurationMs = Math.round(
              (totalSamplesCountRef.current / 16000) * 1000
            );

            // Dynamic continuous speech segmenting (1.5s - 2.8s window)
            if (currentDurationMs >= maxSliceDurationMs) {
              flushSpeechBuffer(false);
            }
          }
        },
        onSpeechEnd: (audio: Float32Array) => {
          setIsSpeaking(false);

          // Append remaining audio from onSpeechEnd if not already processed
          if (audio && audio.length > 0) {
            accumulatedSamplesRef.current.push(audio);
            totalSamplesCountRef.current += audio.length;
          }

          flushSpeechBuffer(true);
          onSpeechEnd?.();
        },
        onVADMisfire: () => {
          // False positive / quick cough: discard buffered noise
          accumulatedSamplesRef.current = [];
          totalSamplesCountRef.current = 0;
          setIsSpeaking(false);
        },
      });

      vadInstanceRef.current = vad;
      await vad.start();
      setIsVadActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize Silero VAD.';
      setError(msg);
      setIsVadActive(false);
    } finally {
      setIsLoading(false);
    }
  }, [flushSpeechBuffer, maxSliceDurationMs, onSpeechEnd, onSpeechStart]);

  // Stop VAD
  const stopVad = useCallback(() => {
    if (vadInstanceRef.current) {
      try {
        vadInstanceRef.current.pause();
        vadInstanceRef.current.destroy();
      } catch {
        // ignore cleanup errors
      }
      vadInstanceRef.current = null;
    }

    // Flush any pending buffer
    flushSpeechBuffer(true);

    setIsVadActive(false);
    setIsSpeaking(false);
  }, [flushSpeechBuffer]);

  useEffect(() => {
    return () => {
      stopVad();
    };
  }, [stopVad]);

  return {
    isVadActive,
    isSpeaking,
    isLoading,
    error,
    startVad,
    stopVad,
  };
}
