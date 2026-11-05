'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TranslationMessage, PipelineStatus } from '@/types/translation';
import { Check, Copy, MessageSquare, Mic, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DialogueStreamProps {
  messages: TranslationMessage[];
  interimMessage?: TranslationMessage | null;
  status: PipelineStatus;
  isBilingual: boolean;
  onStartListening: () => void;
}

export function DialogueStream({
  messages,
  interimMessage,
  status,
  isBilingual,
  onStartListening,
}: DialogueStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimMessage]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getSpeakerStyles = (speaker: string) => {
    const isA = speaker.toLowerCase().includes('a') || speaker === 'User';
    return {
      badgeBg: isA ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      borderAccent: isA ? 'border-l-indigo-500' : 'border-l-emerald-500',
    };
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4 max-w-4xl w-full mx-auto">
      {/* Empty State */}
      {messages.length === 0 && !interimMessage && (
        <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4 text-neutral-500 shadow-inner">
            <Mic className="w-7 h-7 text-neutral-400 animate-pulse" />
          </div>
          <h2 className="text-lg font-medium text-white mb-1">
            Real-Time Esan to English Translation
          </h2>
          <p className="text-sm text-neutral-400 max-w-md mb-6 leading-relaxed">
            Speak in Esan (Central Edo) or Nigerian English. Speech will be processed in rolling slices with live bilingual subtitles.
          </p>
          <button
            onClick={onStartListening}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-500 text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/20"
          >
            <Mic className="w-4 h-4" />
            Start Listening
          </button>
        </div>
      )}

      {/* Message List */}
      <AnimatePresence initial={false}>
        {messages.map((msg) => {
          const styles = getSpeakerStyles(msg.speaker);
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`group relative p-4 rounded-2xl bg-neutral-900/90 border border-neutral-800/80 border-l-4 ${styles.borderAccent} shadow-sm hover:border-neutral-700/80 transition-all`}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${styles.badgeBg}`}>
                    {msg.speaker || 'Speaker'}
                  </span>
                  {msg.detected_lang && (
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 px-1.5 py-0.5 rounded bg-neutral-800 font-mono">
                      {msg.detected_lang}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <button
                    onClick={() => copyToClipboard(msg.translation, msg.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-white p-1 rounded"
                    title="Copy English translation"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Dual-Channel Content */}
              <div className="space-y-1.5">
                {isBilingual && msg.transcription && (
                  <p className="text-sm italic text-neutral-400 font-serif leading-relaxed">
                    &ldquo;{msg.transcription}&rdquo;
                  </p>
                )}
                <p className="text-base font-semibold text-neutral-100 tracking-tight leading-snug">
                  {msg.translation}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Interim / In-Flight Streaming Message */}
      {interimMessage && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative p-4 rounded-2xl bg-neutral-900/60 border border-indigo-500/30 border-l-4 border-l-indigo-400 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {interimMessage.speaker || 'Speaking...'}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-indigo-300 font-medium">
                <Sparkles className="w-3 h-3 animate-spin" />
                Live
              </span>
            </div>
          </div>
          <div className="space-y-1">
            {isBilingual && interimMessage.transcription && (
              <p className="text-sm italic text-neutral-400 font-serif">
                &ldquo;{interimMessage.transcription}&rdquo;
              </p>
            )}
            <p className="text-base font-semibold text-neutral-200">
              {interimMessage.translation || 'Translating incoming slice...'}
            </p>
          </div>
        </motion.div>
      )}

      {/* Bottom anchor for autoscroll */}
      <div ref={bottomRef} />
    </div>
  );
}

