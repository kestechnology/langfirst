'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  DEFAULT_AUDIO_CONFIG,
  getSupportedMimeType,
} from '@/lib/audio/audioPipeline';

export interface UseAudioPipelineOptions {
  onAudioChunkReady?: (blob: Blob, durationMs: number) => void;
  chunkIntervalMs?: number; // Time slicing interval (e.g., 2000ms for 2s slices)
}

export function useAudioPipeline({
  onAudioChunkReady,
  chunkIntervalMs = 2000,
}: UseAudioPipelineOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lowVolumeWarning, setLowVolumeWarning] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunkStartTimeRef = useRef<number>(0);
  const recordedChunksRef = useRef<Blob[]>([]);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxVolumeSeenRef = useRef<number>(0);

  // Real-time audio level monitoring loop using Web Audio API AnalyserNode
  const monitorAudioLevels = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate RMS/average volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    // Normalize to 0 - 1 range
    const normalizedLevel = Math.min(1, Math.max(0, average / 128));
    setAudioLevel(normalizedLevel);

    if (normalizedLevel > maxVolumeSeenRef.current) {
      maxVolumeSeenRef.current = normalizedLevel;
    }

    animationFrameRef.current = requestAnimationFrame(monitorAudioLevels);
  }, []);

  // Start recording & Web Audio pipeline
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setLowVolumeWarning(false);
      maxVolumeSeenRef.current = 0;

      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Microphone audio capture is not supported in this browser.');
      }

      // 1. Request microphone with 16kHz mono, echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: DEFAULT_AUDIO_CONFIG.sampleRate,
          channelCount: DEFAULT_AUDIO_CONFIG.channelCount,
          echoCancellation: DEFAULT_AUDIO_CONFIG.echoCancellation,
          noiseSuppression: DEFAULT_AUDIO_CONFIG.noiseSuppression,
          autoGainControl: DEFAULT_AUDIO_CONFIG.autoGainControl,
        },
      });

      streamRef.current = stream;

      // 2. Initialize Web Audio API for live frequency & level analysis
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass({
        sampleRate: DEFAULT_AUDIO_CONFIG.sampleRate,
      });
      audioContextRef.current = audioCtx;

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      sourceNode.connect(analyser);
      analyserRef.current = analyser;

      // Start volume analysis loop
      monitorAudioLevels();

      // Check for prolonged low volume after 6 seconds of recording
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = setTimeout(() => {
        if (maxVolumeSeenRef.current < 0.03) {
          setLowVolumeWarning(true);
        }
      }, 6000);

      // 3. Initialize MediaRecorder for rolling Opus/WebM audio slice capture
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      chunkStartTimeRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          const duration = Date.now() - chunkStartTimeRef.current;
          const chunkBlob = new Blob(recordedChunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });

          // Reset chunk buffer for the next rolling slice
          recordedChunksRef.current = [];
          chunkStartTimeRef.current = Date.now();

          if (onAudioChunkReady) {
            onAudioChunkReady(chunkBlob, duration);
          }
        }
      };

      // Slice audio chunks at specified interval
      recorder.start(chunkIntervalMs);
      setIsRecording(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to access microphone.';
      setError(message);
      setIsRecording(false);
    }
  }, [chunkIntervalMs, monitorAudioLevels, onAudioChunkReady]);

  // Stop recording and clean up Web Audio resources
  const stopRecording = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setAudioLevel(0);
    setLowVolumeWarning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    audioLevel,
    error,
    lowVolumeWarning,
    startRecording,
    stopRecording,
  };
}
