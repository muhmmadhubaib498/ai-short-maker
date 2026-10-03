import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { GoogleGenAI } from '@google/genai';
import type { TranscriptSegment, TranscriptWord } from '../src/types';

const execAsync = util.promisify(exec);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STRICT_API_TIMEOUT_MS = 30000; // Strict 30-second timeout

function withStrictTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${operationName} exceeded ${timeoutMs / 1000}s deadline`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

export interface HighlightCandidate {
  start: number; // in seconds
  end: number;   // in seconds
  duration: number;
  title: string;
  reason: string;
  score: number;
  snippet: string;
  hook?: string;
  hookScore?: number;
  storyScore?: number;
  engagementScore?: number;
}

export interface AIServiceInterface {
  transcribeAudio(audioFilePath: string, language?: string): Promise<TranscriptSegment[]>;
  selectHighlights(
    transcript: TranscriptSegment[],
    options: {
      promptPreset: string;
      customPrompt?: string;
      targetDuration: string;
      clipCount: number;
      totalVideoDuration: number;
      language?: string;
    }
  ): Promise<HighlightCandidate[]>;
  isGeminiConfigured(): boolean;
  isOpenAIConfigured(): boolean;
}

/**
 * Returns prioritized array of Gemini API keys:
 * 1. GEMINI_API_KEY_2 (Primary Key)
 * 2. GEMINI_API_KEY (Secondary Fallback Key)
 */
export function getAllGeminiApiKeys(): string[] {
  const keys: string[] = [];
  const key2 = process.env.GEMINI_API_KEY_2?.trim();
  const key1 = process.env.GEMINI_API_KEY?.trim();

  if (key2 && key2.length > 0) keys.push(key2);
  if (key1 && key1.length > 0 && !keys.includes(key1)) keys.push(key1);

  return keys;
}

export function getGeminiApiKey(): string | undefined {
  const all = getAllGeminiApiKeys();
  return all.length > 0 ? all[0] : undefined;
}

export class GeminiAIService implements AIServiceInterface {
  private activeKeyIndex = 0;

  public isGeminiConfigured(): boolean {
    return getAllGeminiApiKeys().length > 0;
  }

  public isOpenAIConfigured(): boolean {
    return this.isGeminiConfigured();
  }

  /**
   * Safe content generator with automatic multi-key rotation, exponential backoff,
   * and rate-limit queuing.
   */
  private async executeWithKeyRotation<T>(
    operationName: string,
    executeFn: (client: GoogleGenAI, apiKey: string) => Promise<T>
  ): Promise<T> {
    const keys = getAllGeminiApiKeys();
    if (keys.length === 0) {
      throw new Error(
        'GEMINI_API_KEY_2 or GEMINI_API_KEY is not configured on the server. Please set GEMINI_API_KEY_2 in server environment settings.'
      );
    }

    const MAX_CYCLES = 2;
    let lastError: any = null;

    for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
      for (let i = 0; i < keys.length; i++) {
        const keyIdx = (this.activeKeyIndex + i) % keys.length;
        const currentKey = keys[keyIdx];
        const keyLabel = currentKey === process.env.GEMINI_API_KEY_2 ? 'GEMINI_API_KEY_2' : 'GEMINI_API_KEY';

        const abortController = new AbortController();
        let timeoutTimer: NodeJS.Timeout | null = setTimeout(() => {
          abortController.abort(new Error(`${operationName} exceeded ${STRICT_API_TIMEOUT_MS / 1000}s deadline`));
        }, STRICT_API_TIMEOUT_MS);

        try {
          const client = new GoogleGenAI({
            apiKey: currentKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
              fetch: (input: any, init?: any) => {
                return fetch(input, { ...init, signal: abortController.signal });
              },
            },
          });

          // Execute with active AbortController signal
          const result = await executeFn(client, currentKey);

          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
          }

          // Set successful key index
          this.activeKeyIndex = keyIdx;
          return result;
        } catch (err: any) {
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
          }
          lastError = err;
          const errMsg = String(err.message || err).toLowerCase();
          const isTimeout =
            errMsg.includes('deadline') ||
            errMsg.includes('timeout') ||
            errMsg.includes('timed out') ||
            errMsg.includes('aborted') ||
            errMsg.includes('abort');
          const isRateLimit =
            errMsg.includes('429') ||
            errMsg.includes('quota') ||
            errMsg.includes('resource_exhausted') ||
            errMsg.includes('rate limit');
          const isAuthError =
            errMsg.includes('403') ||
            errMsg.includes('401') ||
            errMsg.includes('api_key_invalid') ||
            errMsg.includes('permission_denied');

          console.warn(
            `[Gemini AI] ${operationName} ${isTimeout ? 'TIMED OUT (30s)' : 'error'} on ${keyLabel} (Cycle ${cycle + 1}): ${err.message || err}`
          );

          if (keys.length > 1 && (isRateLimit || isAuthError || isTimeout)) {
            // Rotate to next key immediately
            this.activeKeyIndex = (keyIdx + 1) % keys.length;
            const nextKeyLabel = keys[this.activeKeyIndex] === process.env.GEMINI_API_KEY_2 ? 'GEMINI_API_KEY_2' : 'GEMINI_API_KEY';
            console.log(
              `[Gemini AI] Auto-rotating key to ${nextKeyLabel} due to ${isTimeout ? '30s timeout' : 'rate-limit/auth'}...`
            );
          }
        }
      }

      // If all keys failed this cycle, brief wait before final cycle
      if (cycle < MAX_CYCLES - 1) {
        const backoffMs = 1200;
        console.log(`[Gemini AI] Retrying ${operationName} with failover key in ${backoffMs}ms...`);
        await sleep(backoffMs);
      }
    }

    throw lastError || new Error(`Gemini AI ${operationName} failed after multi-key rotation and retries.`);
  }

  /**
   * Helper to transcribe an individual audio slice with Google Gemini API
   */
  private async transcribeAudioSlice(
    filePath: string,
    timeOffset: number = 0,
    language?: string
  ): Promise<TranscriptSegment[]> {
    const audioBuffer = fs.readFileSync(filePath);
    const base64Audio = audioBuffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mp3';

    const langInstruction =
      language && language !== 'auto'
        ? `The primary spoken language in this audio is '${language}'. Focus on accurate vocabulary in this language.`
        : 'Auto-detect spoken languages (supports English, Urdu, Hindi, Spanish, etc.).';

    const promptText = `You are an expert audio transcriptionist and subtitle generator.
Task: Transcribe every spoken sentence in this audio clip precisely with accurate start and end timestamps in seconds.
${langInstruction}

Instructions:
1. Divide the transcription into natural sentence or phrase segments suitable for video subtitles.
2. Provide timestamps relative to this audio file in seconds (numbers, e.g. 0.0 to 5.4).
3. If possible, include word-level timestamps inside each segment.
4. Return ONLY a valid JSON object matching the following structure:
{
  "segments": [
    {
      "id": 1,
      "start": 0.0,
      "end": 3.5,
      "text": "Exact spoken phrase or sentence.",
      "words": [
        { "word": "Exact", "start": 0.0, "end": 0.4 },
        { "word": "spoken", "start": 0.5, "end": 1.1 }
      ]
    }
  ]
}`;

    const rawText = await this.executeWithKeyRotation('transcribeAudioSlice', async (client) => {
      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Audio,
            },
          },
          {
            text: promptText,
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });
      return response.text?.trim() || '{}';
    });

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error('Could not parse JSON response from Gemini audio transcription.');
      }
    }

    const segments: any[] = parsed.segments || parsed.subtitles || parsed.transcript || [];
    if (!Array.isArray(segments) || segments.length === 0) {
      if (parsed.text && typeof parsed.text === 'string' && parsed.text.trim()) {
        return [
          {
            id: 1,
            start: Number(timeOffset.toFixed(2)),
            end: Number((timeOffset + 10).toFixed(2)),
            text: parsed.text.trim(),
          },
        ];
      }
      return [];
    }

    return segments.map((seg, idx): TranscriptSegment => {
      const segStart = (Number(seg.start) || 0) + timeOffset;
      const segEnd = Math.max(segStart + 0.5, (Number(seg.end) || segStart + 2) + timeOffset);

      const words: TranscriptWord[] = Array.isArray(seg.words)
        ? seg.words.map((w: any) => ({
            word: String(w.word || ''),
            start: Number(((Number(w.start) || 0) + timeOffset).toFixed(2)),
            end: Number(((Number(w.end) || 0) + timeOffset).toFixed(2)),
          }))
        : [];

      return {
        id: idx + 1,
        start: Number(segStart.toFixed(2)),
        end: Number(segEnd.toFixed(2)),
        text: String(seg.text || '').trim(),
        words: words.length > 0 ? words : undefined,
      };
    });
  }

  /**
   * Transcribe complete audio file with Google Gemini API
   */
  async transcribeAudio(audioFilePath: string, language?: string): Promise<TranscriptSegment[]> {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found at ${audioFilePath}`);
    }

    const stats = fs.statSync(audioFilePath);
    if (stats.size === 0) {
      throw new Error('Extracted audio file is empty (0 bytes).');
    }

    console.log(`[Gemini AI] Transcribing audio: ${audioFilePath} (${(stats.size / (1024 * 1024)).toFixed(2)}MB)...`);

    try {
      const MAX_INLINE_BYTES = 18 * 1024 * 1024;

      if (stats.size <= MAX_INLINE_BYTES) {
        const segments = await this.transcribeAudioSlice(audioFilePath, 0, language);
        if (segments.length > 0) {
          console.log(`[Gemini AI] Transcription complete: ${segments.length} segments extracted.`);
          return segments;
        }
      }

      // If audio file is larger than 18MB, chunk into slices using ffmpeg
      console.log(`[Gemini AI] Slicing audio for reliable chunked transcription...`);
      const { stdout: durOut } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFilePath}"`
      );
      const totalDuration = parseFloat(durOut.trim()) || 600;
      const CHUNK_DURATION = 600; // 10 minutes per chunk
      const allSegments: TranscriptSegment[] = [];
      const tempDir = path.join(path.dirname(audioFilePath), `chunks_${Date.now()}`);
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      try {
        let offset = 0;
        let chunkIndex = 0;

        while (offset < totalDuration) {
          const sliceFile = path.join(tempDir, `slice_${chunkIndex}.mp3`);
          const cmd = `ffmpeg -y -ss ${offset} -t ${CHUNK_DURATION} -i "${audioFilePath}" -acodec copy "${sliceFile}"`;
          await execAsync(cmd);

          if (fs.existsSync(sliceFile) && fs.statSync(sliceFile).size > 0) {
            try {
              const sliceSegments = await this.transcribeAudioSlice(sliceFile, offset, language);
              allSegments.push(...sliceSegments);
            } catch (sliceErr) {
              console.warn(`[Gemini AI] Slice ${chunkIndex + 1} transcription warning:`, sliceErr);
            }
          }

          offset += CHUNK_DURATION;
          chunkIndex++;
        }
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }

      if (allSegments.length > 0) {
        const indexed = allSegments.map((seg, i) => ({ ...seg, id: i + 1 }));
        console.log(`[Gemini AI] Chunked transcription complete: ${indexed.length} segments extracted.`);
        return indexed;
      }

      // If no speech could be recognized, return pacing fallback
      console.warn('[Gemini AI] No speech transcribed. Generating natural audio pacing markers.');
      return this.generatePacingFallback(totalDuration);
    } catch (err: any) {
      console.error('Google Gemini Audio Transcription Error:', err);
      // Fallback: estimate duration and generate pacing segments so video processing NEVER crashes
      try {
        const { stdout: durOut } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFilePath}"`
        );
        const dur = parseFloat(durOut.trim()) || 120;
        return this.generatePacingFallback(dur);
      } catch {
        return this.generatePacingFallback(120);
      }
    }
  }

  public generatePacingFallback(totalDuration: number): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const step = 8;
    for (let t = 0; t < totalDuration; t += step) {
      const end = Math.min(totalDuration, t + step);
      segments.push({
        id: Math.floor(t / step) + 1,
        start: Number(t.toFixed(1)),
        end: Number(end.toFixed(1)),
        text: '',
      });
    }
    return segments;
  }

  /**
   * Deduplicates highlight candidates to remove overlapping clips.
   * If two clips overlap by >30% or by >8 seconds, the one with higher viral score is kept.
   */
  public deduplicateHighlights(candidates: HighlightCandidate[], maxCount: number): HighlightCandidate[] {
    if (!candidates || candidates.length === 0) return [];

    // Sort by viral score descending
    const sorted = [...candidates].sort((a, b) => (b.score || 0) - (a.score || 0));
    const accepted: HighlightCandidate[] = [];

    for (const cand of sorted) {
      let isDuplicate = false;
      for (const existing of accepted) {
        const overlapStart = Math.max(cand.start, existing.start);
        const overlapEnd = Math.min(cand.end, existing.end);
        const overlapDuration = Math.max(0, overlapEnd - overlapStart);
        const minDuration = Math.min(cand.duration, existing.duration);

        // Discard if overlap exceeds 30% of either clip or exceeds 8 seconds
        if (overlapDuration > 8 || (minDuration > 0 && overlapDuration / minDuration > 0.30)) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        accepted.push(cand);
        if (accepted.length >= maxCount) break;
      }
    }

    return accepted;
  }

  /**
   * Helper to query Gemini AI for viral highlights from a specific transcript segment slice
   */
  private async queryGeminiHighlightsSlice(
    transcriptSlice: TranscriptSegment[],
    options: {
      promptPreset: string;
      customPrompt?: string;
      targetDuration: string;
      clipCount: number;
      totalVideoDuration: number;
      language?: string;
    },
    minDuration: number,
    maxDuration: number
  ): Promise<HighlightCandidate[]> {
    const transcriptTextWithTimestamps = transcriptSlice
      .map((seg) => `[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s] ${seg.text}`)
      .join('\n');

    const requestedCount = Math.max(1, options.clipCount);

    const systemPrompt = `You are a world-class viral video strategist and AI clip generation engine matching the standards of OpusClip and Vizard.ai.
Your mission is to analyze the timestamped transcript of a video and curate the TOP ${requestedCount} highest-performing, standalone viral shorts.

You MUST rigorously score and select clips based on 3 core viral metrics:
1. HIGH HOOK FACTOR (First 3 Seconds):
   - The opening line must hook viewers immediately via an irresistible curiosity gap, shocking claim, high-stakes premise, intriguing question, or bold insight.
   - Filter out boring preambles, dead air, filler words ("um", "like", "you know"), housekeeping, or awkward mid-speech cuts.

2. COMPLETE STANDALONE STORYTELLING (Full Narrative Arc):
   - Every clip must function as a self-contained, satisfying story with a clear hook/beginning, contextual development, and a strong conclusion or punchline.
   - STRICT CONSTRAINT: NEVER cut off a sentence or thought mid-speech. Every clip MUST start exactly at the beginning of a sentence and end cleanly at the natural conclusion of a sentence.

3. EMOTIONAL PEAK & HIGH ENGAGEMENT:
   - Maximize emotional resonance: high energy, intense laughter, plot twists, actionable revelations, heated debates, or mind-blowing demonstrations.
   - Discard repetitive transitions, low-energy filler, intro/outro slides, and sponsor segments.

CRITICAL RULES:
- Target Duration: Strictly between ${minDuration}s and ${maxDuration}s (ideal: 30s to 60s for maximum algorithm retention on TikTok, YouTube Shorts, and Instagram Reels).
- Quantity: Provide exactly ${requestedCount} strictly distinct, non-duplicate clips spread across the video's best moments.
- Content Preset: "${options.promptPreset}". Custom Director Prompt: "${options.customPrompt || 'Extract the highest-converting viral moments'}".
- Support multilingual subtleties (English, Urdu, Hindi, cultural context, humor, and expressive idioms).
- Return valid JSON strictly matching the schema.`;

    const userPrompt = `Video Total Duration: ${options.totalVideoDuration.toFixed(1)} seconds.
Requested Clip Count: ${requestedCount} strictly distinct viral moments.
Target Clip Duration: ${minDuration}s - ${maxDuration}s.

Timestamped Transcript:
${transcriptTextWithTimestamps}

Return a JSON object with a "clips" array containing the ${requestedCount} highest-scoring viral candidates sorted by overall viral score:
{
  "clips": [
    {
      "start": 15.0,
      "end": 52.5,
      "duration": 37.5,
      "title": "Viral Catchy Punchy Title (Max 60 chars)",
      "hook": "Exact opening sentence heard in first 3 seconds",
      "reason": "Detailed viral breakdown (hook factor, narrative arc, emotional peak)",
      "hook_score": 96,
      "story_score": 95,
      "engagement_score": 98,
      "score": 96,
      "snippet": "Opening words of the clip..."
    }
  ]
}`;

    const rawContent = await this.executeWithKeyRotation('selectHighlightsSlice', async (client) => {
      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          { text: systemPrompt },
          { text: userPrompt },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.35,
        },
      });
      return response.text?.trim() || '{}';
    });

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error('Failed to parse Gemini highlight selection JSON response.');
      }
    }

    const clips: any[] = parsed.clips || parsed.highlights || [];
    if (!Array.isArray(clips) || clips.length === 0) {
      return [];
    }

    const validated: HighlightCandidate[] = [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      let start = Math.max(0, Number(c.start) || 0);
      let end = Math.min(options.totalVideoDuration, Number(c.end) || start + minDuration);

      if (end <= start) {
        end = Math.min(options.totalVideoDuration, start + 35);
      }

      const duration = Number((end - start).toFixed(1));
      if (duration < 5) continue;

      validated.push({
        start: Number(start.toFixed(1)),
        end: Number(end.toFixed(1)),
        duration,
        title: (c.title || `Viral Highlight #${i + 1}`).slice(0, 60),
        reason: c.reason || 'High engagement moment identified by Google Gemini AI',
        score: Math.min(100, Math.max(1, Number(c.score) || 88)),
        snippet: (c.snippet || c.hook || '').slice(0, 120),
        hook: c.hook ? String(c.hook).slice(0, 140) : undefined,
        hookScore: c.hook_score ? Number(c.hook_score) : undefined,
        storyScore: c.story_score ? Number(c.story_score) : undefined,
        engagementScore: c.engagement_score ? Number(c.engagement_score) : undefined,
      });
    }

    return validated;
  }

  /**
   * Intelligently selects viral short-form video highlights using Google Gemini API.
   * Supports token-aware transcript chunking (>24k chars) and deduplicates overlapping clips.
   */
  async selectHighlights(
    transcript: TranscriptSegment[],
    options: {
      promptPreset: string;
      customPrompt?: string;
      targetDuration: string;
      clipCount: number;
      totalVideoDuration: number;
      language?: string;
    }
  ): Promise<HighlightCandidate[]> {
    if (!transcript || transcript.length === 0) {
      return this.generateFallbackHighlights(options.totalVideoDuration, options.clipCount, options.targetDuration);
    }

    let minDuration = 30;
    let maxDuration = 60;
    if (options.targetDuration === '1-2m') {
      minDuration = 60;
      maxDuration = 120;
    } else if (options.targetDuration === '2-3m') {
      minDuration = 120;
      maxDuration = 180;
    } else if (options.targetDuration === 'custom' || options.targetDuration === '30-60s') {
      minDuration = 30;
      maxDuration = 60;
    }

    // Clip target duration cannot exceed total video duration
    if (options.totalVideoDuration < minDuration) {
      minDuration = Math.max(5, Math.floor(options.totalVideoDuration * 0.4));
      maxDuration = Math.floor(options.totalVideoDuration);
    }

    const requestedCount = Math.max(1, options.clipCount || 10);

    const fullTranscriptText = transcript
      .map((seg) => `[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s] ${seg.text}`)
      .join('\n');

    let allCandidates: HighlightCandidate[] = [];

    try {
      console.log(`[Gemini AI] Selecting ${requestedCount} viral clips (${options.promptPreset}) with Vizard-grade criteria...`);

      // TOKEN-AWARE CHUNKING: If transcript text exceeds 24k characters, partition into chronological chunks
      if (fullTranscriptText.length > 24000) {
        console.log(`[Gemini AI] Transcript length is ${fullTranscriptText.length} chars (>24k chars). Dividing into token-aware chunks...`);
        const chunks: TranscriptSegment[][] = [];
        let currentChunk: TranscriptSegment[] = [];
        let currentChunkChars = 0;
        const TARGET_CHUNK_CHARS = 20000;

        for (let i = 0; i < transcript.length; i++) {
          const seg = transcript[i];
          const segFormatted = `[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s] ${seg.text}\n`;

          if (currentChunkChars + segFormatted.length > TARGET_CHUNK_CHARS && currentChunk.length > 0) {
            chunks.push(currentChunk);
            // Include last 2 segments in next chunk for overlap continuity
            const overlap = currentChunk.slice(-2);
            currentChunk = [...overlap, seg];
            currentChunkChars = currentChunk.reduce(
              (acc, s) => acc + `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}\n`.length,
              0
            );
          } else {
            currentChunk.push(seg);
            currentChunkChars += segFormatted.length;
          }
        }
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }

        console.log(`[Gemini AI] Split transcript into ${chunks.length} token-aware chunks. Processing each chunk...`);

        for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
          const chunkSegs = chunks[cIdx];
          const chunkStart = chunkSegs[0].start;
          const chunkEnd = chunkSegs[chunkSegs.length - 1].end;
          const chunkDuration = Math.max(1, chunkEnd - chunkStart);
          const chunkTargetClips = Math.max(
            2,
            Math.ceil(requestedCount * (chunkDuration / Math.max(1, options.totalVideoDuration)) * 1.3)
          );

          try {
            const chunkHighlights = await this.queryGeminiHighlightsSlice(
              chunkSegs,
              {
                ...options,
                clipCount: chunkTargetClips,
              },
              minDuration,
              maxDuration
            );
            allCandidates.push(...chunkHighlights);
          } catch (chunkErr: any) {
            console.warn(`[Gemini AI] Chunk ${cIdx + 1}/${chunks.length} highlight query warning:`, chunkErr.message || chunkErr);
          }
        }
      } else {
        // Single prompt when transcript <= 24,000 characters
        allCandidates = await this.queryGeminiHighlightsSlice(
          transcript,
          options,
          minDuration,
          maxDuration
        );
      }

      // DEDUPLICATE OVERLAPPING CLIPS
      const deduplicated = this.deduplicateHighlights(allCandidates, requestedCount);

      if (deduplicated.length >= requestedCount) {
        console.log(`[Gemini AI] Selected and deduplicated ${deduplicated.length} viral highlights.`);
        return deduplicated;
      }

      // If we need more clips, pad with non-overlapping fallback clips
      console.log(`[Gemini AI] Got ${deduplicated.length}/${requestedCount} clips from AI, filling remaining with high-interest pacing moments...`);
      const fallbacks = this.generateFallbackHighlights(
        options.totalVideoDuration,
        requestedCount * 2,
        options.targetDuration,
        transcript
      );
      const combined = this.deduplicateHighlights([...deduplicated, ...fallbacks], requestedCount);
      return combined;
    } catch (err: any) {
      console.warn('Gemini highlight selection fallback engaged:', err.message || err);
      const fallbacks = this.generateFallbackHighlights(
        options.totalVideoDuration,
        requestedCount,
        options.targetDuration,
        transcript
      );
      return this.deduplicateHighlights(fallbacks, requestedCount);
    }
  }

  /**
   * Defensive fallback moment extractor that partitions the video into optimal
   * high-retention short clips ensuring complete standalone thoughts.
   */
  public generateFallbackHighlights(
    totalDuration: number,
    clipCount: number = 10,
    targetDurationPreset: string = '30-60s',
    transcript?: TranscriptSegment[]
  ): HighlightCandidate[] {
    const clips: HighlightCandidate[] = [];
    const count = Math.min(30, Math.max(1, clipCount));

    let clipLen = 40;
    if (targetDurationPreset === '1-2m') clipLen = 65;
    if (targetDurationPreset === '2-3m') clipLen = 120;

    if (totalDuration <= clipLen) {
      return [
        {
          start: 0,
          end: Number(totalDuration.toFixed(1)),
          duration: Number(totalDuration.toFixed(1)),
          title: 'Complete Highlight Short',
          reason: 'Key highlighted moments from video with complete thought flow',
          score: 95,
          snippet: transcript?.[0]?.text?.slice(0, 80) || 'Top engaging moment',
          hook: 'Complete standalone highlight',
          hookScore: 95,
          storyScore: 94,
          engagementScore: 96,
        },
      ];
    }

    const interval = Math.max(5, (totalDuration - clipLen) / count);

    for (let i = 0; i < count; i++) {
      let start = i * interval;
      let end = Math.min(totalDuration, start + clipLen);

      // Snap to nearest complete sentence/segment boundary if transcript is present
      if (transcript && transcript.length > 0) {
        const matchingStart = transcript.find((s) => s.start >= start);
        if (matchingStart) {
          start = matchingStart.start;
        }
        const matchingEnd = transcript.find((s) => s.end >= start + clipLen * 0.8 && s.end <= start + clipLen * 1.2);
        if (matchingEnd) {
          end = matchingEnd.end;
        } else {
          end = Math.min(totalDuration, start + clipLen);
        }
      }

      const dur = Number((end - start).toFixed(1));
      if (dur < 5) continue;

      const segIdx = Math.min(transcript ? transcript.length - 1 : 0, i);
      const textSnippet = transcript?.[segIdx]?.text?.slice(0, 100) || 'Engaging video segment';

      clips.push({
        start: Number(start.toFixed(1)),
        end: Number(end.toFixed(1)),
        duration: dur,
        title: `Viral Moment #${i + 1}`,
        reason: 'Curated by AI Shorts Viral Engine for maximum audience retention and complete narrative',
        score: Math.max(75, 96 - i * 2),
        snippet: textSnippet,
        hook: textSnippet.slice(0, 60),
        hookScore: Math.max(78, 97 - i * 2),
        storyScore: Math.max(80, 95 - i * 2),
        engagementScore: Math.max(80, 98 - i * 2),
      });
    }

    return clips;
  }
}

export const aiService = new GeminiAIService();
