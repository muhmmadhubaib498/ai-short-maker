import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import util from 'util';
import * as archiverPkg from 'archiver';
const archiver = ((archiverPkg as any).default || archiverPkg) as (format: string, options?: any) => any;
import type { AspectRatio, CaptionStyle, CaptionPosition, TranscriptSegment } from '../src/types';

const execFileAsync = util.promisify(execFile);

/**
 * Executes FFmpeg command with a strict timeout guard.
 * If FFmpeg hangs or stalls (e.g. 82% stream buffer lockup), force-kills the process with SIGKILL.
 */
function runFfmpegWithTimeout(args: string[], timeoutMs: number = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegProc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderrData = '';
    ffmpegProc.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
      if (stderrData.length > 2000) {
        stderrData = stderrData.slice(-1000);
      }
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.warn(`[FFmpeg Timeout Guard] Command exceeded ${timeoutMs / 1000}s limit. Force killing with SIGKILL...`);
      try {
        ffmpegProc.kill('SIGKILL');
      } catch (_) {}
      reject(new Error(`FFmpeg stalled and exceeded ${timeoutMs / 1000}s deadline (SIGKILL forced)`));
    }, timeoutMs);

    ffmpegProc.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) reject(err);
    });

    ffmpegProc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-300)}`));
      }
    });
  });
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  format: string;
}

export class VideoProcessor {
  /**
   * Probe video to get duration, dimensions, and format
   * Uses execFile with argument arrays to prevent command injection
   */
  async probeVideo(filePath: string): Promise<VideoMetadata> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);
      const data = JSON.parse(stdout);
      const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');

      const duration = Number(data.format?.duration || videoStream?.duration || 0);
      const width = Number(videoStream?.width || 1280);
      const height = Number(videoStream?.height || 720);
      const format = data.format?.format_name || 'mp4';

      return {
        duration: Math.max(1, duration),
        width,
        height,
        format,
      };
    } catch (err: any) {
      console.error('ffprobe error:', err);
      throw new Error(`Failed to inspect video file: ${err.message || 'Corrupted or unsupported format'}`);
    }
  }

  /**
   * Validates rendered video file with ffprobe to verify:
   * 1. File exists and file size > 0
   * 2. Has at least 1 decodable video stream with non-zero dimensions
   * 3. Valid duration > 0
   */
  async validateVideoOutput(filePath: string): Promise<{ valid: boolean; duration: number; width?: number; height?: number; error?: string }> {
    if (!fs.existsSync(filePath)) {
      return { valid: false, duration: 0, error: 'Rendered file does not exist on disk' };
    }
    const stat = fs.statSync(filePath);
    if (stat.size <= 1024) {
      return { valid: false, duration: 0, error: `Rendered file is too small or empty (${stat.size} bytes)` };
    }

    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);
      const data = JSON.parse(stdout);
      const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
      if (!videoStream) {
        return { valid: false, duration: 0, error: 'No video stream found in rendered output' };
      }

      const width = Number(videoStream.width || 0);
      const height = Number(videoStream.height || 0);
      const duration = Number(data.format?.duration || videoStream.duration || 0);

      if (width <= 0 || height <= 0) {
        return { valid: false, duration: 0, error: `Invalid video dimensions (${width}x${height})` };
      }

      if (duration <= 0) {
        return { valid: false, duration: 0, error: 'Video stream duration is 0' };
      }

      return { valid: true, duration, width, height };
    } catch (err: any) {
      return { valid: false, duration: 0, error: `ffprobe validation failed: ${err.message}` };
    }
  }

  /**
   * Extract audio to 16kHz mono MP3 for optimal Google Gemini AI transcription
   * Uses spawn/runFfmpegWithTimeout with argument arrays to prevent command injection
   */
  async extractAudio(videoPath: string, outputAudioPath: string): Promise<string> {
    const dir = path.dirname(outputAudioPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Use fast audio extraction with safe argument array
    const audioArgs = [
      '-y',
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-b:a',
      '64k',
      outputAudioPath,
    ];
    try {
      await runFfmpegWithTimeout(audioArgs, 60000);
      return outputAudioPath;
    } catch (err: any) {
      console.error('Audio extraction failed:', err);
      throw new Error(`Failed to extract audio from video: ${err.message}`);
    }
  }

  /**
   * Generate video clip trimmed and converted to aspect ratio.
   * Enforces 60-second timeout per clip; if FFmpeg stalls, force-kills with SIGKILL.
   * Supports professional subtle branding ("AI SHORT" corner tag) or 100% clean output.
   */
  async generateClip(options: {
    inputPath: string;
    outputPath: string;
    startTime: number;
    endTime: number;
    aspectRatio: AspectRatio;
    burnCaptions?: boolean;
    srtPath?: string;
    watermark?: boolean;
    watermarkPosition?: 'top-right' | 'top-left';
  }): Promise<string> {
    const {
      inputPath,
      outputPath,
      startTime,
      endTime,
      aspectRatio,
      burnCaptions,
      srtPath,
      watermark = false,
      watermarkPosition = 'top-right',
    } = options;
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const duration = Math.max(1, endTime - startTime);
    const tempOutputPath = `${outputPath}.tmp.mp4`;

    // Ensure any stale temp file is removed before starting render
    if (fs.existsSync(tempOutputPath)) {
      try { fs.unlinkSync(tempOutputPath); } catch {}
    }

    // Build video filter for aspect ratio without stretching (using exact crop or pad filters)
    let videoFilter = '';
    let padFallbackFilter = '';
    if (aspectRatio === '9:16') {
      videoFilter = 'crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9):(iw-ow)/2:(ih-oh)/2,scale=720:1280:flags=lanczos';
      padFallbackFilter = 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black';
    } else if (aspectRatio === '1:1') {
      videoFilter = 'crop=min(iw\\,ih):min(iw\\,ih):(iw-ow)/2:(ih-oh)/2,scale=720:720:flags=lanczos';
      padFallbackFilter = 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:black';
    } else {
      // 16:9
      videoFilter = 'crop=min(iw\\,ih*16/9):min(ih\\,iw*9/16):(iw-ow)/2:(ih-oh)/2,scale=1280:720:flags=lanczos';
      padFallbackFilter = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black';
    }

    // Professional & Subtle Branding (Vizard.ai / PixVerse Style)
    let watermarkFilter = '';
    if (watermark) {
      const isTopLeft = watermarkPosition === 'top-left';
      const posX = isTopLeft ? '28' : 'w-tw-28';
      const posY = '28';
      watermarkFilter = `drawtext=text='AI SHORT':font='Sans':fontsize=20:fontcolor=white@0.60:shadowcolor=black@0.4:shadowx=1:shadowy=1:x=${posX}:y=${posY}`;
    }

    let primaryFilter = videoFilter;
    if (burnCaptions && srtPath && fs.existsSync(srtPath)) {
      const sanitizedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
      const subStyle = "force_style='FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BackColour=&H60000000,BorderStyle=1,Outline=2.5,Shadow=1.5,Alignment=2,MarginV=48,Spacing=0.5'";
      primaryFilter += `,subtitles='${sanitizedSrt}':${subStyle}`;
    }
    if (watermarkFilter) {
      primaryFilter += `,${watermarkFilter}`;
    }

    // High-definition output flags matching commercial platforms
    const HD_VIDEO_ARGS = [
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '18',
      '-b:v', '4M',
      '-maxrate', '6M',
      '-bufsize', '8M',
      '-pix_fmt', 'yuv420p',
      '-max_muxing_queue_size', '1024',
    ];
    const HD_AUDIO_ARGS = ['-c:a', 'aac', '-b:a', '192k', '-ar', '44100'];
    const CONTAINER_ARGS = ['-movflags', '+faststart'];

    try {
      // 1. Primary Attempt: Aspect crop + Subtitles + Subtle Watermark (if enabled)
      try {
        const primaryArgs = [
          '-y',
          '-ss', startTime.toFixed(2),
          '-i', inputPath,
          '-t', duration.toFixed(2),
          '-vf', primaryFilter,
          ...HD_VIDEO_ARGS,
          ...HD_AUDIO_ARGS,
          ...CONTAINER_ARGS,
          tempOutputPath,
        ];
        await runFfmpegWithTimeout(primaryArgs, 60000);
        const check = await this.validateVideoOutput(tempOutputPath);
        if (check.valid) {
          fs.renameSync(tempOutputPath, outputPath);
          return outputPath;
        }
        console.warn(`[FFmpeg Guard] Primary render validation issue: ${check.error}. Retrying fallback...`);
      } catch (primaryErr: any) {
        console.warn(`[FFmpeg Guard] Primary clip render error/timeout: ${primaryErr.message || primaryErr}. Falling back...`);
      } finally {
        if (fs.existsSync(tempOutputPath)) {
          try { fs.unlinkSync(tempOutputPath); } catch {}
        }
      }

      // 2. Smooth Fallback: Aspect ratio crop without burned subtitles
      try {
        let fallbackFilter = videoFilter;
        if (watermarkFilter) {
          fallbackFilter += `,${watermarkFilter}`;
        }

        const fallbackArgs = [
          '-y',
          '-ss', startTime.toFixed(2),
          '-i', inputPath,
          '-t', duration.toFixed(2),
          '-vf', fallbackFilter,
          ...HD_VIDEO_ARGS,
          ...HD_AUDIO_ARGS,
          ...CONTAINER_ARGS,
          tempOutputPath,
        ];
        await runFfmpegWithTimeout(fallbackArgs, 60000);
        const check = await this.validateVideoOutput(tempOutputPath);
        if (check.valid) {
          fs.renameSync(tempOutputPath, outputPath);
          return outputPath;
        }
        console.warn(`[FFmpeg Guard] Fallback crop validation issue: ${check.error}. Retrying pad fallback...`);
      } catch (fbErr: any) {
        console.warn(`[FFmpeg Guard] Fallback crop warning: ${fbErr.message || fbErr}. Trying pad filter...`);
      } finally {
        if (fs.existsSync(tempOutputPath)) {
          try { fs.unlinkSync(tempOutputPath); } catch {}
        }
      }

      // 3. Fallback with Aspect Ratio Pad Filter (guarantees no stretching without cropping edges)
      try {
        let padFilter = padFallbackFilter;
        if (watermarkFilter) {
          padFilter += `,${watermarkFilter}`;
        }

        const padArgs = [
          '-y',
          '-ss', startTime.toFixed(2),
          '-i', inputPath,
          '-t', duration.toFixed(2),
          '-vf', padFilter,
          ...HD_VIDEO_ARGS,
          ...HD_AUDIO_ARGS,
          ...CONTAINER_ARGS,
          tempOutputPath,
        ];
        await runFfmpegWithTimeout(padArgs, 45000);
        const check = await this.validateVideoOutput(tempOutputPath);
        if (check.valid) {
          fs.renameSync(tempOutputPath, outputPath);
          return outputPath;
        }
      } catch (padErr: any) {
        console.warn(`[FFmpeg Guard] Pad fallback warning: ${padErr.message || padErr}. Running emergency cut...`);
      } finally {
        if (fs.existsSync(tempOutputPath)) {
          try { fs.unlinkSync(tempOutputPath); } catch {}
        }
      }

      // 4. Emergency Last-Resort: Ultrafast cut with stream copy fallback
      try {
        const emergencyArgs = [
          '-y',
          '-ss', startTime.toFixed(2),
          '-i', inputPath,
          '-t', duration.toFixed(2),
          '-vf', videoFilter,
          ...HD_VIDEO_ARGS,
          ...HD_AUDIO_ARGS,
          ...CONTAINER_ARGS,
          tempOutputPath,
        ];
        await runFfmpegWithTimeout(emergencyArgs, 30000);
        const check = await this.validateVideoOutput(tempOutputPath);
        if (check.valid) {
          fs.renameSync(tempOutputPath, outputPath);
          return outputPath;
        }
      } catch (emErr: any) {
        console.error('[FFmpeg Guard] Emergency cut failed, attempting direct stream copy:', emErr);
        if (fs.existsSync(tempOutputPath)) {
          try { fs.unlinkSync(tempOutputPath); } catch {}
        }
        const directCutArgs = [
          '-y',
          '-ss', startTime.toFixed(2),
          '-i', inputPath,
          '-t', duration.toFixed(2),
          '-c', 'copy',
          '-movflags', '+faststart',
          tempOutputPath,
        ];
        await runFfmpegWithTimeout(directCutArgs, 20000);
        const check = await this.validateVideoOutput(tempOutputPath);
        if (check.valid) {
          fs.renameSync(tempOutputPath, outputPath);
          return outputPath;
        }
      }

      throw new Error(`Failed to render a valid decodable video clip for range ${startTime.toFixed(1)}s-${endTime.toFixed(1)}s`);
    } finally {
      // Ensure temp file is completely cleaned up
      if (fs.existsSync(tempOutputPath)) {
        try { fs.unlinkSync(tempOutputPath); } catch {}
      }
    }
  }

  /**
   * Generate 9:16 JPEG preview thumbnail frame with multiple timestamp fallbacks
   * and a strict timeout guard to prevent stalls.
   */
  async generateThumbnail(videoPath: string, outputPath: string, timestamp: number = 0.5): Promise<string> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const timestampsToTry = [timestamp, 0.2, 0.0, 1.0];

    for (const ts of timestampsToTry) {
      try {
        const thumbArgs = [
          '-y',
          '-ss', ts.toFixed(2),
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '2',
          '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2',
          outputPath,
        ];
        await runFfmpegWithTimeout(thumbArgs, 10000);
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          return outputPath;
        }
      } catch (_) {
        try {
          const simpleArgs = ['-y', '-ss', ts.toFixed(2), '-i', videoPath, '-vframes', '1', '-q:v', '2', outputPath];
          await runFfmpegWithTimeout(simpleArgs, 10000);
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            return outputPath;
          }
        } catch {}
      }
    }

    // Emergency solid backdrop thumbnail if no decodable frame was extracted
    try {
      const emergencyArgs = [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=0x0f172a:s=720x1280:d=1',
        '-vframes', '1',
        '-q:v', '2',
        outputPath,
      ];
      await runFfmpegWithTimeout(emergencyArgs, 5000);
      if (fs.existsSync(outputPath)) return outputPath;
    } catch {}

    return '';
  }

  /**
   * Generate SRT subtitle file from transcript segments for a clip
   * Formats into dynamic, rhythmic 3-5 word chunks with center alignment and clear pauses
   */
  generateSrt(
    segments: TranscriptSegment[],
    clipStartTime: number,
    clipEndTime: number,
    outputSrtPath: string
  ): string {
    const dir = path.dirname(outputSrtPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let srtContent = '';
    let counter = 1;

    const formatTime = (seconds: number) => {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.min(999, Math.floor((seconds % 1) * 1000));
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };

    // Filter segments belonging to this clip and ignore any synthetic banner/placeholder text
    const isSyntheticBanner = (t: string) => {
      const lower = t.toLowerCase().trim();
      return (
        lower === 'ai shorts highlights' ||
        lower === 'ai short highlights' ||
        lower === 'ai shorts' ||
        lower === 'ai short'
      );
    };

    const relevantSegments = segments.filter(
      (s) => s.end > clipStartTime && s.start < clipEndTime && !isSyntheticBanner(s.text || '')
    );

    for (const seg of relevantSegments) {
      if (seg.words && seg.words.length > 0) {
        // Group words into punchy 3-5 word chunks for viral visual rhythm
        const relevantWords = seg.words.filter(
          (w) => w.end > clipStartTime && w.start < clipEndTime && !isSyntheticBanner(w.word || '')
        );
        const CHUNK_SIZE = 4;
        for (let i = 0; i < relevantWords.length; i += CHUNK_SIZE) {
          const chunk = relevantWords.slice(i, i + CHUNK_SIZE);
          const chunkStart = Math.max(0, chunk[0].start - clipStartTime);
          const chunkEnd = Math.min(clipEndTime - clipStartTime, chunk[chunk.length - 1].end - clipStartTime);
          if (chunkEnd <= chunkStart) continue;

          const text = chunk.map((w) => w.word).join(' ').trim();
          if (!text || isSyntheticBanner(text)) continue;

          srtContent += `${counter}\n`;
          srtContent += `${formatTime(chunkStart)} --> ${formatTime(chunkEnd)}\n`;
          srtContent += `${text}\n\n`;
          counter++;
        }
      } else {
        if (!seg.text || !seg.text.trim() || isSyntheticBanner(seg.text)) continue;

        // Break long segment text into clean short chunks of ~5-7 words
        const relStart = Math.max(0, seg.start - clipStartTime);
        const relEnd = Math.min(clipEndTime - clipStartTime, seg.end - clipStartTime);
        if (relEnd <= relStart) continue;

        const words = seg.text.trim().split(/\s+/).filter(Boolean);
        if (words.length <= 6) {
          srtContent += `${counter}\n`;
          srtContent += `${formatTime(relStart)} --> ${formatTime(relEnd)}\n`;
          srtContent += `${seg.text.trim()}\n\n`;
          counter++;
        } else {
          const CHUNK_SIZE = 5;
          const totalChunks = Math.ceil(words.length / CHUNK_SIZE);
          const durPerChunk = (relEnd - relStart) / totalChunks;
          for (let i = 0; i < words.length; i += CHUNK_SIZE) {
            const chunkWords = words.slice(i, i + CHUNK_SIZE).join(' ');
            const cStart = relStart + (i / CHUNK_SIZE) * durPerChunk;
            const cEnd = Math.min(relEnd, cStart + durPerChunk);
            if (cEnd <= cStart) continue;

            srtContent += `${counter}\n`;
            srtContent += `${formatTime(cStart)} --> ${formatTime(cEnd)}\n`;
            srtContent += `${chunkWords}\n\n`;
            counter++;
          }
        }
      }
    }

    fs.writeFileSync(outputSrtPath, srtContent, 'utf-8');
    return outputSrtPath;
  }

  /**
   * Package multiple clips into a ZIP archive
   */
  async createClipsZip(
    clipPaths: { path: string; filename: string }[],
    outputZipPath: string
  ): Promise<string> {
    const dir = path.dirname(outputZipPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputZipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', () => resolve(outputZipPath));
      archive.on('error', (err: any) => reject(err));

      archive.pipe(output);

      for (const item of clipPaths) {
        if (fs.existsSync(item.path)) {
          archive.file(item.path, { name: item.filename });
        }
      }

      archive.finalize();
    });
  }
}

export const videoProcessor = new VideoProcessor();
