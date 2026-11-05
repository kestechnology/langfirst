'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/Header';
import { DialogueStream } from '@/components/DialogueStream';
import { AudioControlBar } from '@/components/AudioControlBar';
import { AudioUploadModal } from '@/components/AudioUploadModal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { TranslationMessage, PipelineStatus } from '@/types/translation';
import { useAudioPipeline } from '@/hooks/useAudioPipeline';
import { useVadPipeline } from '@/hooks/useVadPipeline';
import { useTranslationStream } from '@/hooks/useTranslationStream';
import { saveSession } from '@/lib/storage/transcriptStorage';
import { AlertTriangle } from 'lucide-react';

const INITIAL_DEMO_MESSAGES: TranslationMessage[] = [
  {
    id: 'demo-1',
    speaker: 'Speaker A',
    detected_lang: 'Esan',
    transcription: 'Ọ nan a gbe erọlọ',
    translation: 'It takes patience and perseverance.',
    is_final: true,
    timestamp: 1730800000000,
  },
  {
    id: 'demo-2',
    speaker: 'Speaker B',
    detected_lang: 'Nigerian English',
    transcription: 'True talk my brother, we go dey alright.',
    translation: 'That is the absolute truth my brother, we will be fine.',
    is_final: true,
    timestamp: 1730800060000,
  },
  {
    id: 'demo-3',
    speaker: 'Speaker A',
    detected_lang: 'Esan',
    transcription: 'Ọya waigbe, ẹkpafọ kẹina.',
    translation: 'Perseverance is key, that is all that matters.',
    is_final: true,
    timestamp: 1730800120000,
  },
];

export default function Home() {
  const [activeStatus, setActiveStatus] = useState<PipelineStatus>('idle');
  const [isBilingual, setIsBilingual] = useState<boolean>(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Translation stream hook with retry and session rollover
  const {
    messages: liveMessages,
    interimMessage,
    isTranslating,
    latestLatencyMs,
    sessionError,
    processAudioSlice,
    clearMessages,
    setManualMessages,
  } = useTranslationStream({
    onStatusChange: (newStatus) => {
      setActiveStatus(newStatus);
    },
    onNewMessage: (newMsg) => {
      // Auto-save to local storage when new message arrives
      saveSession([...liveMessages, newMsg]);
    },
  });

  // Display initial demo messages until live messages start arriving
  const displayMessages = liveMessages.length > 0 ? liveMessages : INITIAL_DEMO_MESSAGES;

  // VAD Pipeline for client-side voice activity detection & dynamic slicing
  const {
    isVadActive,
    isSpeaking,
    isLoading: isVadLoading,
    error: vadError,
    startVad,
    stopVad,
  } = useVadPipeline({
    onSpeechSlice: (sliceBlob, durationMs, isFinal) => {
      processAudioSlice(sliceBlob, durationMs, isFinal);
    },
    onSpeechStart: () => {
      setActiveStatus('speech_detected');
    },
    onSpeechEnd: () => {
      setActiveStatus('analyzing');
    },
  });

  // Audio Pipeline for live Web Audio frequency, waveform & volume diagnostics
  const {
    isRecording,
    audioLevel,
    error: audioError,
    lowVolumeWarning,
    startRecording,
    stopRecording,
  } = useAudioPipeline();

  const handleToggleMic = async () => {
    if (isRecording || isVadActive) {
      stopRecording();
      stopVad();
      setActiveStatus('idle');
    } else {
      setActiveStatus('listening');
      await startRecording();
      await startVad();
    }
  };

  const handleClear = () => {
    clearMessages();
  };

  const handleLoadSession = (loadedMessages: TranslationMessage[]) => {
    setManualMessages(loadedMessages);
  };

  // Derive unified pipeline status
  const currentStatus: PipelineStatus = (audioError || vadError || sessionError)
    ? 'error'
    : isTranslating
    ? 'analyzing'
    : isSpeaking
    ? 'speech_detected'
    : isRecording || isVadActive
    ? 'listening'
    : 'idle';

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Top Status Indicator and Controls */}
      <Header
        status={currentStatus}
        isBilingual={isBilingual}
        onToggleBilingual={() => setIsBilingual(!isBilingual)}
        onClear={handleClear}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        messageCount={displayMessages.length}
      />

      {/* Low volume diagnostic alert */}
      {lowVolumeWarning && isRecording && (
        <div className="bg-amber-950/80 border-b border-amber-800 text-amber-200 px-4 py-1.5 text-xs flex items-center justify-center gap-1.5 animate-in fade-in">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          Low microphone input detected. Please speak closer or check your microphone selector.
        </div>
      )}

      {/* Error banner if microphone access or session fails */}
      {(audioError || vadError || sessionError) && (
        <div className="bg-rose-950/80 border-b border-rose-800 text-rose-200 px-4 py-2 text-xs text-center">
          {audioError || vadError || sessionError}
        </div>
      )}

      {/* Central Dialogue Stream */}
      <DialogueStream
        messages={displayMessages}
        interimMessage={interimMessage}
        status={currentStatus}
        isBilingual={isBilingual}
        onStartListening={handleToggleMic}
      />

      {/* Bottom Audio Control Bar */}
      <AudioControlBar
        status={currentStatus}
        audioLevel={audioLevel}
        onToggleMic={handleToggleMic}
        latencyMs={latestLatencyMs || 640}
      />

      {/* Audio File Upload Modal */}
      <AudioUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onBatchComplete={(newMsgs) => setManualMessages([...liveMessages, ...newMsgs])}
        onProcessSlice={processAudioSlice}
      />

      {/* History & Export Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        currentMessages={displayMessages}
        isBilingual={isBilingual}
        onLoadSession={handleLoadSession}
      />
    </div>
  );
}
