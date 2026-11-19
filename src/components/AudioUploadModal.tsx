'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileAudio, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { sliceAudioFile, AudioSlice } from '@/lib/audio/audioFileSlicer';
import { TranslationMessage } from '@/types/translation';

interface AudioUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchComplete: (messages: TranslationMessage[]) => void;
  onProcessSlice: (blob: Blob, durationMs: number, isFinal: boolean, overrideLang?: string) => Promise<void>;
  selectedSourceLanguage?: string;
}

export function AudioUploadModal({
  isOpen,
  onClose,
  onBatchComplete,
  onProcessSlice,
  selectedSourceLanguage = 'edo',
}: AudioUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'slicing' | 'translating' | 'done' | 'error'>('idle');
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentSliceIndex, setCurrentSliceIndex] = useState(0);
  const [totalSlices, setTotalSlices] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setStatus('idle');
    setErrorMessage(null);
  };

  const handleStartProcessing = async () => {
    if (!selectedFile) return;

    try {
      setStatus('slicing');
      setProgressPercent(0);

      // Slice audio in-browser into 10-second segments
      const slices = await sliceAudioFile(selectedFile, 10, (pct) => {
        setProgressPercent(pct);
      });

      if (slices.length === 0) {
        throw new Error('No audio data could be extracted from this file.');
      }

      setTotalSlices(slices.length);
      setStatus('translating');

      // Sequentially stream slices through the translation engine
      for (let i = 0; i < slices.length; i++) {
        setCurrentSliceIndex(i + 1);
        const slice = slices[i];
        await onProcessSlice(
          slice.blob,
          slice.durationSec * 1000,
          i === slices.length - 1,
          selectedSourceLanguage
        );
      }

      setStatus('done');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Audio processing failed.';
      setErrorMessage(msg);
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileAudio className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">Upload Audio / Voice Note</h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-neutral-700 hover:border-neutral-600 bg-neutral-950/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
            className="hidden"
            onChange={handleFileChange}
          />
          <Upload className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
          {selectedFile ? (
            <div>
              <p className="text-sm font-medium text-white">{selectedFile.name}</p>
              <p className="text-xs text-neutral-400 mt-1">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to slice & translate
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-neutral-200">
                Drag & drop voice note here, or <span className="text-indigo-400">browse</span>
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Supports .mp3, .m4a, .wav, .ogg, .aac (auto-sliced into 10s windows)
              </p>
            </div>
          )}
        </div>

        {/* Progress or Status */}
        {status === 'slicing' && (
          <div className="mt-4 p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/40 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-xs text-indigo-200">
              Slicing audio in-browser: {progressPercent}%
            </span>
          </div>
        )}

        {status === 'translating' && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
            <span className="text-xs text-emerald-200">
              Translating slice {currentSliceIndex} of {totalSlices}...
            </span>
          </div>
        )}

        {status === 'done' && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center gap-3 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Audio processing complete! Assembling transcript...
          </div>
        )}

        {status === 'error' && (
          <div className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 flex items-center gap-3 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            {errorMessage}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!selectedFile || status === 'slicing' || status === 'translating'}
            onClick={handleStartProcessing}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-indigo-500 to-emerald-500 text-white disabled:opacity-50 hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/20"
          >
            Start Translation
          </button>
        </div>
      </div>
    </div>
  );
}

