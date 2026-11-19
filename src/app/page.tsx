'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { DEFAULT_SOURCE_LANGUAGE, getSourceLanguageByCode, SUPPORTED_SOURCE_LANGUAGES } from '@/config/languages';
import { AlertCircle, ChevronDown, Globe, X } from 'lucide-react';

export default function Home() {
  const [selectedSourceLanguage, setSelectedSourceLanguage] = useState<string>(DEFAULT_SOURCE_LANGUAGE.code);
  const [suggestedSwitch, setSuggestedSwitch] = useState<{ langName: string; langCode: string } | null>(null);
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

  const currentLanguageConfig = getSourceLanguageByCode(selectedSourceLanguage);

  const handleLanguageMismatch = useCallback((suggestedLang: string) => {
    const match = SUPPORTED_SOURCE_LANGUAGES.find(
      (l) =>
        l.name.toLowerCase().includes(suggestedLang.toLowerCase()) ||
        suggestedLang.toLowerCase().includes(l.name.toLowerCase())
    );
    setSuggestedSwitch({
      langName: suggestedLang,
      langCode: match ? match.code : 'auto',
    });
  }, []);

  const handleSwitchLanguage = useCallback((langNameOrCode: string) => {
    const match = SUPPORTED_SOURCE_LANGUAGES.find(
      (l) =>
        l.code.toLowerCase() === langNameOrCode.toLowerCase() ||
        l.name.toLowerCase().includes(langNameOrCode.toLowerCase())
    );
    setSelectedSourceLanguage(match ? match.code : 'auto');
    setSuggestedSwitch(null);
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
    selectedSourceLanguage,
    onNewMessage: (newMsg) => {
      saveSession([...messages, newMsg]);
    },
    onLanguageMismatch: handleLanguageMismatch,
  });

  // Audio Pipeline for live Web Audio capture, rolling slicing & volume metering
  const handleAudioChunkReady = React.useCallback(
    (chunkBlob: Blob, durationMs: number) => {
      console.log(`[AudioPipeline] Captured speech slice: ${chunkBlob.size} bytes (${durationMs}ms)`);
      processAudioSlice(chunkBlob, durationMs, true, selectedSourceLanguage);
    },
    [processAudioSlice, selectedSourceLanguage]
  );

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
    onAudioChunkReady: handleAudioChunkReady,
    chunkDurationMs: 4500,
  });

  const handleToggleMic = React.useCallback(async () => {
    if (isRecording) {
      stopRecording();
    } else {
      clearError();
      await startRecording();
    }
  }, [clearError, isRecording, startRecording, stopRecording]);

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

  // Derive unified pipeline status directly from actual live states
  const currentStatus: PipelineStatus = (audioError || sessionError)
    ? 'error'
    : isTranslating
    ? 'analyzing'
    : isSpeaking
    ? 'speech_detected'
    : isRecording
    ? 'listening'
    : isConnecting
    ? 'connecting'
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
        selectedSourceLanguage={selectedSourceLanguage}
        onSelectSourceLanguage={setSelectedSourceLanguage}
      />

      {/* Prominent Speaker Language Selector Bar */}
      <div className="bg-neutral-900 border-b border-neutral-800/90 px-4 py-2.5 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-300">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Speaker Language:
            </span>
            <div className="relative inline-flex items-center">
              <select
                value={selectedSourceLanguage}
                onChange={(e) => setSelectedSourceLanguage(e.target.value)}
                className="appearance-none bg-neutral-800 hover:bg-neutral-750 text-white font-medium text-xs sm:text-sm pl-3 pr-8 py-1.5 rounded-lg border border-indigo-500/50 hover:border-indigo-400 shadow-sm shadow-indigo-500/10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                aria-label="Speaker language selector"
              >
                {SUPPORTED_SOURCE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-neutral-900 text-white">
                    {lang.name} {lang.isDefault ? '★ (Default)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-indigo-300 absolute right-2 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-400">Target:</span>
            <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold text-xs">
              🇬🇧 English (Live)
            </span>
          </div>
        </div>
      </div>

      {/* Language Mismatch Suggestion Banner */}
      {suggestedSwitch && (
        <div className="bg-amber-950/70 border-b border-amber-700/60 px-4 py-2 text-xs text-amber-200 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Speaker sounds like they are speaking <strong>{suggestedSwitch.langName}</strong> (different from selected{' '}
              <strong>{currentLanguageConfig.name}</strong>).
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setSelectedSourceLanguage(suggestedSwitch.langCode);
                setSuggestedSwitch(null);
              }}
              className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 hover:text-white font-medium transition-colors border border-amber-500/40 cursor-pointer"
            >
              Switch to {suggestedSwitch.langName}
            </button>
            <button
              onClick={() => setSuggestedSwitch(null)}
              className="text-neutral-400 hover:text-white p-1 cursor-pointer"
              title="Dismiss suggestion"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
        selectedLanguageName={currentLanguageConfig.name}
        onSwitchLanguage={handleSwitchLanguage}
      />

      {/* Bottom Audio Control Bar */}
      <AudioControlBar
        status={currentStatus}
        audioLevel={audioLevel}
        onToggleMic={handleToggleMic}
        latencyMs={latestLatencyMs || 640}
        selectedLanguageName={currentLanguageConfig.name}
      />

      {/* Audio File Upload Modal */}
      <AudioUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onBatchComplete={(newMsgs) => setManualMessages([...messages, ...newMsgs])}
        onProcessSlice={processAudioSlice}
        selectedSourceLanguage={selectedSourceLanguage}
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
