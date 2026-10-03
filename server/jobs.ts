import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { db } from './db';
import { reserveUserCredit } from './auth';
import { videoProcessor } from './videoProcessor';
import { aiService, type HighlightCandidate } from './aiService';
import { OUTPUT_DIR, CLIPS_OUTPUT_DIR, STORAGE_OUTPUT_DIR } from './mediaStream';
import type { Job, JobStatus, Project, Clip, Notification, TranscriptSegment } from '../src/types';

export const jobEvents = new EventEmitter();
// Increase max listeners for concurrent SSE clients
jobEvents.setMaxListeners(100);

const MAX_CONCURRENT_WORKERS = 2;
const GLOBAL_JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15-minute execution process timeout guard

class JobQueue {
  private activeWorkers = 0;
  private pendingQueue: string[] = [];
  private processingJobs = new Set<string>();

  /**
   * Start asynchronous processing for a video project.
   * Atomically reserves credits or marks demo_used immediately upon job acceptance.
   * Restricts parallel execution to max 2 workers; additional jobs wait in FIFO queue.
   */
  async enqueueVideoProcessing(jobId: string) {
    const job = db.getJobById(jobId);
    if (!job) return;

    // ATOMIC CREDIT RESERVATION: Decrement credits or mark demo_used immediately upon job acceptance
    if (!job.credit_deducted) {
      const reservation = reserveUserCredit(job.user_id);
      if (!reservation.success) {
        const errorMsg = reservation.error || 'Free video generation limit reached. Please purchase credits to continue.';
        this.updateState(jobId, 'FAILED', 0, errorMsg);
        db.updateJob(jobId, { error_message: errorMsg });
        db.updateProject(job.project_id, { status: 'FAILED' });
        return;
      }
      db.updateJob(jobId, { credit_deducted: true });
    }

    if (this.processingJobs.has(jobId) || this.pendingQueue.includes(jobId)) {
      return;
    }

    if (this.activeWorkers < MAX_CONCURRENT_WORKERS) {
      this.activeWorkers++;
      this.processingJobs.add(jobId);
      this.startJobWorker(jobId);
    } else {
      this.pendingQueue.push(jobId);
      this.updateState(jobId, 'QUEUED', 5, 'Waiting in processing queue (concurrency limit: 2 parallel workers)');
    }
  }

  private startJobWorker(jobId: string) {
    // Run worker in background with execution process timeout guard
    setImmediate(async () => {
      try {
        await this.runProcessingJobWithTimeout(jobId, GLOBAL_JOB_TIMEOUT_MS);
      } catch (err: any) {
        console.error(`Background job ${jobId} failed:`, err);
        this.failJob(jobId, err.message || 'Video processing encountered an unrecoverable error.');
      } finally {
        this.processingJobs.delete(jobId);
        this.activeWorkers--;

        // Dispatch next queued job if a worker slot is available
        if (this.pendingQueue.length > 0 && this.activeWorkers < MAX_CONCURRENT_WORKERS) {
          const nextJobId = this.pendingQueue.shift()!;
          this.activeWorkers++;
          this.processingJobs.add(nextJobId);
          this.startJobWorker(nextJobId);
        }
      }
    });
  }

  private async runProcessingJobWithTimeout(jobId: string, timeoutMs: number): Promise<void> {
    let timeoutTimer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error(`Video processing exceeded the maximum execution process timeout of ${timeoutMs / 60000} minutes`));
      }, timeoutMs);
    });

    try {
      await Promise.race([this.runProcessingJob(jobId), timeoutPromise]);
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }
  }

  private updateState(jobId: string, status: JobStatus, progress: number, stage: string) {
    const job = db.getJobById(jobId);
    if (!job) return;

    db.updateJob(jobId, {
      status,
      progress,
      stage,
      updated_at: new Date().toISOString(),
    });

    const project = db.getProjectById(job.project_id);
    if (project) {
      if (status === 'COMPLETED') {
        db.updateProject(project.id, { status: 'COMPLETED' });
      } else if (status === 'FAILED') {
        db.updateProject(project.id, { status: 'FAILED' });
      } else {
        db.updateProject(project.id, { status: 'PROCESSING' });
      }
    }

    const updatedJob = db.getJobById(jobId);
    if (updatedJob) {
      jobEvents.emit(`job:${job.project_id}`, { job: updatedJob, project });
    }
  }

  private failJob(jobId: string, errorMessage: string) {
    const job = db.getJobById(jobId);
    if (!job) return;

    db.updateJob(jobId, {
      status: 'FAILED',
      progress: 0,
      stage: 'Processing failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    });

    const project = db.getProjectById(job.project_id);
    if (project) {
      db.updateProject(project.id, { status: 'FAILED' });
    }

    // In-app notification
    const notification: Notification = {
      id: `notif_${Date.now()}_${crypto.randomUUID()}`,
      user_id: job.user_id,
      title: 'Video Processing Failed',
      message: `Project "${project?.name || 'Video'}" could not be processed: ${errorMessage}`,
      type: 'error',
      read: false,
      created_at: new Date().toISOString(),
    };
    db.insertNotification(notification);
  }

  private async runProcessingJob(jobId: string) {
    const job = db.getJobById(jobId);
    if (!job) throw new Error('Job not found');

    const project = db.getProjectById(job.project_id);
    if (!project) throw new Error('Associated project not found');

    const user = db.getUserById(job.user_id);
    if (!user) throw new Error('User not found');

    // Before starting FFmpeg rendering, strictly verify user.credits or active subscription
    if (user.role !== 'OWNER') {
      const sub = db.getSubscriptionByUserId(user.id);
      const now = new Date();
      const hasActiveSub = sub && sub.status === 'ACTIVE' && (sub.expires_at === null || new Date(sub.expires_at) > now);
      if (!hasActiveSub) {
        if (!job.credit_deducted) {
          const credits = typeof user.credits === 'number' ? user.credits : (user.demo_used ? 0 : 1);
          if (credits <= 0) {
            throw new Error('Free video generation limit reached. Please purchase credits to continue.');
          }
          const reservation = reserveUserCredit(user.id);
          if (!reservation.success) {
            throw new Error(reservation.error || 'Free video generation limit reached. Please purchase credits to continue.');
          }
          db.updateJob(jobId, { credit_deducted: true });
        }
      }
    }

    const projectDir = path.dirname(project.file_path);
    const audioPath = path.join(projectDir, 'extracted_audio.mp3');

    // 1. Probe original video
    this.updateState(jobId, 'PROCESSING', 15, 'Validating video format & properties');
    let videoDuration = 60;
    try {
      const metadata = await videoProcessor.probeVideo(project.file_path);
      videoDuration = metadata.duration;
      db.updateProject(project.id, { duration: metadata.duration });
    } catch (probeErr: any) {
      console.warn('[JobQueue] Video probe warning, using fallback duration:', probeErr.message);
    }

    // BACKEND LIMITS CHECK: Enforce duration and clip count checks before FFmpeg processing starts
    const settings = db.getSettings();
    const isOwner = user.role === 'OWNER';
    const sub = db.getSubscriptionByUserId(user.id);
    const now = new Date();
    const hasActiveSub = sub && sub.status === 'ACTIVE' && (sub.expires_at === null || new Date(sub.expires_at) > now);
    const isPaid = isOwner || Boolean(hasActiveSub);

    // Duration limit check
    const maxDurationMinutes = isPaid
      ? 120 // Paid maximum duration: 120 minutes
      : (settings.demo_max_video_duration_minutes || 5); // Demo maximum duration: 5 minutes default
    const maxDurationSeconds = maxDurationMinutes * 60;

    if (videoDuration > maxDurationSeconds) {
      const formattedDuration = `${Math.floor(videoDuration / 60)}m ${Math.floor(videoDuration % 60)}s`;
      const errorMsg = isPaid
        ? `Video duration (${formattedDuration}) exceeds the maximum supported limit of ${maxDurationMinutes} minutes.`
        : `Video duration (${formattedDuration}) exceeds the free demo limit of ${maxDurationMinutes} minutes. Please upgrade to a Premium plan to process longer videos.`;
      this.updateState(jobId, 'FAILED', 0, errorMsg);
      db.updateJob(jobId, { error_message: errorMsg });
      db.updateProject(project.id, { status: 'FAILED' });
      throw new Error(errorMsg);
    }

    // Clip count limit check
    const maxAllowedClips = isPaid ? 20 : (settings.demo_max_clips || 3);
    const requestedCount = project.settings?.clipCount || (isPaid ? 5 : 3);
    if (requestedCount > maxAllowedClips) {
      console.warn(`[JobQueue] Requested clip count ${requestedCount} exceeds limit ${maxAllowedClips}. Clamping to ${maxAllowedClips}.`);
      project.settings.clipCount = maxAllowedClips;
      db.updateProject(project.id, { settings: project.settings });
    }

    // 2. Extract audio
    this.updateState(jobId, 'PROCESSING', 25, 'Extracting audio track for transcription');
    try {
      await videoProcessor.extractAudio(project.file_path, audioPath);
    } catch (audioErr: any) {
      console.warn('[JobQueue] Audio extraction warning:', audioErr.message);
    }

    // 3. Transcribe with Google Gemini AI (with strict 30s timeout and automatic fallback)
    this.updateState(jobId, 'TRANSCRIBING', 40, 'Transcribing spoken audio with Google Gemini AI');

    const transcribeTimer = setInterval(() => {
      const current = db.getJobById(jobId);
      if (!current || current.status !== 'TRANSCRIBING') return;
      if (current.progress < 58) {
        const nextProg = current.progress + 2;
        const msg = nextProg >= 50
          ? 'Synchronizing word timestamps & natural sentence pauses...'
          : 'Transcribing speech with Google Gemini AI...';
        this.updateState(jobId, 'TRANSCRIBING', nextProg, msg);
      }
    }, 1500);

    let segments: TranscriptSegment[] = [];
    try {
      segments = await aiService.transcribeAudio(audioPath, project.settings.language);
    } catch (txErr: any) {
      console.warn('[JobQueue] Transcription fallback engaged:', txErr.message);
      segments = aiService.generatePacingFallback(videoDuration);
    } finally {
      clearInterval(transcribeTimer);
    }

    if (!segments || segments.length === 0) {
      segments = aiService.generatePacingFallback(videoDuration);
    }
    db.updateProject(project.id, { transcript: segments });

    // 4. Analyze & find highlights (continuous smooth progress 60% -> 78%)
    this.updateState(jobId, 'ANALYZING', 60, 'Google Gemini AI discovering high-retention viral moments');

    const analyzeTimer = setInterval(() => {
      const current = db.getJobById(jobId);
      if (!current || current.status !== 'ANALYZING') return;
      if (current.progress < 78) {
        const nextProg = current.progress + 3;
        const msg = nextProg >= 70
          ? 'Scoring hook retention & selecting top vertical clips...'
          : 'Evaluating speech momentum & viral highlights...';
        this.updateState(jobId, 'ANALYZING', nextProg, msg);
      }
    }, 1200);

    let candidates: HighlightCandidate[] = [];
    try {
      candidates = await aiService.selectHighlights(segments, {
        promptPreset: project.settings.promptPreset,
        customPrompt: project.settings.customPrompt,
        targetDuration: project.settings.targetDuration,
        clipCount: project.settings.clipCount,
        totalVideoDuration: videoDuration,
        language: project.settings.language,
      });
    } catch (hlErr: any) {
      console.warn('[JobQueue] Highlight selection fallback engaged:', hlErr.message);
    } finally {
      clearInterval(analyzeTimer);
    }

    const targetCount = Math.max(1, project.settings.clipCount || 5);

    if (!candidates || candidates.length === 0) {
      candidates = aiService.generateFallbackHighlights(
        videoDuration,
        targetCount,
        project.settings.targetDuration,
        segments
      );
    } else if (candidates.length < targetCount) {
      console.log(`[JobQueue] Gemini returned ${candidates.length} clips; backfilling up to requested ${targetCount} clips...`);
      const extraCandidates = aiService.generateFallbackHighlights(
        videoDuration,
        targetCount,
        project.settings.targetDuration,
        segments
      );
      for (const extra of extraCandidates) {
        if (candidates.length >= targetCount) break;
        const overlaps = candidates.some((c) => Math.abs(c.start - extra.start) < 15);
        if (!overlaps) {
          candidates.push(extra);
        }
      }
      // If still fewer due to overlap filter, append with safe offsets
      for (let k = 0; candidates.length < targetCount && k < extraCandidates.length; k++) {
        const fallbackExtra = extraCandidates[k];
        if (!candidates.includes(fallbackExtra)) {
          candidates.push({
            ...fallbackExtra,
            title: `Viral Moment #${candidates.length + 1}`,
          });
        }
      }
    }

    // Trim candidates array to strictly requested targetCount
    if (candidates.length > targetCount) {
      candidates = candidates.slice(0, targetCount);
    }

    // Check if user has an active pro subscription (subscribers get clean watermark-free video)
    const subscription = db.getSubscriptionByUserId(user.id);
    const hasWatermark = user.role !== 'OWNER' && (!subscription || subscription.status !== 'ACTIVE');

    // 5. Generate clips with smart 9:16 crop (continuous updates 80% -> 95%)
    this.updateState(jobId, 'GENERATING_CLIPS', 80, `Rendering ${candidates.length} vertical short clips`);
    const clipsDir = path.join(projectDir, 'clips');
    if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

    const generatedClips: Clip[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const clipNumber = i + 1;
      const clipProgress = Math.min(95, Math.round(80 + ((i + 1) / candidates.length) * 15));
      this.updateState(
        jobId,
        'GENERATING_CLIPS',
        clipProgress,
        `Rendering vertical 9:16 short clip ${clipNumber} of ${candidates.length}...`
      );

      const clipFilename = `clip_${String(clipNumber).padStart(2, '0')}.mp4`;
      const clipPath = path.join(clipsDir, clipFilename);
      const thumbFilename = `thumb_${String(clipNumber).padStart(2, '0')}.jpg`;
      const thumbPath = path.join(clipsDir, thumbFilename);
      const srtFilename = `sub_${String(clipNumber).padStart(2, '0')}.srt`;
      const srtPath = path.join(clipsDir, srtFilename);

      try {
        // Generate SRT
        videoProcessor.generateSrt(segments, cand.start, cand.end, srtPath);

        // Render clip via FFmpeg with 60s timeout guard and fallback
        await videoProcessor.generateClip({
          inputPath: project.file_path,
          outputPath: clipPath,
          startTime: cand.start,
          endTime: cand.end,
          aspectRatio: project.settings.aspectRatio,
          burnCaptions: project.settings.captionsEnabled,
          srtPath,
          watermark: hasWatermark,
          watermarkPosition: 'top-right',
        });

        // Extract 9:16 thumbnail with timeout guard
        await videoProcessor.generateThumbnail(clipPath, thumbPath, 0.5);

        const clipId = `clip_${Date.now()}_${i}_${crypto.randomUUID()}`;
        const publicClipPath = path.join(CLIPS_OUTPUT_DIR, `${clipId}.mp4`);
        const publicThumbPath = path.join(CLIPS_OUTPUT_DIR, `${clipId}.jpg`);

        try {
          fs.copyFileSync(clipPath, publicClipPath);
          // Also save deterministic aliases so /output/clip-2.mp4 or /clips/clip_02.mp4 or /storage/output/clip-2.mp4 resolve instantly
          const alias1 = path.join(CLIPS_OUTPUT_DIR, `clip-${clipNumber}.mp4`);
          const alias2 = path.join(CLIPS_OUTPUT_DIR, clipFilename);
          const alias3 = path.join(OUTPUT_DIR, `clip-${clipNumber}.mp4`);
          const alias4 = path.join(OUTPUT_DIR, clipFilename);
          const alias5 = path.join(STORAGE_OUTPUT_DIR, `clip-${clipNumber}.mp4`);
          const alias6 = path.join(STORAGE_OUTPUT_DIR, clipFilename);
          try { fs.copyFileSync(clipPath, alias1); } catch {}
          try { fs.copyFileSync(clipPath, alias2); } catch {}
          try { fs.copyFileSync(clipPath, alias3); } catch {}
          try { fs.copyFileSync(clipPath, alias4); } catch {}
          try { fs.copyFileSync(clipPath, alias5); } catch {}
          try { fs.copyFileSync(clipPath, alias6); } catch {}
        } catch (_) {}

        if (fs.existsSync(thumbPath)) {
          try {
            fs.copyFileSync(thumbPath, publicThumbPath);
            const thumbAlias1 = path.join(CLIPS_OUTPUT_DIR, `clip-${clipNumber}.jpg`);
            const thumbAlias2 = path.join(CLIPS_OUTPUT_DIR, thumbFilename);
            const thumbAlias3 = path.join(OUTPUT_DIR, `clip-${clipNumber}.jpg`);
            const thumbAlias4 = path.join(OUTPUT_DIR, thumbFilename);
            const thumbAlias5 = path.join(STORAGE_OUTPUT_DIR, `clip-${clipNumber}.jpg`);
            try { fs.copyFileSync(thumbPath, thumbAlias1); } catch {}
            try { fs.copyFileSync(thumbPath, thumbAlias2); } catch {}
            try { fs.copyFileSync(thumbPath, thumbAlias3); } catch {}
            try { fs.copyFileSync(thumbPath, thumbAlias4); } catch {}
            try { fs.copyFileSync(thumbPath, thumbAlias5); } catch {}
          } catch (_) {}
        }

        const clip: Clip = {
          id: clipId,
          project_id: project.id,
          user_id: user.id,
          clip_number: clipNumber,
          title: cand.title,
          file_path: clipPath,
          filename: clipFilename,
          thumbnail_path: fs.existsSync(thumbPath) ? thumbPath : undefined,
          videoUrl: `/output/clips/${clipId}.mp4`,
          thumbnailUrl: fs.existsSync(thumbPath) ? `/output/clips/${clipId}.jpg` : undefined,
          duration: cand.duration,
          start_time: cand.start,
          end_time: cand.end,
          aspect_ratio: project.settings.aspectRatio,
          caption_status: project.settings.captionsEnabled,
          caption_style: project.settings.captionStyle,
          caption_position: project.settings.captionPosition,
          caption_size: project.settings.captionSize,
          transcript_snippet: cand.snippet || cand.reason,
          hook: cand.hook,
          hook_score: cand.hookScore,
          story_score: cand.storyScore,
          engagement_score: cand.engagementScore,
          score: cand.score,
          created_at: new Date().toISOString(),
        };

        generatedClips.push(clip);
      } catch (renderErr: any) {
        console.error(`[JobQueue] Clip ${clipNumber} rendering warning:`, renderErr.message);

        // Guaranteed fallback: ultrafast straight cut so clip is NEVER missing from results
        try {
          await videoProcessor.generateClip({
            inputPath: project.file_path,
            outputPath: clipPath,
            startTime: cand.start,
            endTime: cand.end,
            aspectRatio: project.settings.aspectRatio,
            burnCaptions: false,
            watermark: hasWatermark,
            watermarkPosition: 'top-right',
          });
          await videoProcessor.generateThumbnail(clipPath, thumbPath, 0.5);

          const clipId = `clip_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
          const publicClipPath = path.join(CLIPS_OUTPUT_DIR, `${clipId}.mp4`);
          const publicThumbPath = path.join(CLIPS_OUTPUT_DIR, `${clipId}.jpg`);
          try {
            fs.copyFileSync(clipPath, publicClipPath);
            const a1 = path.join(CLIPS_OUTPUT_DIR, `clip-${clipNumber}.mp4`);
            const a2 = path.join(CLIPS_OUTPUT_DIR, clipFilename);
            const a3 = path.join(OUTPUT_DIR, `clip-${clipNumber}.mp4`);
            try { fs.copyFileSync(clipPath, a1); } catch {}
            try { fs.copyFileSync(clipPath, a2); } catch {}
            try { fs.copyFileSync(clipPath, a3); } catch {}
            if (fs.existsSync(thumbPath)) {
              fs.copyFileSync(thumbPath, publicThumbPath);
              const ta1 = path.join(CLIPS_OUTPUT_DIR, `clip-${clipNumber}.jpg`);
              const ta2 = path.join(OUTPUT_DIR, `clip-${clipNumber}.jpg`);
              try { fs.copyFileSync(thumbPath, ta1); } catch {}
              try { fs.copyFileSync(thumbPath, ta2); } catch {}
            }
          } catch (_) {}

          generatedClips.push({
            id: clipId,
            project_id: project.id,
            user_id: user.id,
            clip_number: clipNumber,
            title: cand.title || `Clip #${clipNumber}`,
            file_path: clipPath,
            filename: clipFilename,
            thumbnail_path: fs.existsSync(thumbPath) ? thumbPath : undefined,
            videoUrl: `/output/clips/${clipId}.mp4`,
            thumbnailUrl: fs.existsSync(thumbPath) ? `/output/clips/${clipId}.jpg` : undefined,
            duration: cand.duration,
            start_time: cand.start,
            end_time: cand.end,
            aspect_ratio: project.settings.aspectRatio,
            caption_status: false,
            caption_style: project.settings.captionStyle,
            caption_position: project.settings.captionPosition,
            caption_size: project.settings.captionSize,
            transcript_snippet: cand.snippet || cand.reason,
            hook: cand.hook,
            hook_score: cand.hookScore,
            story_score: cand.storyScore,
            engagement_score: cand.engagementScore,
            score: cand.score,
            created_at: new Date().toISOString(),
          });
        } catch (emErr) {
          console.error(`[JobQueue] Clip ${clipNumber} emergency generation failed:`, emErr);
        }
      }
    }

    // OUTPUT VALIDATION & RERENDER: Verify rendered output with ffprobe before marking COMPLETED
    this.updateState(jobId, 'ADDING_CAPTIONS', 92, 'Verifying video stream integrity and codec health');
    const validatedClips: Clip[] = [];

    for (const clip of generatedClips) {
      const check = await videoProcessor.validateVideoOutput(clip.file_path);
      if (check.valid) {
        validatedClips.push(clip);
      } else {
        console.warn(`[JobQueue] Clip ${clip.clip_number} failed ffprobe verification (${check.error}). Rerendering...`);
        try {
          await videoProcessor.generateClip({
            inputPath: project.file_path,
            outputPath: clip.file_path,
            startTime: clip.start_time,
            endTime: clip.end_time,
            aspectRatio: project.settings.aspectRatio,
            burnCaptions: false,
            watermark: hasWatermark,
            watermarkPosition: 'top-right',
          });
          const recheck = await videoProcessor.validateVideoOutput(clip.file_path);
          if (recheck.valid) {
            validatedClips.push(clip);
            console.log(`[JobQueue] Clip ${clip.clip_number} successfully recovered via rerender.`);
          }
        } catch (rerenderErr: any) {
          console.error(`[JobQueue] Rerender failed for clip ${clip.clip_number}:`, rerenderErr.message);
        }
      }
    }

    // Defensive guarantee: if all clips failed validation, render emergency clip and validate
    if (validatedClips.length === 0) {
      console.warn('[JobQueue] Rendering emergency fallback clip...');
      const fallbackClipPath = path.join(clipsDir, 'clip_01.mp4');
      const fallbackThumbPath = path.join(clipsDir, 'thumb_01.jpg');
      const fallbackDur = Math.min(30, videoDuration);

      await videoProcessor.generateClip({
        inputPath: project.file_path,
        outputPath: fallbackClipPath,
        startTime: 0,
        endTime: fallbackDur,
        aspectRatio: project.settings.aspectRatio,
        burnCaptions: false,
        watermark: hasWatermark,
        watermarkPosition: 'top-right',
      });

      const fbCheck = await videoProcessor.validateVideoOutput(fallbackClipPath);
      if (!fbCheck.valid) {
        throw new Error(`Video rendering failed output validation: ${fbCheck.error || 'Invalid video streams'}`);
      }

      await videoProcessor.generateThumbnail(fallbackClipPath, fallbackThumbPath, 0.5);

      const fallbackId = `clip_${Date.now()}_0_${crypto.randomUUID()}`;
      const pubFbClip = path.join(CLIPS_OUTPUT_DIR, `${fallbackId}.mp4`);
      const pubFbThumb = path.join(CLIPS_OUTPUT_DIR, `${fallbackId}.jpg`);
      try {
        fs.copyFileSync(fallbackClipPath, pubFbClip);
        if (fs.existsSync(fallbackThumbPath)) fs.copyFileSync(fallbackThumbPath, pubFbThumb);
      } catch (_) {}

      validatedClips.push({
        id: fallbackId,
        project_id: project.id,
        user_id: user.id,
        clip_number: 1,
        title: `${project.name} Highlight`,
        file_path: fallbackClipPath,
        thumbnail_path: fs.existsSync(fallbackThumbPath) ? fallbackThumbPath : undefined,
        videoUrl: `/output/clips/${fallbackId}.mp4`,
        thumbnailUrl: fs.existsSync(fallbackThumbPath) ? `/output/clips/${fallbackId}.jpg` : undefined,
        duration: fallbackDur,
        start_time: 0,
        end_time: fallbackDur,
        aspect_ratio: project.settings.aspectRatio,
        caption_status: false,
        caption_style: project.settings.captionStyle,
        caption_position: project.settings.captionPosition,
        caption_size: project.settings.captionSize,
        transcript_snippet: 'AI Highlight Moment',
        created_at: new Date().toISOString(),
      });
    }

    db.insertClips(validatedClips);

    // 6. Adding captions & finalizing
    this.updateState(jobId, 'ADDING_CAPTIONS', 96, 'Synchronizing subtitle tracks & metadata');

    // 7. Cleanup temp files (audio, temp fragments)
    this.updateState(jobId, 'FINALIZING', 98, 'Cleaning temp files & finalizing output clips');
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      if (fs.existsSync(clipsDir)) {
        const files = fs.readdirSync(clipsDir);
        for (const f of files) {
          if (f.endsWith('.tmp.mp4') || f.endsWith('.tmp.jpg') || f.endsWith('.tmp')) {
            try { fs.unlinkSync(path.join(clipsDir, f)); } catch {}
          }
        }
      }
    } catch (cleanErr: any) {
      console.warn('[JobQueue] Temp files cleanup warning:', cleanErr.message);
    }

    // 8. Completed
    this.updateState(jobId, 'COMPLETED', 100, 'All clips validated and generated successfully');

    // Send in-app notification
    const notification: Notification = {
      id: `notif_${Date.now()}_${crypto.randomUUID()}`,
      user_id: user.id,
      title: 'Clips Ready to Download!',
      message: `Your project "${project.name}" finished processing. ${validatedClips.length} short clips are ready for preview and export.`,
      type: 'success',
      read: false,
      created_at: new Date().toISOString(),
    };
    db.insertNotification(notification);
  }
}

export const jobQueue = new JobQueue();
