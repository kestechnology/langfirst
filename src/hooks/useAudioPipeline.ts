'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseAudioPipelineOptions {
  onAudioChunkReady?: (blob: Blob, durationMs: number) => void;
  onSpeechActivityChange?: (isSpeaking: boolean) => void;
  chunkDurationMs?: number; // dispatch rolling speech slices every ~2200ms
  silenceThreshold?: number; // RMS volume threshold for speech detection
}

export function useAudioPipeline({
  onAudioChunkReady,
  onSpeechActivityChange,
  chunkDurationMs = 2200,
  silenceThreshold = 0.025,
}: UseAudioPipelineOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const isSpeakingStateRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(0);
  const chunkStartTimeRef = useRef<number>(0);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Real-time visual level monitoring
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
    } else {
      if (isSpeakingStateRef.current && now - lastSpeechTimeRef.current > 700) {
        isSpeakingStateRef.current = false;
        setIsSpeaking(false);
        onSpeechActivityChange?.(false);
      }
    }

    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  }, [onSpeechActivityChange, silenceThreshold]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      console.log('[AudioPipeline] Initiating microphone capture...');
      setIsConnecting(true);
      setError(null);

      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      // Universal audio capture constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      console.log('[AudioPipeline] Microphone permission granted.');

      // Initialize HTML5 MediaRecorder (universal C++ audio compression)
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else {
            mimeType = '';
          }
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunkStartTimeRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 200) {
          const duration = Date.now() - chunkStartTimeRef.current;
          chunkStartTimeRef.current = Date.now();
          console.log(`[AudioPipeline] Emitting slice: ${event.data.size} bytes (${duration}ms)`);
          onAudioChunkReady?.(event.data, duration);
        }
      };

      // Emit slices at interval
      recorder.start(chunkDurationMs);

      // Non-blocking Web Audio Analyser for visual waveform meter
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
        // Do not await resume() to prevent any browser autoplay policy hangs
        audioCtx.resume().catch(() => {});

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        analyserRef.current = analyser;

        monitorVolume();
      } catch (audioCtxErr) {
        console.warn('[AudioPipeline] Visualizer init warning (non-fatal):', audioCtxErr);
      }

      setIsRecording(true);
      setIsConnecting(false);
      console.log('[AudioPipeline] Successfully recording.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access failed.';
      console.error('[AudioPipeline] Microphone error:', err);
      setError(msg);
      setIsRecording(false);
      setIsConnecting(false);
      throw err;
    }
  }, [chunkDurationMs, monitorVolume, onAudioChunkReady]);

  // Stop recording
  const stopRecording = useCallback(() => {
    console.log('[AudioPipeline] Stopping audio capture...');
    setIsConnecting(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
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
    setIsSpeaking(false);
    setAudioLevel(0);
    isSpeakingStateRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    isConnecting,
    audioLevel,
    isSpeaking,
    error,
    clearError,
    startRecording,
    stopRecording,
  };
}
