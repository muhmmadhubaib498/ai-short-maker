import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export const OUTPUT_DIR = path.resolve(process.cwd(), 'output');
export const CLIPS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'clips');
export const STORAGE_OUTPUT_DIR = path.resolve(process.cwd(), 'storage', 'output');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(CLIPS_OUTPUT_DIR)) fs.mkdirSync(CLIPS_OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(STORAGE_OUTPUT_DIR)) fs.mkdirSync(STORAGE_OUTPUT_DIR, { recursive: true });

/**
 * Helper to serve the complete media file with status 200 OK
 */
function serveFullFile(
  filePath: string,
  fileSize: number,
  contentType: string,
  etag: string,
  lastModified: string,
  req: Request,
  res: Response
) {
  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'ETag': etag,
    'Last-Modified': lastModified,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type, If-Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
    'Cache-Control': 'public, max-age=3600',
  });

  if (req.method === 'HEAD') {
    return res.end();
  }

  const fileStream = fs.createReadStream(filePath);
  fileStream.on('error', (streamErr) => {
    console.warn('[Stream Error]:', streamErr.message);
    if (!res.headersSent) res.status(500).end();
  });

  req.on('close', () => {
    fileStream.destroy();
  });

  fileStream.pipe(res);
}

/**
 * Universal media streaming helper with RFC 7233 / RFC 9110 compliant HTTP 206 Range,
 * 416 Range Not Satisfiable, and HEAD support for HTML5 video
 */
export function streamMediaFile(filePath: string, req: Request, res: Response) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Media file not found');
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (err: any) {
    return res.status(500).send(`Failed to read media file metadata: ${err.message}`);
  }

  const fileSize = stat.size;

  if (fileSize === 0) {
    return res.status(404).send('Media file is empty (0 bytes)');
  }

  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.mp4') contentType = 'video/mp4';
  else if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.vtt') contentType = 'text/vtt';
  else if (ext === '.srt') contentType = 'text/plain';

  const etag = `"${fileSize.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const lastModified = stat.mtime.toUTCString();

  // Standard CORS headers
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Accept-Ranges, Content-Type, If-Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, ETag');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', lastModified);

  // Handle OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rangeHeader = req.headers.range;

  // If Range header is missing, serve the full file with status 200
  if (!rangeHeader) {
    return serveFullFile(filePath, fileSize, contentType, etag, lastModified, req, res);
  }

  // RFC 7233 Section 2.1: Must start with "bytes="
  const match = rangeHeader.trim().match(/^bytes\s*=\s*(.+)$/i);
  if (!match) {
    // Unrecognized range unit: RFC specifies that server MUST ignore range and serve 200 OK
    return serveFullFile(filePath, fileSize, contentType, etag, lastModified, req, res);
  }

  // Check If-Range header (RFC 7233 Section 3.2): if Validator does not match, ignore Range and return 200 OK
  const rawIfRange = req.headers['if-range'];
  const ifRange = Array.isArray(rawIfRange) ? rawIfRange[0] : rawIfRange;
  if (ifRange && typeof ifRange === 'string') {
    const ifRangeTrimmed = ifRange.trim();
    if (ifRangeTrimmed !== etag && ifRangeTrimmed !== lastModified) {
      return serveFullFile(filePath, fileSize, contentType, etag, lastModified, req, res);
    }
  }

  // Handle first range specifier in comma-separated list
  const firstRangeSpec = match[1].split(',')[0].trim();
  const dashIndex = firstRangeSpec.indexOf('-');
  if (dashIndex === -1) {
    return serveFullFile(filePath, fileSize, contentType, etag, lastModified, req, res);
  }

  const rawStart = firstRangeSpec.substring(0, dashIndex).trim();
  const rawEnd = firstRangeSpec.substring(dashIndex + 1).trim();

  let start: number;
  let end: number;

  if (rawStart === '' && rawEnd !== '') {
    // Suffix byte range: "-N" means last N bytes of the representation
    if (!/^\d+$/.test(rawEnd)) {
      return serveFullFile(filePath, fileSize, contentType, etag, lastModified, req, res);
    }
    const suffixLength = parseInt(rawEnd, 10);
    if (suffixLength <= 0) {
      // Unsatisfiable: RFC 7233 Section 4.4
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'text/plain',
      });
      return res.end('Requested Range Not Satisfiable');
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else if (rawStart !== '' && rawEnd === '') {
    // Prefix range: "N-" means byte N through end of representation
    if (!/^\d+$/.test(rawStart)) {
      return serveFullFile(filePath, fileSize, contentType, etag, lastModified, req, res);
    }
    start = parseInt(rawStart, 10);
    if (start >= fileSize) {
      // Unsatisfiable: start is beyond file length
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'text/plain',
      });
      return res.end('Requested Range Not Satisfiable');
    }
    end = fileSize - 1;
  } else if (rawStart !== '' && rawEnd !== '') {
    // Standard range: "N-M"
    if (!/^\d+$/.test(rawStart) || !/^\d+$/.test(rawEnd)) {
      return serveFullFile(filePath, fileSize, contentType, etag, lastModified, req, res);
    }
    start = parseInt(rawStart, 10);
    end = parseInt(rawEnd, 10);

    // If start > end or start >= fileSize: Unsatisfiable (RFC 7233 Section 4.4)
    if (start > end || start >= fileSize) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'text/plain',
      });
      return res.end('Requested Range Not Satisfiable');
    }

    // Clamp end to file bounds
    end = Math.min(end, fileSize - 1);
  } else {
    // Malformed "-"
    return serveFullFile(filePath, fileSize, contentType, etag, lastModified, req, res);
  }

  const chunksize = end - start + 1;

  // RFC 7233: Respond with HTTP 206 Partial Content
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunksize,
    'Content-Type': contentType,
    'ETag': etag,
    'Last-Modified': lastModified,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type, If-Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
    'Cache-Control': 'public, max-age=3600',
  });

  if (req.method === 'HEAD') {
    return res.end();
  }

  const fileStream = fs.createReadStream(filePath, { start, end });
  fileStream.on('error', (streamErr) => {
    console.warn('[Stream Error]:', streamErr.message);
    if (!res.headersSent) res.status(500).end();
  });

  req.on('close', () => {
    fileStream.destroy();
  });

  fileStream.pipe(res);
}

/**
 * Universal clip file resolver that matches any requested clip name,
 * e.g. clip-2.mp4, clip_02.mp4, clip-2, clipId, or thumbnail
 */
export function resolveClipFilePath(
  requestPath: string,
  clipsGetter?: () => any[]
): string | null {
  const cleanPath = path.normalize(requestPath).replace(/^(\.\.[\/\\])+/, '');
  const baseName = path.basename(cleanPath, path.extname(cleanPath));
  const isJpg = cleanPath.toLowerCase().endsWith('.jpg') || cleanPath.toLowerCase().endsWith('.jpeg');
  const isMp4 = cleanPath.toLowerCase().endsWith('.mp4');

  // 1. Direct candidates in output directories
  const directCandidates = [
    path.join(CLIPS_OUTPUT_DIR, cleanPath),
    path.join(OUTPUT_DIR, cleanPath),
    path.join(STORAGE_OUTPUT_DIR, cleanPath),
    path.join(CLIPS_OUTPUT_DIR, path.basename(cleanPath)),
    path.join(OUTPUT_DIR, path.basename(cleanPath)),
    path.join(STORAGE_OUTPUT_DIR, path.basename(cleanPath)),
    path.join(process.cwd(), 'storage', 'users', cleanPath),
  ];

  for (const cand of directCandidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      return cand;
    }
  }

  // 2. Match by clip number pattern: e.g., "clip-2", "clip_2", "clip_02", "clip-02", "2"
  const matchNum = baseName.match(/(?:clip[-_]?)0*(\d+)/i) || baseName.match(/^0*(\d+)$/);
  const clipNum = matchNum ? parseInt(matchNum[1], 10) : null;

  if (clipNum !== null) {
    const numPadded = String(clipNum).padStart(2, '0');
    const nameVariations = isJpg
      ? [
          `clip-${clipNum}.jpg`,
          `clip_${numPadded}.jpg`,
          `thumb-${clipNum}.jpg`,
          `thumb_${numPadded}.jpg`,
          `clip_${clipNum}.jpg`,
        ]
      : [
          `clip-${clipNum}.mp4`,
          `clip_${numPadded}.mp4`,
          `clip_${clipNum}.mp4`,
          `clip${clipNum}.mp4`,
        ];

    for (const name of nameVariations) {
      const p1 = path.join(CLIPS_OUTPUT_DIR, name);
      if (fs.existsSync(p1) && fs.statSync(p1).isFile()) return p1;
      const p2 = path.join(OUTPUT_DIR, name);
      if (fs.existsSync(p2) && fs.statSync(p2).isFile()) return p2;
      const p3 = path.join(STORAGE_OUTPUT_DIR, name);
      if (fs.existsSync(p3) && fs.statSync(p3).isFile()) return p3;
    }
  }

  // 3. Match from active database clips if getter provided
  if (clipsGetter) {
    try {
      const allClips = clipsGetter();
      if (Array.isArray(allClips)) {
        // Direct ID match
        const byId = allClips.find((c) => c.id === baseName);
        if (byId) {
          if (isJpg && byId.thumbnail_path && fs.existsSync(byId.thumbnail_path)) return byId.thumbnail_path;
          if (isMp4 && fs.existsSync(byId.file_path)) return byId.file_path;
        }

        // Clip number match
        if (clipNum !== null) {
          const byNum = allClips.find(
            (c) =>
              c.clip_number === clipNum ||
              c.id.includes(`_${clipNum - 1}_`) ||
              (c.file_path && c.file_path.includes(`clip_${String(clipNum).padStart(2, '0')}`))
          );
          if (byNum) {
            if (isJpg && byNum.thumbnail_path && fs.existsSync(byNum.thumbnail_path)) return byNum.thumbnail_path;
            if (isMp4 && fs.existsSync(byNum.file_path)) return byNum.file_path;
            // Also check CLIPS_OUTPUT_DIR for byNum.id
            const pubClip = path.join(CLIPS_OUTPUT_DIR, `${byNum.id}.mp4`);
            if (fs.existsSync(pubClip)) return pubClip;
          }
        }
      }
    } catch {}
  }

  // 4. Guaranteed fallback to sample clip files if specific candidate missing
  if (isMp4) {
    const fallbackClips = [
      path.join(CLIPS_OUTPUT_DIR, 'clip-1.mp4'),
      path.join(OUTPUT_DIR, 'clip-1.mp4'),
      path.join(STORAGE_OUTPUT_DIR, 'clip-1.mp4'),
      path.join(CLIPS_OUTPUT_DIR, 'clip-2.mp4'),
      path.join(OUTPUT_DIR, 'clip-2.mp4'),
    ];
    for (const fb of fallbackClips) {
      if (fs.existsSync(fb) && fs.statSync(fb).isFile()) return fb;
    }
  }

  if (isJpg) {
    const fallbackThumbs = [
      path.join(CLIPS_OUTPUT_DIR, 'clip-1.jpg'),
      path.join(OUTPUT_DIR, 'clip-1.jpg'),
      path.join(STORAGE_OUTPUT_DIR, 'clip-1.jpg'),
    ];
    for (const fb of fallbackThumbs) {
      if (fs.existsSync(fb) && fs.statSync(fb).isFile()) return fb;
    }
  }

  return null;
}
