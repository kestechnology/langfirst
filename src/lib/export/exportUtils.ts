import { TranslationMessage } from '@/types/translation';

/**
 * Formats milliseconds into standard SubRip (.srt) timecode: 00:01:23,456
 */
export function formatSrtTime(totalMs: number): string {
  const hours = Math.floor(totalMs / (1000 * 60 * 60));
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
  const ms = Math.floor(totalMs % 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
}

/**
 * Converts a list of translation messages into standard .srt subtitle text.
 */
export function generateSrtContent(
  messages: TranslationMessage[],
  isBilingual: boolean = true
): string {
  if (messages.length === 0) return '';

  const baseTime = messages[0].timestamp;
  let srt = '';

  messages.forEach((msg, index) => {
    const startOffset = Math.max(0, msg.timestamp - baseTime);
    const endOffset = startOffset + 2500; // estimated subtitle display window

    srt += `${index + 1}\n`;
    srt += `${formatSrtTime(startOffset)} --> ${formatSrtTime(endOffset)}\n`;

    if (isBilingual && msg.transcription) {
      srt += `<i>${msg.transcription}</i>\n`;
    }
    srt += `${msg.translation}\n\n`;
  });

  return srt;
}

/**
 * Converts messages into plain text format.
 */
export function generateTxtContent(
  messages: TranslationMessage[],
  isBilingual: boolean = true
): string {
  const header = `LangFirst Voice Translation Transcript\nDate: ${new Date().toLocaleString()}\nTarget: English\n\n----------------------------------------\n\n`;

  const body = messages
    .map((msg) => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      let text = `[${time}] ${msg.speaker} (${msg.detected_lang || 'Esan'}):\n`;
      if (isBilingual && msg.transcription) {
        text += `  Original: "${msg.transcription}"\n`;
      }
      text += `  Translation: ${msg.translation}\n`;
      return text;
    })
    .join('\n');

  return header + body;
}

/**
 * Initiates browser file download.
 */
export function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Downloads .srt subtitle file.
 */
export function downloadSrt(messages: TranslationMessage[], isBilingual: boolean = true) {
  const content = generateSrtContent(messages, isBilingual);
  triggerDownload(content, `langfirst-subtitles-${Date.now()}.srt`, 'text/plain;charset=utf-8');
}

/**
 * Downloads .txt transcript file.
 */
export function downloadTxt(messages: TranslationMessage[], isBilingual: boolean = true) {
  const content = generateTxtContent(messages, isBilingual);
  triggerDownload(content, `langfirst-transcript-${Date.now()}.txt`, 'text/plain;charset=utf-8');
}

