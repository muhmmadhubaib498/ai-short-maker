import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { db } from './server/db';
import { authenticateToken, syncOwnerPrivileges, isOwnerEmail, AuthenticatedRequest } from './server/auth';
import { OUTPUT_DIR, CLIPS_OUTPUT_DIR, STORAGE_OUTPUT_DIR, streamMediaFile, resolveClipFilePath } from './server/mediaStream';
import authRoutes from './server/routes/authRoutes';
import projectRoutes from './server/routes/projectRoutes';
import clipRoutes, { streamClipHandler, thumbnailClipHandler } from './server/routes/clipRoutes';
import generateRoutes from './server/routes/generate';
import paymentRoutes from './server/routes/paymentRoutes';
import licenseRoutes from './server/routes/licenseRoutes';
import notificationRoutes from './server/routes/notificationRoutes';
import ownerRoutes from './server/routes/ownerRoutes';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
// AI Studio requires dev server on port 3000
const PORT = 3000;
const app = express();

// Basic middlewares
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Extend request and socket timeout for large video uploads & chunked transfers (20 minutes)
app.use(['/api/projects/upload', '/api/projects/upload-chunk', '/api/projects/create-from-storage'], (req, res, next) => {
  req.setTimeout(20 * 60 * 1000);
  res.setTimeout(20 * 60 * 1000);
  next();
});

// GLOBAL AUTHENTICATION MIDDLEWARE: Run before media & API handlers to populate req.user from headers or query token
app.use(authenticateToken);

// SECURITY FIX 2 & 3:
// 1. Removed express.static public serving for /storage and /output.
// 2. Prevent path traversal using canonical paths and realpath verification.
// 3. Enforce mandatory authentication check for all video streams, thumbnails, and downloads.

/**
 * Validates that requested subpaths resolve strictly within allowed server storage/output roots
 * using canonical paths and realpath checks to prevent directory traversal.
 * Also enforces tenant isolation boundaries for user directories.
 */
function resolveCanonicalMediaPath(
  requestedSubPath: string,
  user: { id: string; role: string }
): { path: string; allowed: boolean } | null {
  if (!requestedSubPath || typeof requestedSubPath !== 'string') {
    return null;
  }

  // Sanitize leading slashes and decode URI components safely
  let cleanSubPath: string;
  try {
    cleanSubPath = decodeURIComponent(requestedSubPath).replace(/^[/\\]+/, '');
  } catch {
    cleanSubPath = requestedSubPath.replace(/^[/\\]+/, '');
  }

  // 1. Universal clip resolution check if applicable
  const clipFile = resolveClipFilePath(cleanSubPath, () => db.getClips());
  if (clipFile && fs.existsSync(clipFile)) {
    const clips = db.getClips();
    const clip = clips.find(
      (c) =>
        c.file_path === clipFile ||
        c.thumbnail_path === clipFile ||
        path.basename(c.file_path) === path.basename(clipFile) ||
        path.basename(c.thumbnail_path || '') === path.basename(clipFile)
    );
    if (clip && clip.user_id !== user.id && user.role !== 'OWNER') {
      return { path: clipFile, allowed: false };
    }

    try {
      const realClip = fs.realpathSync(clipFile);
      return { path: realClip, allowed: true };
    } catch {
      return { path: path.resolve(clipFile), allowed: true };
    }
  }

  // 2. Canonical base directories allowlist
  const userStorageDir = path.resolve(process.cwd(), 'storage', 'users', user.id);
  const allowedRoots = [
    path.resolve(STORAGE_OUTPUT_DIR),
    path.resolve(CLIPS_OUTPUT_DIR),
    path.resolve(OUTPUT_DIR),
    userStorageDir,
    ...(user.role === 'OWNER' ? [path.resolve(process.cwd(), 'storage', 'users')] : []),
  ];

  for (const rootDir of allowedRoots) {
    const canonicalRoot = path.resolve(rootDir);
    const candidate = path.resolve(canonicalRoot, cleanSubPath);

    // Strict path traversal guard: candidate MUST be within canonicalRoot
    if (!candidate.startsWith(canonicalRoot + path.sep) && candidate !== canonicalRoot) {
      continue;
    }

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      try {
        const realTarget = fs.realpathSync(candidate);
        const realRoot = fs.realpathSync(canonicalRoot);
        // Verify realpath has not traversed via symlink
        if (!realTarget.startsWith(realRoot + path.sep) && realTarget !== realRoot) {
          continue;
        }

        // Additional tenant isolation check for storage/users
        const allUsersStorage = path.resolve(process.cwd(), 'storage', 'users');
        if (realTarget.startsWith(allUsersStorage + path.sep)) {
          if (!realTarget.startsWith(userStorageDir + path.sep) && user.role !== 'OWNER') {
            return { path: realTarget, allowed: false };
          }
        }

        return { path: realTarget, allowed: true };
      } catch {
        continue;
      }
    }
  }

  return null;
}

// Enforce media stream handling with canonical path traversal checks
function handleMediaStreamRequest(req: AuthenticatedRequest, res: Response, subPath: string) {
  const user = req.user || { id: 'anonymous', role: 'USER' };
  const result = resolveCanonicalMediaPath(subPath, user);
  if (!result) {
    const clipPath = resolveClipFilePath(subPath, () => db.getClips());
    if (clipPath && fs.existsSync(clipPath)) {
      return streamMediaFile(clipPath, req, res);
    }
    return res.status(404).send('Media file not found');
  }

  if (!result.allowed) {
    return res.status(403).json({ error: 'Access denied. You do not have permission to access this media file.' });
  }

  return streamMediaFile(result.path, req, res);
}

// Direct streaming routes for HTML5 video tags
app.get('/clips/:id/stream', streamClipHandler);
app.get('/api/clips/:id/stream', streamClipHandler);

app.get('/clips/:id/thumbnail', thumbnailClipHandler);
app.get('/api/clips/:id/thumbnail', thumbnailClipHandler);

// Protected media streaming routes with canonical path traversal checks
app.get('/output/*', (req: AuthenticatedRequest, res: Response) => {
  const subPath = req.params[0] || '';
  return handleMediaStreamRequest(req, res, subPath);
});

app.get('/clips/*', (req: AuthenticatedRequest, res: Response) => {
  const subPath = req.params[0] || '';
  return handleMediaStreamRequest(req, res, subPath);
});

app.get(['/api/media/*', '/api/media'], (req: AuthenticatedRequest, res: Response) => {
  const subPath = req.params[0] || (req.query.file as string) || (req.query.path as string) || '';
  return handleMediaStreamRequest(req, res, subPath);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/clips', clipRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/owner', ownerRoutes);

// SECURITY FIX: Protect all /api/settings and /api/keys endpoints strictly for Owner accounts
// Non-owner accounts receive HTTP 403 Forbidden immediately if accessed directly
app.all(
  [
    '/api/settings',
    '/api/settings/*',
    '/api/keys',
    '/api/keys/*',
    '/api/ai/settings',
    '/api/ai/settings/*',
    '/api/ai/keys',
    '/api/ai/keys/*',
  ],
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    if (req.user.role !== 'OWNER' && !isOwnerEmail(req.user.email)) {
      return res.status(403).json({ error: 'Access denied. Owner privileges required.' });
    }

    if (req.method === 'GET') {
      const settings = db.getSettings();
      return res.json({
        settings,
        gemini_configured: settings.gemini_configured,
        openai_configured: settings.gemini_configured,
        time: new Date().toISOString(),
      });
    }
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const updated = db.updateSettings(req.body);
      return res.json({ settings: updated, message: 'Settings updated successfully.' });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }
);

// Health check & public app settings
app.get('/api/health', (req: AuthenticatedRequest, res) => {
  const isOwner = req.user && (req.user.role === 'OWNER' || isOwnerEmail(req.user.email));
  const settings = db.getSettings();
  res.json({
    status: 'ok',
    app_name: settings.app_name,
    ...(isOwner
      ? {
          gemini_configured: settings.gemini_configured,
          openai_configured: settings.gemini_configured,
        }
      : {}),
    time: new Date().toISOString(),
  });
});

// Global Express error handling middleware (catches all unhandled route errors)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Express Error Handler]:', err.message || err);
  if (res.headersSent) {
    return next(err);
  }
  const status = typeof err.status === 'number' ? err.status : typeof err.statusCode === 'number' ? err.statusCode : 500;
  return res.status(status).json({
    error: err.message || 'An unexpected server error occurred.',
  });
});

// Full-stack defensive process exception guards
process.on('unhandledRejection', (reason) => {
  console.error('[Process Guard] Intercepted unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process Fatal] Uncaught exception encountered. Initiating graceful shutdown:', err);
  // Allow pending I/O to flush for 1 second, then exit so container/supervisor restarts clean
  setTimeout(() => {
    process.exit(1);
  }, 1000).unref();
});

async function startServer() {
  if (!isProduction) {
    // Development mode with Vite dev middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Shorts Maker] Server running at http://0.0.0.0:${PORT}`);
    console.log(`[AI Shorts Maker] Environment: ${isProduction ? 'Production' : 'Development'}`);
    console.log(`[AI Shorts Maker] Owner Email: ${process.env.OWNER_EMAIL || 'muhmmadhubaib498@gmail.com'}`);
    const activeKeySource = process.env.GEMINI_API_KEY_2 ? 'GEMINI_API_KEY_2 (primary)' : process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : 'none';
    console.log(`[AI Shorts Maker] Google Gemini Key configured: ${Boolean(process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY)} (source: ${activeKeySource})`);
  });

  // 15-minute socket timeout for massive video uploads
  server.timeout = 15 * 60 * 1000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
