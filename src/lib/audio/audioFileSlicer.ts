import { encodeWAV } from './wavEncoder';

export interface AudioSlice {
  index: number;
  blob: Blob;
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
}

/**
 * Decodes an audio file in-browser and slices it cleanly into high-fidelity
 * 16kHz mono WAV segments.
 *
 * For files <= 30s: emits a single continuous slice for zero word-chopping.
 * For longer files: cuts along natural silence/low-energy valleys to keep words intact.
 */
export async function sliceAudioFile(
  file: File,
  targetSliceDurationSec: number = 15,
  onProgress?: (progressPercent: number) => void
): Promise<AudioSlice[]> {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const audioCtx = new AudioContextClass();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const decodedAudio = await audioCtx.decodeAudioData(arrayBuffer);

    const sourceSampleRate = decodedAudio.sampleRate;
    const totalDurationSec = decodedAudio.duration;
    const length = decodedAudio.length;

    // Extract mono channel data (or mixdown stereo)
    const numberOfChannels = decodedAudio.numberOfChannels;
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

    const slices: AudioSlice[] = [];

    // Case 1: Short audio (<= 30 seconds) -> Process as a single complete segment
    if (totalDurationSec <= 30) {
      const resampledData = resampleBuffer(monoChannel, sourceSampleRate, 16000);
      const wavBlob = encodeWAV(resampledData, 16000);

      slices.push({
        index: 0,
        blob: wavBlob,
        startTimeSec: 0,
        endTimeSec: totalDurationSec,
        durationSec: totalDurationSec,
      });

      onProgress?.(100);
      return slices;
    }

    // Case 2: Longer audio -> Smart VAD silence-boundary slicing
    let currentSample = 0;
    let sliceIndex = 0;
    const targetSamplesPerSlice = Math.round(targetSliceDurationSec * sourceSampleRate);
    const searchWindowSamples = Math.round(2.0 * sourceSampleRate); // +/- 2.0s search window

    while (currentSample < length) {
      const remainingSamples = length - currentSample;

      // If remaining audio is within 1.5x of slice duration, take the rest as the final slice
      if (remainingSamples <= targetSamplesPerSlice * 1.3) {
        const sliceData = monoChannel.subarray(currentSample, length);
        const resampled = resampleBuffer(sliceData, sourceSampleRate, 16000);
        const wavBlob = encodeWAV(resampled, 16000);

        slices.push({
          index: sliceIndex++,
          blob: wavBlob,
          startTimeSec: currentSample / sourceSampleRate,
          endTimeSec: totalDurationSec,
          durationSec: (length - currentSample) / sourceSampleRate,
        });

        break;
      }

      // Ideal boundary point
      const nominalEndSample = currentSample + targetSamplesPerSlice;
      const searchStart = Math.max(currentSample + targetSamplesPerSlice - searchWindowSamples, currentSample);
      const searchEnd = Math.min(nominalEndSample + searchWindowSamples, length);

      // Find the point of minimum acoustic energy in the search window (silence gap)
      let bestCutSample = nominalEndSample;
      let minEnergy = Infinity;
      const step = Math.round(sourceSampleRate * 0.05); // 50ms step

      for (let s = searchStart; s < searchEnd - step; s += step) {
        let energy = 0;
        for (let j = 0; j < step; j++) {
          const val = monoChannel[s + j];
          energy += val * val;
        }
        if (energy < minEnergy) {
          minEnergy = energy;
          bestCutSample = s + Math.round(step / 2);
        }
      }

      const sliceData = monoChannel.subarray(currentSample, bestCutSample);
      const resampled = resampleBuffer(sliceData, sourceSampleRate, 16000);
      const wavBlob = encodeWAV(resampled, 16000);

      slices.push({
        index: sliceIndex++,
        blob: wavBlob,
        startTimeSec: currentSample / sourceSampleRate,
        endTimeSec: bestCutSample / sourceSampleRate,
        durationSec: (bestCutSample - currentSample) / sourceSampleRate,
      });

      currentSample = bestCutSample;
      onProgress?.(Math.min(99, Math.round((currentSample / length) * 100)));
    }

    onProgress?.(100);
    return slices;
  } finally {
    audioCtx.close().catch(() => {});
  }
}

/**
 * High-fidelity linear interpolation audio resampler.
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
