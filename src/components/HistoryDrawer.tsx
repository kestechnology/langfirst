'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Download,
  FileText,
  Search,
  Trash2,
  X,
  FileCode,
  Check,
  Copy,
} from 'lucide-react';
import {
  SavedSession,
  getSavedSessions,
  deleteSession,
  searchSessions,
} from '@/lib/storage/transcriptStorage';
import {
  downloadTxt,
  downloadSrt,
  generateTxtContent,
} from '@/lib/export/exportUtils';
import { TranslationMessage } from '@/types/translation';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentMessages: TranslationMessage[];
  isBilingual: boolean;
  onLoadSession: (messages: TranslationMessage[]) => void;
}

export function HistoryDrawer({
  isOpen,
  onClose,
  currentMessages,
  isBilingual,
  onLoadSession,
}: HistoryDrawerProps) {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSessions(getSavedSessions());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    setSessions(searchSessions(q));
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(id);
    setSessions(searchSessions(searchQuery));
  };

  const handleCopyCurrent = () => {
    const content = generateTxtContent(currentMessages, isBilingual);
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-neutral-900 border-l border-neutral-800 h-full flex flex-col p-6 shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">History & Export</h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Session Quick Export */}
        {currentMessages.length > 0 && (
          <div className="py-4 border-b border-neutral-800 space-y-2">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Active Session ({currentMessages.length} phrases)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => downloadTxt(currentMessages, isBilingual)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 border border-neutral-700 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                .TXT
              </button>
              <button
                onClick={() => downloadSrt(currentMessages, isBilingual)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 border border-neutral-700 transition-colors"
              >
                <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                .SRT
              </button>
              <button
                onClick={handleCopyCurrent}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 border border-neutral-700 transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-neutral-400" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="py-4">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search past conversations..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Past Sessions List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-xs">
              {searchQuery ? 'No matching conversations found.' : 'No saved sessions yet.'}
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  onLoadSession(s.messages);
                  onClose();
                }}
                className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80 hover:border-neutral-700 cursor-pointer group transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-medium text-neutral-200 line-clamp-1">
                    {s.title}
                  </p>
                  <button
                    onClick={(e) => handleDelete(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-rose-400 transition-opacity"
                    title="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                  <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                  <span>{s.messages.length} messages</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

