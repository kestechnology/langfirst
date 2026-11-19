'use client';

import React from 'react';
import { PipelineStatus } from '@/types/translation';
import { AlertCircle, ChevronDown, FileText, History, Languages, Loader2, Sparkles, Upload } from 'lucide-react';
import { SUPPORTED_SOURCE_LANGUAGES } from '@/config/languages';

interface HeaderProps {
  status: PipelineStatus;
  isBilingual: boolean;
  onToggleBilingual: () => void;
  onClear: () => void;
  onOpenUpload: () => void;
  onOpenHistory: () => void;
  onGenerateReport: () => void;
  messageCount: number;
  selectedSourceLanguage: string;
  onSelectSourceLanguage: (langCode: string) => void;
}

export function Header({
  status,
  isBilingual,
  onToggleBilingual,
  onClear,
  onOpenUpload,
  onOpenHistory,
  onGenerateReport,
  messageCount,
  selectedSourceLanguage,
  onSelectSourceLanguage,
}: HeaderProps) {
  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            Requesting Mic...
          </span>
        );
      case 'listening':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Listening
          </span>
        );
      case 'speech_detected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            Speech Detected
          </span>
        );
      case 'analyzing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            Translating
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            Mic Error
          </span>
        );
      case 'idle':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
            <span className="w-2 h-2 rounded-full bg-neutral-500" />
            Ready
          </span>
        );
    }
  };

  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-neutral-950/80 border-b border-neutral-800/80 px-4 sm:px-6 py-3.5 transition-all">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        {/* Brand & Language Pair */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 p-[1px] shadow-lg shadow-indigo-500/10">
            <div className="w-full h-full bg-neutral-950 rounded-[11px] flex items-center justify-center">
              <Languages className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-white">LangFirst</h1>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                Live
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="relative inline-flex items-center">
                <select
                  value={selectedSourceLanguage}
                  onChange={(e) => onSelectSourceLanguage(e.target.value)}
                  className="appearance-none bg-neutral-900 hover:bg-neutral-850 text-indigo-300 hover:text-white text-xs font-medium pl-2 pr-5 py-0.5 rounded-md border border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  aria-label="Speaker language selector"
                  title="Speaker language (Edo by default)"
                >
                  {SUPPORTED_SOURCE_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code} className="bg-neutral-900 text-neutral-100">
                      {lang.name} {lang.isDefault ? '★ (Default)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-1.5 pointer-events-none" />
              </div>
              <span className="text-neutral-600 text-xs font-mono">→</span>
              <span className="text-neutral-200 text-xs font-medium px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">
                English
              </span>
            </div>
          </div>
        </div>

        {/* Center: Live Pipeline Status Indicator */}
        <div className="hidden md:flex items-center gap-2">
          {getStatusBadge()}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Executive Report Button */}
          {messageCount > 0 && (
            <button
              onClick={onGenerateReport}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-300 hover:text-white bg-indigo-950/60 border border-indigo-800/60 hover:bg-indigo-900/60 transition-colors shadow-sm"
              title="Generate Conversation Executive Report"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Report</span>
            </button>
          )}

          {/* Upload Button */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors"
            title="Upload Audio File (.mp3, .wav, .m4a)"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Upload</span>
          </button>

          {/* History Button */}
          <button
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors"
            title="History & Export"
          >
            <History className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Bilingual / Translation Only Toggle */}
          <button
            onClick={onToggleBilingual}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              isBilingual
                ? 'bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700'
                : 'bg-indigo-950/60 text-indigo-300 border-indigo-800/50 hover:bg-indigo-900/60'
            }`}
            title="Toggle between Bilingual (Native + English) and Translation Only"
          >
            {isBilingual ? 'Bilingual' : 'English Only'}
          </button>

          {/* Clear Session */}
          {messageCount > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1.5 rounded-md hover:bg-neutral-800/60 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
