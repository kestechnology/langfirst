import { encodeWAV } from './wavEncoder';

export interface AudioSlice {
  index: number;
  blob: Blob;
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
}

/**
 * Decodes an audio file in-browser and slices it into segments (e.g. 10s slices)
 * rendered to 16kHz mono WAV for sequential streaming to Gemini.
 */
export async function sliceAudioFile(
  file: File,
  sliceDurationSec: number = 10,
  onProgress?: (progressPercent: number) => void
): Promise<AudioSlice[]> {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass({ sampleRate: 16000 });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const decodedAudio = await audioCtx.decodeAudioData(arrayBuffer);

    const targetSampleRate = 16000;
    const totalDurationSec = decodedAudio.duration;
    const slicesCount = Math.ceil(totalDurationSec / sliceDurationSec);
    const slices: AudioSlice[] = [];

    // Extract mono channel data (or mixdown stereo)
    const numberOfChannels = decodedAudio.numberOfChannels;
    const length = decodedAudio.length;
    const monoChannel = new Float32Array(length);

    if (numberOfChannels === 1) {
      monoChannel.set(decodedAudio.getChannelData(0));
    } else {
      const left = decodedAudio.getChannelData(0);
      const right = decodedAudio.getChannelData(1);
      for (let i = 0; i < length; i++) {
        monoChannel[i] = (left[i] + right[i]) / 2;
      }
    }

    const samplesPerSlice = sliceDurationSec * decodedAudio.sampleRate;

    for (let i = 0; i < slicesCount; i++) {
      const startSample = i * samplesPerSlice;
      const endSample = Math.min(length, (i + 1) * samplesPerSlice);
      const sliceLength = endSample - startSample;

      if (sliceLength <= 0) break;

      const sliceData = monoChannel.subarray(startSample, endSample);

      // Resample to 16kHz if needed (or encode directly if already 16kHz)
      let resampledData: Float32Array;
      if (decodedAudio.sampleRate === targetSampleRate) {
        resampledData = sliceData;
      } else {
        resampledData = resampleBuffer(sliceData, decodedAudio.sampleRate, targetSampleRate);
      }

      const wavBlob = encodeWAV(resampledData, targetSampleRate);
      const startTimeSec = i * sliceDurationSec;
      const endTimeSec = Math.min(totalDurationSec, (i + 1) * sliceDurationSec);

      slices.push({
        index: i,
        blob: wavBlob,
        startTimeSec,
        endTimeSec,
        durationSec: endTimeSec - startTimeSec,
      });

      onProgress?.(Math.round(((i + 1) / slicesCount) * 100));
    }

    return slices;
  } finally {
    audioCtx.close().catch(() => {});
  }
}

/**
 * Simple linear interpolation audio resampler.
 */
function resampleBuffer(
  buffer: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (sourceRate === targetRate) return buffer;
  const ratio = sourceRate / targetRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originalPos = i * ratio;
    const index = Math.floor(originalPos);
    const fraction = originalPos - index;

    if (index + 1 < buffer.length) {
      result[i] = buffer[index] * (1 - fraction) + buffer[index + 1] * fraction;
    } else {
      result[i] = buffer[index] || 0;
    }
  }

  return result;
}

