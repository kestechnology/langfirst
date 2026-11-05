'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/Header';
import { DialogueStream } from '@/components/DialogueStream';
import { AudioControlBar } from '@/components/AudioControlBar';
import { AudioUploadModal } from '@/components/AudioUploadModal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { ConversationReportModal } from '@/components/ConversationReportModal';
import { TranslationMessage, PipelineStatus } from '@/types/translation';
import { useAudioPipeline } from '@/hooks/useAudioPipeline';
import { useTranslationStream } from '@/hooks/useTranslationStream';
import { saveSession } from '@/lib/storage/transcriptStorage';
import { AlertTriangle } from 'lucide-react';

export default function Home() {
  const [activeStatus, setActiveStatus] = useState<PipelineStatus>('idle');
  const [isBilingual, setIsBilingual] = useState<boolean>(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Translation stream hook
  const {
    messages,
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
      // Auto-save session to local storage when new message arrives
      saveSession([...messages, newMsg]);
    },
  });

  // Audio Pipeline for live Web Audio capture, 16kHz WAV rolling slicing & volume metering
  const {
    isRecording,
    isConnecting,
    audioLevel,
    isSpeaking,
    error: audioError,
    clearError,
    startRecording,
    stopRecording,
  } = useAudioPipeline({
    onAudioChunkReady: (chunkBlob, durationMs) => {
      // Audio slice captured: dispatch to translation engine
      console.log(`[AudioPipeline] Captured speech slice: ${chunkBlob.size} bytes (${durationMs}ms)`);
      processAudioSlice(chunkBlob, durationMs, true);
    },
    onSpeechActivityChange: (speaking) => {
      if (speaking) {
        setActiveStatus('speech_detected');
      } else {
        setActiveStatus('listening');
      }
    },
    chunkDurationMs: 2200,
  });

  const handleToggleMic = async () => {
    if (isRecording) {
      stopRecording();
      setActiveStatus('idle');
    } else {
      setActiveStatus('connecting');
      clearError();
      await startRecording();
    }
  };

  const handleClear = () => {
    clearMessages();
    setReportContent(null);
  };

  const handleLoadSession = (loadedMessages: TranslationMessage[]) => {
    setManualMessages(loadedMessages);
  };

  // Generate Executive Conversation Report
  const handleGenerateReport = async () => {
    if (messages.length === 0) return;

    try {
      setIsReportOpen(true);
      setIsReportLoading(true);

      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate report.');
      }

      const data = await res.json();
      setReportContent(data.report || 'Report could not be generated.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Report generation error';
      setReportContent(`Error: ${msg}`);
    } finally {
      setIsReportLoading(false);
    }
  };

  // Derive unified pipeline status
  const currentStatus: PipelineStatus = (audioError || sessionError)
    ? 'error'
    : isConnecting || (activeStatus === 'connecting' && !isRecording)
    ? 'connecting'
    : isTranslating
    ? 'analyzing'
    : isSpeaking
    ? 'speech_detected'
    : isRecording
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
        onGenerateReport={handleGenerateReport}
        messageCount={messages.length}
      />

      {/* Error banner if microphone access or session fails */}
      {(audioError || sessionError) && (
        <div className="bg-rose-950/80 border-b border-rose-800 text-rose-200 px-4 py-2 text-xs text-center">
          {audioError || sessionError}
        </div>
      )}

      {/* Central Dialogue Stream */}
      <DialogueStream
        messages={messages}
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
        onBatchComplete={(newMsgs) => setManualMessages([...messages, ...newMsgs])}
        onProcessSlice={processAudioSlice}
      />

      {/* History & Export Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        currentMessages={messages}
        isBilingual={isBilingual}
        onLoadSession={handleLoadSession}
      />

      {/* Conversation Report Modal */}
      <ConversationReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportContent={reportContent}
        isLoading={isReportLoading}
      />
    </div>
  );
}
