'use client';

import React, { useState } from 'react';
import { FileText, Download, Copy, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { triggerDownload } from '@/lib/export/exportUtils';

interface ConversationReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportContent: string | null;
  isLoading: boolean;
}

export function ConversationReportModal({
  isOpen,
  onClose,
  reportContent,
  isLoading,
}: ConversationReportModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!reportContent) return;
    navigator.clipboard.writeText(reportContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!reportContent) return;
    triggerDownload(
      reportContent,
      `langfirst-conversation-report-${Date.now()}.md`,
      'text/markdown;charset=utf-8'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Conversation Executive Report</h3>
              <p className="text-xs text-neutral-400">AI-generated summary, key takeaways, and action items</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-neutral-200 text-sm leading-relaxed">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
              <p className="text-sm font-medium text-white">Analyzing conversation with Claude...</p>
              <p className="text-xs text-neutral-400 mt-1">
                Extracting takeaways, cultural context, and action items
              </p>
            </div>
          ) : reportContent ? (
            <div className="prose prose-invert max-w-none space-y-3 whitespace-pre-wrap font-sans text-xs sm:text-sm">
              {reportContent}
            </div>
          ) : (
            <div className="py-12 text-center text-neutral-500 text-sm">
              No report available yet. Speak more to generate an analysis.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {reportContent && !isLoading && (
          <div className="flex items-center justify-between p-4 border-t border-neutral-800 bg-neutral-950/40">
            <span className="text-xs text-neutral-500 font-mono">Claude 3.5 / Haiku Analysis</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 border border-neutral-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-emerald-500 hover:opacity-90 text-xs font-medium text-white transition-opacity shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Download Report (.md)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
