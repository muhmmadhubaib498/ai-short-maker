import { getStoredToken } from './api';
import type { Project, Job } from '../types';

export interface CloudUploadProgress {
  loaded: number;
  total: number;
  percent: number;
  stage: 'uploading' | 'processing' | 'done';
}

export interface CloudUploadOptions {
  projectName: string;
  aspectRatio: string;
  captionStyle: string;
  captionPosition: string;
  captionSize: string;
  captionsEnabled: boolean;
  promptPreset: string;
  customPrompt: string;
  targetDuration: string;
  clipCount: number;
  language: string;
}

export interface UploadController {
  cancel: () => void;
}

// 1MB slice size: optimal for Cloud Run / reverse proxies and low-jitter packet transmission
const SLICE_SIZE = 1 * 1024 * 1024;
const SLICE_TIMEOUT_MS = 60 * 1000;

/**
 * Enterprise Cloud Stream Uploader:
 * Emulates direct cloud bucket multipart streaming (OpusClip / Vizard.ai architecture).
 * Completely internalizes chunking, packet slicing, and silent auto-retry.
 */
export class CloudStreamUploader {
  private file: File;
  private options: CloudUploadOptions;
  private onProgress?: (progress: CloudUploadProgress) => void;
  private isCancelled = false;
  private currentAbortController: AbortController | null = null;

  constructor(
    file: File,
    options: CloudUploadOptions,
    onProgress?: (progress: CloudUploadProgress) => void
  ) {
    this.file = file;
    this.options = options;
    this.onProgress = onProgress;
  }

  public getController(): UploadController {
    return {
      cancel: () => this.cancel(),
    };
  }

  public cancel() {
    this.isCancelled = true;
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch {}
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let timer: any = null;
      const onlineHandler = () => {
        window.removeEventListener('online', onlineHandler);
        if (timer) clearTimeout(timer);
        resolve();
      };
      window.addEventListener('online', onlineHandler, { once: true });
      timer = setTimeout(() => {
        window.removeEventListener('online', onlineHandler);
        resolve();
      }, ms);
    });
  }

  public async start(): Promise<{ project: Project; job: Job }> {
    const totalBytes = this.file.size;
    if (totalBytes === 0) {
      throw new Error('Please select a valid video file.');
    }

    const totalChunks = Math.max(1, Math.ceil(totalBytes / SLICE_SIZE));
    // SECURITY FIX: Generate project and upload UUIDs using crypto.randomUUID()
    const uploadId = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    this.onProgress?.({
      loaded: 0,
      total: totalBytes,
      percent: 1,
      stage: 'uploading',
    });

    let finalResponse: { project?: Project; job?: Job } | null = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (this.isCancelled) {
        throw new Error('Upload cancelled.');
      }

      const start = chunkIndex * SLICE_SIZE;
      const end = Math.min(totalBytes, start + SLICE_SIZE);
      const chunkBlob = this.file.slice(start, end);

      let chunkUploaded = false;
      let attempt = 0;

      // Silent infinite background retry loop for network drops
      while (!chunkUploaded && !this.isCancelled) {
        attempt++;
        const controller = new AbortController();
        this.currentAbortController = controller;

        const timeoutId = setTimeout(() => {
          controller.abort();
        }, SLICE_TIMEOUT_MS);

        try {
          const token = getStoredToken();
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const formData = new FormData();
          formData.append('uploadId', uploadId);
          formData.append('projectId', projectId);
          formData.append('chunkIndex', String(chunkIndex));
          formData.append('totalChunks', String(totalChunks));
          formData.append('fileName', this.file.name);
          formData.append('fileSize', String(this.file.size));

          formData.append('projectName', this.options.projectName || this.file.name);
          formData.append('aspectRatio', this.options.aspectRatio);
          formData.append('captionStyle', this.options.captionStyle);
          formData.append('captionPosition', this.options.captionPosition);
          formData.append('captionSize', this.options.captionSize);
          formData.append('captionsEnabled', String(this.options.captionsEnabled));
          formData.append('promptPreset', this.options.promptPreset);
          formData.append('customPrompt', this.options.customPrompt);
          formData.append('targetDuration', this.options.targetDuration);
          formData.append('clipCount', String(this.options.clipCount));
          formData.append('language', this.options.language);

          formData.append('chunk', chunkBlob, this.file.name);

          const response = await fetch('/api/projects/upload-chunk', {
            method: 'POST',
            headers,
            body: formData,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          this.currentAbortController = null;

          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              throw new Error('Your session expired. Please sign in again.');
            }
            if (response.status === 402) {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } })
                );
              }
              const errJson = await response.json().catch(() => null);
              throw new Error(errJson?.error || 'Free video generation limit reached. Please purchase credits to continue.');
            }
            throw new Error(`Upload stream interrupted (HTTP ${response.status})`);
          }

          const json = await response.json();
          if (json.project && json.job) {
            finalResponse = { project: json.project, job: json.job };
          }

          chunkUploaded = true;
        } catch (err: any) {
          clearTimeout(timeoutId);
          this.currentAbortController = null;

          if (this.isCancelled) {
            throw new Error('Upload cancelled.');
          }

          if (
            err.message &&
            (err.message.includes('session expired') ||
              err.message.includes('limit reached') ||
              err.message.includes('purchase credits') ||
              err.message.includes('credits'))
          ) {
            throw err;
          }

          // Silent backoff delay before background reconnect
          const backoff = Math.min(5000, 1000 + Math.min(attempt, 4) * 800 + Math.random() * 300);
          await this.sleep(backoff);
        }
      }

      // Smooth progress update (0% - 98%)
      const completedBytes = Math.min(totalBytes, end);
      const percent = Math.min(98, Math.max(1, Math.round((completedBytes / totalBytes) * 98)));

      this.onProgress?.({
        loaded: completedBytes,
        total: totalBytes,
        percent,
        stage: 'uploading',
      });
    }

    if (!finalResponse || !finalResponse.project || !finalResponse.job) {
      throw new Error('Video received. Initializing AI Shorts processing...');
    }

    this.onProgress?.({
      loaded: totalBytes,
      total: totalBytes,
      percent: 100,
      stage: 'done',
    });

    return {
      project: finalResponse.project,
      job: finalResponse.job,
    };
  }
}

export const cloudUploadService = {
  /**
   * Seamless silent cloud stream upload for commercial SaaS UX
   */
  async uploadVideo(
    file: File,
    options: CloudUploadOptions,
    onProgress?: (progress: CloudUploadProgress) => void,
    onControllerReady?: (controller: UploadController) => void
  ): Promise<{ project: Project; job: Job }> {
    const session = new CloudStreamUploader(file, options, onProgress);
    if (onControllerReady) {
      onControllerReady(session.getController());
    }
    return session.start();
  },
};

// Backward compatibility alias
export const chunkUploadService = cloudUploadService;
export type ChunkUploadProgress = CloudUploadProgress;
export type ChunkUploadOptions = CloudUploadOptions;
