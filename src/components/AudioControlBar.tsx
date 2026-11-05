'use client';

import React from 'react';
import { PipelineStatus } from '@/types/translation';
import { Mic, MicOff, Radio, Square, Volume2 } from 'lucide-react';

interface AudioControlBarProps {
  status: PipelineStatus;
  audioLevel: number; // 0 to 1
  onToggleMic: () => void;
  latencyMs?: number;
}

export function AudioControlBar({
  status,
  audioLevel,
  onToggleMic,
  latencyMs,
}: AudioControlBarProps) {
  const isListening = status === 'listening' || status === 'speech_detected' || status === 'analyzing';

  return (
    <footer className="sticky bottom-0 z-20 backdrop-blur-xl bg-neutral-950/90 border-t border-neutral-800/80 p-4 sm:p-5">
      <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
        {/* Latency & Status info on left */}
        <div className="hidden sm:flex flex-col text-left">
          <span className="text-[11px] text-neutral-400 font-medium flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-indigo-400" />
            Vercel + Whisper & Claude
          </span>
          <span className="text-[10px] text-neutral-500 font-mono">
            {latencyMs ? `Latency: ~${latencyMs}ms` : 'Target: <800ms'}
          </span>
        </div>

        {/* Center: Live Audio Level & Main Mic Button */}
        <div className="flex items-center gap-4 mx-auto sm:mx-0">
          {/* Animated audio wave bars */}
          <div className="flex items-center gap-1 h-8 px-2">
            {[0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.3].map((multiplier, i) => {
              const height = isListening
                ? Math.max(6, Math.min(28, (audioLevel * multiplier * 36) + (status === 'speech_detected' ? 12 : 4)))
                : 4;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-75 ${isListening
                      ? status === 'speech_detected'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                      : 'bg-neutral-700'
                    }`}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          {/* Primary Action Button */}
          <div className="relative flex items-center justify-center">
            {/* Pulsing ring during active listening */}
            {isListening && (
              <span
                className={`absolute w-16 h-16 rounded-full opacity-30 animate-ping pointer-events-none ${
                  status === 'speech_detected' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMic();
              }}
              aria-label={isListening ? 'Stop Listening' : 'Start Listening'}
              className={`relative z-10 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl cursor-pointer transition-all transform active:scale-95 ${
                isListening
                  ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/25 ring-4 ring-rose-500/20'
                  : 'bg-gradient-to-tr from-indigo-500 via-indigo-600 to-emerald-500 hover:opacity-95 shadow-indigo-500/30'
              }`}
            >
              {isListening ? (
                <Square className="w-5 h-5 fill-current" />
              ) : (
                <Mic className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Audio hint */}
          <span className="text-xs font-medium text-neutral-300 w-24">
            {isListening ? (status === 'speech_detected' ? 'Speaking...' : 'Listening...') : 'Tap to start'}
          </span>
        </div>

        {/* Mobile latency badge */}
        <div className="sm:hidden text-right">
          <span className="text-[10px] text-neutral-500 font-mono">
            {latencyMs ? `${latencyMs}ms` : 'Ready'}
          </span>
        </div>
      </div>
    </footer>
  );
}

