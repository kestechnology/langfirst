'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { downsampleTo16k, encodeWAV } from '@/lib/audio/wavEncoder';

export interface UseAudioPipelineOptions {
  onAudioChunkReady?: (blob: Blob, durationMs: number) => void;
  onSpeechActivityChange?: (isSpeaking: boolean) => void;
  chunkDurationMs?: number; // max speech slice window (e.g. 2400ms)
  silenceThreshold?: number; // RMS volume threshold for speech detection
}

export function useAudioPipeline({
  onAudioChunkReady,
  onSpeechActivityChange,
  chunkDurationMs = 2400,
  silenceThreshold = 0.02,
}: UseAudioPipelineOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const flushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // PCM collection & VAD state refs
  const pcmBuffersRef = useRef<Float32Array[]>([]);
  const totalSamplesRef = useRef<number>(0);
  const hasVoiceInWindowRef = useRef<boolean>(false);
  const isSpeakingStateRef = useRef<boolean>(false);
  const lastVoiceTimeRef = useRef<number>(0);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Flush accumulated PCM buffer to WAV chunk
  const flushChunk = useCallback(
    (force = false) => {
      const audioCtx = audioContextRef.current;
      if (!audioCtx || totalSamplesRef.current === 0) return;

      const sampleRate = audioCtx.sampleRate;
      const currentDurationMs = (totalSamplesRef.current / sampleRate) * 1000;
      const now = Date.now();

      // Trigger criteria:
      // 1. Force flush (e.g. mic stop)
      // 2. Rolling window reached chunkDurationMs (e.g. 2400ms)
      // 3. Natural speech pause: voice was detected, speaker paused > 600ms, and we have >= 700ms audio
      const isIntervalReached = currentDurationMs >= chunkDurationMs;
      const isNaturalPause =
        hasVoiceInWindowRef.current &&
        !isSpeakingStateRef.current &&
        now - lastVoiceTimeRef.current > 600 &&
        currentDurationMs >= 700;

      if (!force && !isIntervalReached && !isNaturalPause) {
        return;
      }

      // If speech was present in this window (or forced), package and emit WAV
      if (hasVoiceInWindowRef.current || force) {
        const totalLen = totalSamplesRef.current;
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const buf of pcmBuffersRef.current) {
          merged.set(buf, offset);
          offset += buf.length;
        }

        // Reset buffers
        pcmBuffersRef.current = [];
        totalSamplesRef.current = 0;
        hasVoiceInWindowRef.current = false;

        // Downsample to 16,000Hz mono
        const downsampled = downsampleTo16k(merged, sampleRate);
        // Encode into standard RFC 2361 RIFF WAV container
        const wavBlob = encodeWAV(downsampled, 16000);
        const emittedDuration = Math.round((downsampled.length / 16000) * 1000);

        console.log(`[AudioPipeline] Emitting 16kHz WAV slice: ${wavBlob.size} bytes (${emittedDuration}ms)`);
        onAudioChunkReady?.(wavBlob, emittedDuration);
      } else {
        // Pure silence window: silently discard to prevent sending silence to Whisper
        pcmBuffersRef.current = [];
        totalSamplesRef.current = 0;
        hasVoiceInWindowRef.current = false;
      }
    },
    [chunkDurationMs, onAudioChunkReady]
  );

  // Real-time visual level monitoring loop
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
      lastVoiceTimeRef.current = now;
      hasVoiceInWindowRef.current = true;
      if (!isSpeakingStateRef.current) {
        isSpeakingStateRef.current = true;
        setIsSpeaking(true);
        onSpeechActivityChange?.(true);
      }
    } else {
      if (isSpeakingStateRef.current && now - lastVoiceTimeRef.current > 650) {
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
      console.log('[AudioPipeline] Requesting microphone access...');
      setIsConnecting(true);
      setError(null);

      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      // Universal audio capture constraints with fallback
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        console.warn('[AudioPipeline] Preferred audio constraints failed, falling back to audio: true', err);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      streamRef.current = stream;
      console.log('[AudioPipeline] Microphone granted. Active tracks:', stream.getAudioTracks().length);

      // Create Web Audio context for PCM sampling and visual metering
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported in this browser.');
      }

      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Analyser for visual volume meter
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      // ScriptProcessorNode for lossless continuous PCM buffering
      const bufferSize = 4096;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      // Route audio to muted gain node to prevent speaker feedback while keeping processor active
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      muteGainRef.current = muteGain;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Create an independent copy of PCM samples
        const copy = new Float32Array(inputData.length);
        copy.set(inputData);
        pcmBuffersRef.current.push(copy);
        totalSamplesRef.current += copy.length;
      };

      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      // Reset buffers
      pcmBuffersRef.current = [];
      totalSamplesRef.current = 0;
      hasVoiceInWindowRef.current = false;
      isSpeakingStateRef.current = false;

      // Start volume monitor loop
      monitorVolume();

      // Check chunk flush criteria periodically (every 100ms)
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
      }
      flushIntervalRef.current = setInterval(() => {
        flushChunk(false);
      }, 100);

      setIsRecording(true);
      setIsConnecting(false);
      console.log(`[AudioPipeline] Live recording active @ ${audioCtx.sampleRate}Hz.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access failed.';
      console.error('[AudioPipeline] Microphone error:', err);
      setError(msg);
      setIsRecording(false);
      setIsConnecting(false);
    }
  }, [flushChunk, monitorVolume]);

  // Stop recording
  const stopRecording = useCallback(() => {
    console.log('[AudioPipeline] Stopping audio capture...');
    setIsConnecting(false);

    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Flush any remaining buffered speech
    try {
      flushChunk(true);
    } catch {
      // ignore
    }

    // Disconnect Web Audio nodes
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
    }

    if (muteGainRef.current) {
      try {
        muteGainRef.current.disconnect();
      } catch {
        // ignore
      }
      muteGainRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    pcmBuffersRef.current = [];
    totalSamplesRef.current = 0;
    hasVoiceInWindowRef.current = false;
    isSpeakingStateRef.current = false;

    setIsRecording(false);
    setIsSpeaking(false);
    setAudioLevel(0);
  }, [flushChunk]);

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
