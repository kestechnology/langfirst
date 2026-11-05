# LangFirst — Real-Time Audio Translation Architecture & Roadmap

## Architecture Overview for Vercel Deployment

Deploying real-time audio translation on Vercel requires handling two serverless constraints:
1. **Stateless execution:** Vercel functions cannot maintain persistent, stateful WebSocket connections.
2. **Function timeouts:** Serverless function durations are capped (15s to 60s depending on plan tier).

To achieve "almost instantaneous" translation under these constraints, the audio pipeline must capture and process rolling audio slices from the browser directly to an audio-native multimodal endpoint using Server-Sent Events (SSE) or low-latency HTTP streaming.

```
[Browser: Web Audio API / MediaRecorder / Silero-VAD]
     │
     │ Audio chunks (1.5s - 2.5s slices)
     ▼
[Next.js App Router API Route (Edge / Serverless on Vercel)]
     │
     │ Forward chunk buffer + contextual prompt
     ▼
[Multimodal Audio-to-Text API (e.g., Gemini 2.0 Flash / Live)]
     │
     │ Direct translation & transcript stream
     ▼
[Server-Sent Events (SSE) Stream to Web Client]
     │
     ▼
[Real-Time Subtitle UI: Live Conversation Thread]
```

---

## 12-Stage Implementation Roadmap

- [x] **Stage 1: UI Shell & Next.js Monorepo Setup**
  - [x] Scaffold Next.js (App Router) + TypeScript + Tailwind CSS project inside `langfirst`.
  - [x] Build responsive conversation view:
    - [x] Top status indicator (e.g., "Listening", "Analyzing").
    - [x] Central real-time dialogue bubble stream.
    - [x] Bottom audio input control bar.
  - [x] Configure `@vercel/analytics` and establish the Vercel deployment pipeline / configuration.

- [x] **Stage 2: Client-Side Audio Ingestion & Web Audio Pipeline**
  - [x] Request user audio via `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } })`.
  - [x] Initialize `AudioContext` with `AudioWorklet` / `AnalyserNode` and `MediaRecorder` configured for 16kHz mono audio.
  - [x] Set up in-memory buffer to capture raw PCM or lightweight Opus audio chunks.
  - [x] Fixed default translated target language to English for MVP with modular expansion design.

- [x] **Stage 3: Client-Side Voice Activity Detection (VAD)**
  - [x] Integrate `@ricky0123/vad-web` (running ONNX-based Silero-VAD client-side via WebAssembly).
  - [x] Filter out background silence to prevent unnecessary requests to Vercel endpoints.
  - [x] Implement continuous speech segmenter grouping speech into dynamic 1.5s–3.0s windows with a 300ms lookback buffer (prevent clipping initial consonants).

- [x] **Stage 4: Vercel Streaming API Route (SSE Engine)**
  - [x] Create Edge-compatible Next.js API route: `app/api/translate-stream/route.ts`.
  - [x] Implement Server-Sent Events (SSE) using Web Streams API (`ReadableStream`).
  - [x] Define structured JSON chunk protocol:
    ```json
    {
      "speaker": "Speaker A",
      "detected_lang": "Esan",
      "transcription": "Ọ nan a gbe erọlọ",
      "translation": "It takes patience",
      "is_final": true
    }
    ```

- [x] **Stage 5: Multimodal Audio LLM Integration**
  - [x] Connect Vercel backend directly to low-latency multimodal audio API (e.g., Gemini 2.0 Flash).
  - [x] Formulate audio system prompt with localized few-shot phonetic anchors:
    - [x] Recognize Central Edo (Esan) code-mixing with Nigerian English.
    - [x] Map frequent expressions (e.g., *erọlọ* -> patience; *ọya waigbe* -> perseverance/steadfastness; *ẹkpafọ kẹina* -> that is all).
    - [x] Enable direct translation mode: transcribing and outputting fluent conversational English concurrently.

- [x] **Stage 6: Rolling Audio Windowing & Context Carry-Over**
  - [x] Implement context sliding window across stateless Vercel requests.
  - [x] Append the last 2 translated sentences to the API call prompt so the LLM infers pronouns, tone, and conversation flow accurately.

- [x] **Stage 7: Sub-Second Latency Optimization**
  - [x] Optimize audio payload size: encode audio slices directly as 16kHz audio before uploading.
  - [x] Configure Vercel function region (e.g., `fra1` or `iad1`) co-located with AI inference provider data centers to minimize RTT.
  - [x] Implement optimistic UI rendering (instant "thinking" badge upon audio chunk upload).

- [x] **Stage 8: Real-Time Subtitle & Dual-Channel UI**
  - [x] Build autoscrolling subtitle component with `framer-motion` for fluid rendering of incoming phrases.
  - [x] Display dual-channel text: native phonetic transcription (*italicized*) and live English translation (**bolded**).
  - [x] Add mode toggle: "Translation Only" vs. "Bilingual Mode".

- [x] **Stage 9: Error Handling, Retries & Degradation**
  - [x] Implement client-side exponential backoff retry mechanism for dropped or timed-out SSE connections.
  - [x] Handle Vercel serverless execution limits: cleanly terminate streams at 45 seconds and roll over to a new stream session seamlessly.
  - [x] Add audio failure fallbacks and mic diagnostic notifications (e.g., low input volume prompt).

- [x] **Stage 10: Audio Upload & File Batch Processing**
  - [x] Build drag-and-drop file upload UI supporting `.mp3`, `.m4a`, and `.wav` voice notes.
  - [x] Segment long audio files in-browser into 10-second slices using Web Audio API before processing.
  - [x] Stream translated transcripts sequentially and assemble into a time-stamped conversation log.

- [x] **Stage 11: Export, History & Offline Cache**
  - [x] Persist conversation transcripts client-side using localStorage.
  - [x] Add export capabilities: Download `.txt`, Copy to clipboard, Export `.srt` subtitles.
  - [x] Add search filter across past translated voice sessions.

- [x] **Stage 12: Production Hardening, Rate Limiting & Launch**
  - [x] Add API rate-limiting via `@upstash/ratelimit` and Redis (with automatic in-memory sliding window fallback) to protect endpoints and quota.
  - [x] Configure strict Permissions-Policy and security headers for microphone permissions and streaming endpoints in `next.config.ts`.
  - [x] Conduct end-to-end verification, Next.js 16 build passing with 100% type safety and zero warnings.

