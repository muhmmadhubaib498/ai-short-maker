import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../db';
import { requireAuth, AuthenticatedRequest, reserveUserCredit, hasValidProAccess, isOwnerEmail } from '../auth';
import { jobQueue } from '../jobs';
import type { Project, Job, AspectRatio } from '../../src/types';

const router = Router();

// Helper to check and deduct credit atomically
export function verifyAndDeductCredit(req: AuthenticatedRequest, res: Response): boolean {
  const user = req.user!;
  const result = reserveUserCredit(user.id);
  if (!result.success) {
    res.status(402).json({
      code: 'FREE_LIMIT_REACHED',
      error: result.error || 'Free demo video limit reached (0 credits remaining). Please upgrade to Pro or redeem a License Key to continue.',
      demo_used: true,
      credits: 0,
    });
    return false;
  }

  req.user!.credits = result.remainingCredits;
  req.user!.demo_used = true;
  return true;
}

// GET /api/generate/credits - Check user credits status
router.get('/credits', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const freshUser = db.getUserById(user.id) || user;
  const { isPro, isOwner } = hasValidProAccess(user.id);
  const credits = isOwner || isPro ? 9999 : (freshUser.demo_used ? 0 : (typeof freshUser.credits === 'number' ? freshUser.credits : 1));

  return res.json({
    credits,
    isOwner,
    hasActiveSub: isPro,
    demo_used: Boolean(freshUser.demo_used),
    canGenerate: isOwner || isPro || (!freshUser.demo_used && credits > 0),
  });
});

// POST /api/generate - Direct generation triggering with strict credit limit verification
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;

  // 1. Strictly verify user.credits > 0 before starting FFmpeg rendering
  if (!verifyAndDeductCredit(req, res)) {
    return;
  }

  try {
    const {
      projectId,
      storageUrl,
      storagePath,
      projectName,
      aspectRatio = '9:16',
      captionStyle = 'modern',
      captionPosition = 'bottom',
      captionSize = 'medium',
      captionsEnabled = true,
      promptPreset = 'viral_hooks',
      clipCount = 3,
      language = 'en',
    } = req.body;

    let targetProject: Project | undefined;

    if (projectId) {
      targetProject = db.getProjectById(projectId);
      if (!targetProject) {
        return res.status(404).json({ error: 'Project not found.' });
      }
    } else if (storagePath || storageUrl) {
      const resolvedPath = storagePath || path.resolve(process.cwd(), storageUrl.replace(/^\//, ''));
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Source video file not found.' });
      }

      // SECURITY FIX: Generate project UUID using crypto.randomUUID()
      const pId = crypto.randomUUID();
      targetProject = {
        id: pId,
        user_id: user.id,
        name: projectName || 'Generated Video',
        original_filename: path.basename(resolvedPath),
        file_path: resolvedPath,
        duration: 0,
        status: 'QUEUED',
        settings: {
          aspectRatio: aspectRatio as AspectRatio,
          captionStyle,
          captionPosition,
          captionSize,
          captionsEnabled,
          promptPreset,
          clipCount: Math.min(Math.max(clipCount, 1), 10),
          language,
          targetDuration: '30-60s',
        },
        transcript: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      db.insertProject(targetProject);
    } else {
      return res.status(400).json({ error: 'Either projectId or video storagePath is required to generate.' });
    }

    // Create Job
    const jobId = `job_${crypto.randomUUID()}`;
    const job: Job = {
      id: jobId,
      user_id: user.id,
      project_id: targetProject.id,
      job_type: 'VIDEO_PROCESSING',
      status: 'QUEUED',
      progress: 5,
      stage: 'Queued for processing',
      error_message: null,
      credit_deducted: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.insertJob(job);

    // Enqueue FFmpeg video processing
    jobQueue.enqueueVideoProcessing(job.id);

    return res.status(200).json({
      success: true,
      message: 'Video generation initiated successfully.',
      project: targetProject,
      job,
      remainingCredits: req.user!.credits,
    });
  } catch (err: any) {
    console.error('[Generate Route Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to initiate video generation.' });
  }
});

export default router;
