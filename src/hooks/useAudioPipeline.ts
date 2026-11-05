'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { encodeWAV } from '@/lib/audio/wavEncoder';

export interface UseAudioPipelineOptions {
  onAudioChunkReady?: (blob: Blob, durationMs: number) => void;
  onSpeechActivityChange?: (isSpeaking: boolean) => void;
  chunkDurationMs?: number; // dispatch rolling speech slices every ~2000ms
  silenceThreshold?: number; // RMS volume threshold for speech detection
  silenceFlushDelayMs?: number; // ms of silence before flushing an utterance
}

export function useAudioPipeline({
  onAudioChunkReady,
  onSpeechActivityChange,
  chunkDurationMs = 2200,
  silenceThreshold = 0.025,
  silenceFlushDelayMs = 600,
}: UseAudioPipelineOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Audio sample buffer
  const sampleBufferRef = useRef<Float32Array[]>([]);
  const totalSamplesRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const sliceStartTimeRef = useRef<number>(0);
  const isSpeakingStateRef = useRef<boolean>(false);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to flush current buffer into a 16kHz WAV blob
  const flushBuffer = useCallback(() => {
    if (sampleBufferRef.current.length === 0 || totalSamplesRef.current === 0) {
      return;
    }

    const totalLength = totalSamplesRef.current;
    const merged = new Float32Array(totalLength);
    let offset = 0;

    for (const buf of sampleBufferRef.current) {
      merged.set(buf, offset);
      offset += buf.length;
    }

    const durationMs = Math.round((totalLength / 16000) * 1000);

    // Only dispatch if buffer contains at least 500ms of audio
    if (durationMs >= 500) {
      const wavBlob = encodeWAV(merged, 16000);
      if (onAudioChunkReady) {
        onAudioChunkReady(wavBlob, durationMs);
      }
    }

    sampleBufferRef.current = [];
    totalSamplesRef.current = 0;
    sliceStartTimeRef.current = Date.now();
  }, [onAudioChunkReady]);

  // Volume monitoring loop
  const monitorVolume = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    const normalized = Math.min(1, Math.max(0, avg / 128));
    setAudioLevel(normalized);

    const now = Date.now();
    const hasVoice = normalized > silenceThreshold;

    if (hasVoice) {
      lastSpeechTimeRef.current = now;
      if (!isSpeakingStateRef.current) {
        isSpeakingStateRef.current = true;
        setIsSpeaking(true);
        onSpeechActivityChange?.(true);
      }

      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
    } else {
      // If was speaking, and silence has lasted longer than silenceFlushDelayMs
      if (
        isSpeakingStateRef.current &&
        now - lastSpeechTimeRef.current > silenceFlushDelayMs
      ) {
        isSpeakingStateRef.current = false;
        setIsSpeaking(false);
        onSpeechActivityChange?.(false);

        // Schedule flush on speech pause
        if (!flushTimeoutRef.current) {
          flushTimeoutRef.current = setTimeout(() => {
            flushBuffer();
            flushTimeoutRef.current = null;
          }, 150);
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  }, [flushBuffer, onSpeechActivityChange, silenceFlushDelayMs, silenceThreshold]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      sampleBufferRef.current = [];
      totalSamplesRef.current = 0;
      sliceStartTimeRef.current = Date.now();

      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // Analyser for real-time visual meter
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      // ScriptProcessor for collecting raw 16kHz PCM samples directly
      const bufferSize = 4096;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy audio data to buffer
        const copy = new Float32Array(inputData.length);
        copy.set(inputData);

        sampleBufferRef.current.push(copy);
        totalSamplesRef.current += copy.length;

        const currentDurationMs = (totalSamplesRef.current / 16000) * 1000;

        // Dynamic continuous speech segmenting: flush rolling slices every ~2.2s
        if (currentDurationMs >= chunkDurationMs) {
          // Only flush if user has been speaking recently
          if (Date.now() - lastSpeechTimeRef.current < 1500) {
            flushBuffer();
          } else {
            // Discard prolonged silence buffer to avoid wasting API calls
            sampleBufferRef.current = [];
            totalSamplesRef.current = 0;
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      monitorVolume();
      setIsRecording(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access failed.';
      setError(msg);
      setIsRecording(false);
    }
  }, [chunkDurationMs, flushBuffer, monitorVolume]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    // Flush any pending speech buffer on stop
    flushBuffer();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setIsSpeaking(false);
    setAudioLevel(0);
    isSpeakingStateRef.current = false;
  }, [flushBuffer]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    audioLevel,
    isSpeaking,
    error,
    startRecording,
    stopRecording,
  };
}
