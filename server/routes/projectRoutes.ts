import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { db } from '../db';
import { requireAuth, checkSubscriptionOrDemo, AuthenticatedRequest } from '../auth';
import { verifyAndDeductCredit } from './generate';
import { jobQueue, jobEvents } from '../jobs';
import { videoProcessor } from '../videoProcessor';
import { enrichClipWithUrls } from './clipRoutes';
import type { Project, Job, ProjectSettings, AspectRatio, CaptionStyle, CaptionPosition } from '../../src/types';

const router = Router();

const STORAGE_USERS = path.resolve(process.cwd(), 'storage', 'users');

const storage = multer.diskStorage({
  destination: (req: AuthenticatedRequest, file, cb) => {
    const userId = req.user?.id || 'anonymous';
    // SECURITY FIX: Generate project UUID using crypto.randomUUID()
    const projectId = req.body.projectId || crypto.randomUUID();
    req.body.projectId = projectId; // ensure persisted
    const dir = path.join(STORAGE_USERS, userId, 'projects', projectId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `original${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max for direct upload to prevent proxy 413 drops
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.3gp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Invalid video format. Supported formats: MP4, MOV, MKV, WEBM, AVI, M4V.'));
    }
  },
});

const handleUpload = (req: any, res: any, next: any) => {
  upload.single('video')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error:
            'Direct single upload exceeds the 25MB gateway limit. 1MB Resilient Chunked upload is required to prevent packet loss and HTTP 413 errors.',
        });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message || 'Failed to process uploaded video.' });
    }
    next();
  });
};

// Temporary directory for chunked uploads
const STORAGE_TEMP_CHUNKS = path.resolve(process.cwd(), 'storage', 'temp_chunks');
if (!fs.existsSync(STORAGE_TEMP_CHUNKS)) {
  fs.mkdirSync(STORAGE_TEMP_CHUNKS, { recursive: true });
}

// TTL-based cleanup for abandoned upload chunks (2 hours TTL)
const CHUNK_TTL_MS = 2 * 60 * 60 * 1000;
function cleanupAbandonedChunks(ttlMs: number = CHUNK_TTL_MS) {
  try {
    if (!fs.existsSync(STORAGE_TEMP_CHUNKS)) return;
    const now = Date.now();
    const entries = fs.readdirSync(STORAGE_TEMP_CHUNKS);
    for (const entry of entries) {
      const entryPath = path.join(STORAGE_TEMP_CHUNKS, entry);
      try {
        const stat = fs.statSync(entryPath);
        if (now - stat.mtimeMs > ttlMs) {
          fs.rmSync(entryPath, { recursive: true, force: true });
        }
      } catch {}
    }
  } catch {}
}

// Run abandoned chunk cleanup periodically every 30 minutes
setInterval(() => cleanupAbandonedChunks(), 30 * 60 * 1000).unref();

// Strict enum allowlists for project settings
const VALID_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1']);
const VALID_CAPTION_STYLES = new Set(['clean', 'karaoke', 'box', 'bold']);
const VALID_CAPTION_POSITIONS = new Set(['bottom', 'center', 'top']);
const VALID_CAPTION_SIZES = new Set(['small', 'medium', 'large']);

function sanitizeProjectSettings(body: any): ProjectSettings {
  const aspectRatio = VALID_ASPECT_RATIOS.has(body.aspectRatio) ? (body.aspectRatio as AspectRatio) : '9:16';
  const captionStyle = VALID_CAPTION_STYLES.has(body.captionStyle) ? (body.captionStyle as CaptionStyle) : 'clean';
  const captionPosition = VALID_CAPTION_POSITIONS.has(body.captionPosition) ? (body.captionPosition as CaptionPosition) : 'bottom';
  const captionSize = VALID_CAPTION_SIZES.has(body.captionSize) ? (body.captionSize as 'small' | 'medium' | 'large') : 'medium';

  // Strict boolean conversion
  const captionsEnabled =
    typeof body.captionsEnabled === 'boolean'
      ? body.captionsEnabled
      : body.captionsEnabled !== 'false' && body.captionsEnabled !== false && body.captionsEnabled !== '0';

  const clipCount = Math.min(20, Math.max(1, parseInt(body.clipCount, 10) || 3));
  const targetDuration = typeof body.targetDuration === 'string' && body.targetDuration.trim()
    ? body.targetDuration.trim()
    : '30-60s';

  const promptPreset = typeof body.promptPreset === 'string' && body.promptPreset.trim()
    ? body.promptPreset.trim()
    : 'Best Moments';

  const customPrompt = typeof body.customPrompt === 'string' ? body.customPrompt.slice(0, 500) : '';
  const language = typeof body.language === 'string' && body.language.trim() ? body.language.trim() : 'auto';

  return {
    aspectRatio,
    captionStyle,
    captionPosition,
    captionSize,
    captionsEnabled,
    promptPreset,
    customPrompt,
    targetDuration,
    clipCount,
    language,
  };
}

const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_TEMP_CHUNKS);
  },
  filename: (req, file, cb) => {
    cb(null, `raw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
  },
});

const uploadChunkMiddleware = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB max per chunk
  },
}).single('chunk');

// Helper to safely pipe chunk file into destination stream
async function appendFileChunk(chunkPath: string, writeStream: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(chunkPath);
    readStream.on('error', reject);
    readStream.on('end', resolve);
    readStream.pipe(writeStream, { end: false });
  });
}

// POST /api/projects/upload-chunk
// GET /api/projects/upload-chunk/status
// Query which chunks have already reached the server for resumable uploads
router.get('/upload-chunk/status', requireAuth, (req: AuthenticatedRequest, res) => {
  const uploadId = req.query.uploadId as string;
  if (!uploadId || !/^[a-zA-Z0-9_\-]+$/.test(uploadId)) {
    return res.status(400).json({ error: 'Invalid or missing uploadId' });
  }
  const uploadDir = path.join(STORAGE_TEMP_CHUNKS, uploadId);
  const canonicalDir = path.resolve(uploadDir);
  if (!canonicalDir.startsWith(path.resolve(STORAGE_TEMP_CHUNKS) + path.sep)) {
    return res.status(400).json({ error: 'Path traversal detected in uploadId' });
  }
  if (!fs.existsSync(uploadDir)) {
    return res.json({ receivedChunks: [] });
  }
  try {
    const files = fs.readdirSync(uploadDir);
    const receivedChunks: number[] = [];
    for (const f of files) {
      if (f.startsWith('chunk_')) {
        const idx = parseInt(f.replace('chunk_', ''), 10);
        if (!isNaN(idx)) receivedChunks.push(idx);
      }
    }
    return res.json({ receivedChunks });
  } catch (err: any) {
    return res.json({ receivedChunks: [] });
  }
});

// Robust chunked video upload endpoint that completely eliminates 413 limits and third-party credential dependencies
router.post('/upload-chunk', requireAuth, checkSubscriptionOrDemo, (req: AuthenticatedRequest, res) => {
  uploadChunkMiddleware(req, res, async (err: any) => {
    if (err) {
      console.error('[Upload Chunk Error]:', err);
      return res.status(400).json({ error: err.message || 'Chunk upload failed' });
    }

    try {
      const user = req.user!;
      const {
        uploadId,
        chunkIndex: rawChunkIndex,
        totalChunks: rawTotalChunks,
        fileName,
      } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'Missing chunk file data.' });
      }

      if (!uploadId || !/^[a-zA-Z0-9_\-]+$/.test(uploadId)) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Invalid or missing uploadId parameter.' });
      }

      const uploadDir = path.join(STORAGE_TEMP_CHUNKS, uploadId);
      const canonicalDir = path.resolve(uploadDir);
      if (!canonicalDir.startsWith(path.resolve(STORAGE_TEMP_CHUNKS) + path.sep)) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Invalid uploadId parameter.' });
      }

      const chunkIndex = parseInt(rawChunkIndex, 10);
      const totalChunks = parseInt(rawTotalChunks, 10);
      const totalBytes = req.body.totalBytes ? parseInt(req.body.totalBytes, 10) : null;

      // Strict chunk parameter validations
      if (isNaN(chunkIndex) || isNaN(totalChunks) || totalChunks <= 0 || totalChunks > 1000) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Invalid totalChunks parameter (must be an integer from 1 to 1000).' });
      }

      if (chunkIndex < 0 || chunkIndex >= totalChunks) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: `Invalid chunkIndex ${chunkIndex} (must be 0 to ${totalChunks - 1}).` });
      }

      if (req.file.size <= 0) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Uploaded chunk file is empty (0 bytes).' });
      }

      if (totalBytes !== null && (isNaN(totalBytes) || totalBytes <= 0 || totalBytes > 500 * 1024 * 1024)) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Invalid totalBytes parameter (cannot exceed 500MB).' });
      }

      // Opportunistic abandoned chunks cleanup
      cleanupAbandonedChunks();

      // Check if project was already assembled on a prior retry of the final chunk
      if (req.body.projectId) {
        const existingProj = db.getProjectById(req.body.projectId);
        if (existingProj && existingProj.user_id === user.id) {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          const existingJob = db.getJobByProjectId(existingProj.id);
          return res.json({
            status: 'completed',
            project: existingProj,
            job: existingJob,
          });
        }
      }

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const chunkFile = path.join(uploadDir, `chunk_${chunkIndex}`);
      // Move uploaded chunk into uploadDir
      fs.renameSync(req.file.path, chunkFile);

      // Check if all chunks (0 to totalChunks - 1) have arrived
      let allChunksReceived = true;
      for (let i = 0; i < totalChunks; i++) {
        if (!fs.existsSync(path.join(uploadDir, `chunk_${i}`))) {
          allChunksReceived = false;
          break;
        }
      }

      if (!allChunksReceived) {
        return res.json({
          status: 'chunk_received',
          chunkIndex,
          totalChunks,
          uploadId,
        });
      }

      // All chunks received! Assemble complete video file into user's project directory
      console.log(`[Upload Chunk] All ${totalChunks} chunks received for ${uploadId}. Assembling video file...`);

      // SECURITY FIX: Generate project UUID using crypto.randomUUID()
      const projectId = req.body.projectId || crypto.randomUUID();
      const originalFilename = fileName || 'video.mp4';
      const ext = path.extname(originalFilename).toLowerCase() || '.mp4';
      const projectName = (req.body.projectName || originalFilename.replace(/\.[^/.]+$/, '') || 'Untitled Video').slice(0, 80);

      const userDir = path.join(STORAGE_USERS, user.id, 'projects', projectId);
      if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

      const finalFilePath = path.join(userDir, `original${ext}`);
      const writeStream = fs.createWriteStream(finalFilePath);

      for (let i = 0; i < totalChunks; i++) {
        const cPath = path.join(uploadDir, `chunk_${i}`);
        await appendFileChunk(cPath, writeStream);
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', (e) => reject(e));
        writeStream.end();
      });

      console.log(`[Upload Chunk] Video assembled successfully: ${finalFilePath} (${fs.statSync(finalFilePath).size} bytes)`);

      // Clean up temporary chunks
      try {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      } catch (rmErr) {
        console.warn('Could not clean up temp chunks directory:', rmErr);
      }

      // Parse settings strictly with enum and boolean validation
      const parsedSettings: ProjectSettings = sanitizeProjectSettings(req.body);

      const newProject: Project = {
        id: projectId,
        user_id: user.id,
        name: projectName,
        original_filename: originalFilename,
        file_path: finalFilePath,
        duration: 0,
        status: 'PROCESSING',
        settings: parsedSettings,
        transcript: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Strictly verify user.credits > 0 and deduct credit before initiating generation
      if (!verifyAndDeductCredit(req, res)) {
        return;
      }

      db.insertProject(newProject);

      const newJob: Job = {
        id: `job_${crypto.randomUUID()}`,
        user_id: user.id,
        project_id: projectId,
        job_type: 'TRANSCRIPTION_AND_CLIPS',
        status: 'QUEUED',
        progress: 10,
        stage: 'Video received and queued for AI transcription & highlight extraction',
        error_message: null,
        credit_deducted: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      db.insertJob(newJob);

      // Enqueue background processing
      jobQueue.enqueueVideoProcessing(newJob.id);

      return res.status(201).json({
        project: newProject,
        job: newJob,
      });
    } catch (err: any) {
      console.error('Error assembling chunks:', err);
      return res.status(500).json({ error: `Failed to assemble uploaded video: ${err.message}` });
    }
  });
});

// POST /api/projects/create-from-storage
// Direct client-to-Firebase Storage upload handler: eliminates 413 Body Entity Too Large
router.post('/create-from-storage', requireAuth, checkSubscriptionOrDemo, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const {
      storageUrl,
      storagePath,
      originalFilename,
      fileSize,
      projectName: rawProjectName,
      aspectRatio,
      captionStyle,
      captionPosition,
      captionSize,
      captionsEnabled,
      promptPreset,
      customPrompt,
      targetDuration,
      clipCount,
      language,
    } = req.body;

    if (!storageUrl) {
      return res.status(400).json({ error: 'Direct storage URL is required.' });
    }

    // Strictly verify user.credits > 0 and deduct credit before initiating generation
    if (!verifyAndDeductCredit(req, res)) {
      return;
    }

    // SECURITY FIX: Generate project UUID using crypto.randomUUID()
    const projectId = crypto.randomUUID();
    const projectName = (rawProjectName || originalFilename?.replace(/\.[^/.]+$/, '') || 'Untitled Video').slice(0, 80);

    const ext = path.extname(originalFilename || '') || '.mp4';
    const userDir = path.join(STORAGE_USERS, user.id, 'projects', projectId);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

    const localFilePath = path.join(userDir, `original${ext}`);

    // Parse settings strictly with enum and boolean validation
    const parsedSettings: ProjectSettings = sanitizeProjectSettings(req.body);

    const newProject: Project = {
      id: projectId,
      user_id: user.id,
      name: projectName,
      original_filename: originalFilename || 'video.mp4',
      file_path: localFilePath,
      duration: 0,
      status: 'PROCESSING',
      settings: parsedSettings,
      transcript: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Strictly verify user.credits > 0 and deduct credit before initiating generation
    if (!verifyAndDeductCredit(req, res)) {
      return;
    }

    db.insertProject(newProject);

    const newJob: Job = {
      id: `job_${crypto.randomUUID()}`,
      user_id: user.id,
      project_id: projectId,
      job_type: 'TRANSCRIPTION_AND_CLIPS',
      status: 'QUEUED',
      progress: 5,
      stage: 'Streaming video from Firebase Cloud Storage for AI processing',
      error_message: null,
      credit_deducted: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.insertJob(newJob);

    // Asynchronously stream file from Firebase Storage to local disk and start pipeline
    (async () => {
      try {
        console.log(`[Storage Video] Streaming ${storageUrl} to local disk ${localFilePath}...`);
        const response = await fetch(storageUrl);
        if (!response.ok || !response.body) {
          throw new Error(`Failed to fetch video stream from Firebase Storage (HTTP ${response.status})`);
        }
        const fileStream = fs.createWriteStream(localFilePath);
        // @ts-ignore
        await pipeline(Readable.fromWeb(response.body), fileStream);
        console.log(`[Storage Video] Successfully saved video to disk: ${localFilePath}`);

        // Enqueue background processing
        jobQueue.enqueueVideoProcessing(newJob.id);
      } catch (dlErr: any) {
        console.error('[Storage Video] Download failed:', dlErr);
        db.updateJob(newJob.id, {
          status: 'FAILED',
          error_message: `Failed to download video from Firebase Storage: ${dlErr.message}`,
        });
        db.updateProject(projectId, { status: 'FAILED' });
      }
    })();

    return res.status(201).json({
      project: newProject,
      job: newJob,
    });
  } catch (err: any) {
    console.error('Error creating project from storage:', err);
    return res.status(500).json({ error: 'Failed to process project from Firebase Storage.' });
  }
});

// POST /api/projects/upload
router.post('/upload', requireAuth, checkSubscriptionOrDemo, handleUpload, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Please upload a video file.' });
    }

    const projectId = req.body.projectId;
    const projectName = (req.body.projectName || file.originalname.replace(/\.[^/.]+$/, '')).slice(0, 80);

    // Parse settings strictly with enum and boolean validation
    const parsedSettings: ProjectSettings = sanitizeProjectSettings(req.body);

    const newProject: Project = {
      id: projectId,
      user_id: user.id,
      name: projectName,
      original_filename: file.originalname,
      file_path: file.path,
      duration: 0,
      status: 'PROCESSING',
      settings: parsedSettings,
      transcript: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Strictly verify user.credits > 0 and deduct credit before initiating generation
    if (!verifyAndDeductCredit(req, res)) {
      return;
    }

    db.insertProject(newProject);

    const newJob: Job = {
      id: `job_${crypto.randomUUID()}`,
      user_id: user.id,
      project_id: projectId,
      job_type: 'TRANSCRIPTION_AND_CLIPS',
      status: 'QUEUED',
      progress: 5,
      stage: 'Uploading & queueing video for AI processing',
      error_message: null,
      credit_deducted: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.insertJob(newJob);

    // Enqueue background processing
    jobQueue.enqueueVideoProcessing(newJob.id);

    return res.status(201).json({
      project: newProject,
      job: newJob,
    });
  } catch (err: any) {
    console.error('Project upload error:', err);
    return res.status(500).json({ error: err.message || 'Video upload failed.' });
  }
});

// GET /api/projects
router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const projects = db.getProjectsByUserId(req.user!.id);
  return res.json({ projects });
});

// GET /api/projects/:id
router.get('/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  // Strict User Isolation
  if (project.user_id !== req.user!.id && req.user!.role !== 'OWNER') {
    return res.status(403).json({ error: 'Access denied to this project.' });
  }

  const clips = db.getClipsByProjectId(project.id).map(enrichClipWithUrls);
  const job = db.getJobByProjectId(project.id);

  return res.json({
    project,
    clips,
    job,
  });
});

// GET /api/projects/:id/job
router.get('/:id/job', requireAuth, (req: AuthenticatedRequest, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.user_id !== req.user!.id && req.user!.role !== 'OWNER') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const job = db.getJobByProjectId(project.id);
  return res.json({ job });
});

// GET /api/projects/:id/events (Server-Sent Events for real-time live progress updates)
router.get('/:id/events', requireAuth, (req: AuthenticatedRequest, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.user_id !== req.user!.id && req.user!.role !== 'OWNER') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial job status immediately
  const initialJob = db.getJobByProjectId(project.id);
  res.write(`data: ${JSON.stringify({ job: initialJob, project })}\n\n`);

  const eventName = `job:${project.id}`;
  const listener = (data: any) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };

  jobEvents.on(eventName, listener);

  // Heartbeat every 10s to keep connection open
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (_) {}
  }, 10000);

  req.on('close', () => {
    clearInterval(heartbeat);
    jobEvents.off(eventName, listener);
  });
});

// POST /api/projects/:id/retry
// Entitlement Check: Verify active subscription or demo credits before retrying
router.post('/:id/retry', requireAuth, checkSubscriptionOrDemo, (req: AuthenticatedRequest, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.user_id !== req.user!.id && req.user!.role !== 'OWNER') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  if (!fs.existsSync(project.file_path)) {
    return res.status(400).json({ error: 'Original video file not found on disk.' });
  }

  const existingJob = db.getJobByProjectId(project.id);
  if (existingJob && ['PROCESSING', 'ANALYZING', 'TRANSCRIBING', 'GENERATING_CLIPS'].includes(existingJob.status)) {
    return res.status(409).json({ error: 'This project is already currently being processed. Please wait for it to complete.' });
  }

  // Atomically check and deduct credit / verify subscription entitlement
  if (!verifyAndDeductCredit(req, res)) {
    return;
  }

  db.updateProject(project.id, { status: 'PROCESSING' });

  let job = existingJob;
  if (job) {
    job = db.updateJob(job.id, {
      status: 'QUEUED',
      progress: 5,
      stage: 'Re-queued video for AI transcription & viral clip generation',
      error_message: null,
      credit_deducted: true,
      updated_at: new Date().toISOString(),
    }) || job;
  } else {
    job = {
      id: `job_${crypto.randomUUID()}`,
      user_id: req.user!.id,
      project_id: project.id,
      job_type: 'TRANSCRIPTION_AND_CLIPS',
      status: 'QUEUED',
      progress: 5,
      stage: 'Re-queued video for AI transcription & viral clip generation',
      error_message: null,
      credit_deducted: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.insertJob(job);
  }

  jobQueue.enqueueVideoProcessing(job.id);
  return res.json({ success: true, project, job });
});

// POST /api/projects/:id/reprocess
// Entitlement Check: Verify active subscription or demo credits before reprocessing
router.post('/:id/reprocess', requireAuth, checkSubscriptionOrDemo, (req: AuthenticatedRequest, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.user_id !== req.user!.id && req.user!.role !== 'OWNER') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  if (!fs.existsSync(project.file_path)) {
    return res.status(400).json({ error: 'Original video file not found on disk.' });
  }

  const existingJob = db.getJobByProjectId(project.id);
  if (existingJob && ['PROCESSING', 'ANALYZING', 'TRANSCRIBING', 'GENERATING_CLIPS'].includes(existingJob.status)) {
    return res.status(409).json({ error: 'This project is already currently being processed. Please wait for it to complete.' });
  }

  // Backend clip count limit verification
  const settings = db.getSettings();
  const sub = db.getSubscriptionByUserId(req.user!.id);
  const now = new Date();
  const hasActiveSub = sub && sub.status === 'ACTIVE' && (sub.expires_at === null || new Date(sub.expires_at) > now);
  const isPaid = req.user!.role === 'OWNER' || Boolean(hasActiveSub);
  const maxClips = isPaid ? 20 : (settings.demo_max_clips || 3);

  const {
    aspectRatio,
    captionStyle,
    captionPosition,
    captionSize,
    captionsEnabled,
    promptPreset,
    customPrompt,
    targetDuration,
    clipCount,
    language,
  } = req.body;

  if (clipCount && Number(clipCount) > maxClips) {
    return res.status(400).json({
      error: isPaid
        ? `Maximum allowed clips is ${maxClips}.`
        : `Free demo limit is ${maxClips} clips. Upgrade to Pro for up to 20 clips per video.`,
    });
  }

  // Atomically check and deduct credit / verify subscription entitlement
  if (!verifyAndDeductCredit(req, res)) {
    return;
  }

  if (aspectRatio || captionStyle || clipCount || promptPreset) {
    const updatedSettings = {
      ...project.settings,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(captionStyle ? { captionStyle } : {}),
      ...(captionPosition ? { captionPosition } : {}),
      ...(captionSize ? { captionSize } : {}),
      ...(captionsEnabled !== undefined ? { captionsEnabled: Boolean(captionsEnabled) } : {}),
      ...(promptPreset ? { promptPreset } : {}),
      ...(customPrompt !== undefined ? { customPrompt } : {}),
      ...(targetDuration ? { targetDuration } : {}),
      ...(clipCount ? { clipCount: Math.min(Number(clipCount), maxClips) } : {}),
      ...(language ? { language } : {}),
    };
    db.updateProject(project.id, { settings: updatedSettings });
    project.settings = updatedSettings;
  }

  db.updateProject(project.id, { status: 'PROCESSING' });

  let job = existingJob;
  if (job) {
    job = db.updateJob(job.id, {
      status: 'QUEUED',
      progress: 5,
      stage: 'Re-processing video for AI highlights and viral clips',
      error_message: null,
      credit_deducted: true,
      updated_at: new Date().toISOString(),
    }) || job;
  } else {
    job = {
      id: `job_${crypto.randomUUID()}`,
      user_id: req.user!.id,
      project_id: project.id,
      job_type: 'TRANSCRIPTION_AND_CLIPS',
      status: 'QUEUED',
      progress: 5,
      stage: 'Re-processing video for AI highlights and viral clips',
      error_message: null,
      credit_deducted: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.insertJob(job);
  }

  jobQueue.enqueueVideoProcessing(job.id);
  return res.json({ success: true, project, job, message: 'Project re-queued for processing successfully.' });
});

// GET /api/projects/:id/download-zip
router.get('/:id/download-zip', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (project.user_id !== req.user!.id && req.user!.role !== 'OWNER') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const clips = db.getClipsByProjectId(project.id);
    if (clips.length === 0) {
      return res.status(400).json({ error: 'No clips available to package into ZIP.' });
    }

    const safeName = project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const downloadFilename = `${safeName}_clips.zip`;
    // SECURITY: Use crypto.randomUUID() for temporary ZIP filenames to prevent collisions and overwrites
    const tempZipFilename = `tmp_zip_${crypto.randomUUID()}.zip`;
    const tempZipPath = path.join(path.dirname(project.file_path), tempZipFilename);

    const clipItems = clips.map((c) => ({
      path: c.file_path,
      filename: `${safeName}_clip_${String(c.clip_number).padStart(2, '0')}.mp4`,
    }));

    await videoProcessor.createClipsZip(clipItems, tempZipPath);

    res.download(tempZipPath, downloadFilename, (err) => {
      if (err) {
        console.error('ZIP download error:', err);
      }
      // Clean temporary zip after sending
      if (fs.existsSync(tempZipPath)) {
        try {
          fs.unlinkSync(tempZipPath);
        } catch (_) {}
      }
    });
  } catch (err: any) {
    console.error('Download ZIP error:', err);
    return res.status(500).json({ error: 'Failed to create ZIP package.' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.user_id !== req.user!.id && req.user!.role !== 'OWNER') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  // Delete project files on disk
  const projectDir = path.dirname(project.file_path);
  if (fs.existsSync(projectDir)) {
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Error removing project dir:', e);
    }
  }

  db.deleteProject(project.id);
  return res.json({ success: true, message: 'Project deleted successfully.' });
});

export default router;
