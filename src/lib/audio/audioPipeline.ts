/**
 * Audio Pipeline Utilities
 * Handles Web Audio API setup, 16kHz mono capture constraints,
 * live audio level analysis, and audio chunk buffering.
 */

export interface AudioPipelineConfig {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export const DEFAULT_AUDIO_CONFIG: AudioPipelineConfig = {
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Checks supported MIME types for audio recording in the current browser.
 */
export function getSupportedMimeType(): string {
  if (typeof window === 'undefined' || !window.MediaRecorder) {
    return 'audio/webm';
  }

  const preferredTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/aac',
  ];

  for (const type of preferredTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return '';
}

/**
 * Converts a Blob to a base64 string.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      // Strip "data:audio/...;base64," prefix if present
      const cleanBase64 = base64data.includes(',')
        ? base64data.split(',')[1]
        : base64data;
      resolve(cleanBase64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

