import React, { useState, useRef } from 'react';
import { api, getStoredToken } from '../services/api';
import type { Clip } from '../types';
import { Scissors, Download, AlertCircle, Play, Pause, Check, RotateCcw } from 'lucide-react';

interface ClipCardProps {
  clip: Clip;
  onEdit: (clip: Clip) => void;
  onDownload?: (clipId: string, clipNumber: number) => void;
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, onEdit, onDownload }) => {
  const [videoError, setVideoError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [retryAttempts, setRetryAttempts] = useState(0);

  // Helper to ensure URLs are absolute or relative paths with origin and auth token
  const toAbsoluteMediaUrl = (urlOrPath: string): string => {
    if (!urlOrPath) return '';
    if (urlOrPath.startsWith('blob:')) {
      return urlOrPath;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    let fullUrl = urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')
      ? urlOrPath
      : `${origin}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
    const token = getStoredToken();
    if (token && !fullUrl.includes('token=')) {
      const sep = fullUrl.includes('?') ? '&' : '?';
      fullUrl = `${fullUrl}${sep}token=${encodeURIComponent(token)}`;
    }
    return fullUrl;
  };

  // Extract and validate filename ensuring proper .mp4 extension
  let rawFilename =
    clip.filename ||
    (clip as any).filename ||
    (clip.file_path ? clip.file_path.split(/[\/\\]/).pop() : '') ||
    `clip-${clip.clip_number}.mp4`;

  if (!rawFilename.toLowerCase().endsWith('.mp4')) {
    rawFilename = `${rawFilename.replace(/\.[^/.]+$/, '')}.mp4`;
  }
  const validFilename = rawFilename;

  // Primary source: /api/clips/${clip.id}/stream with authenticated range streaming
  const candidateUrls = [
    toAbsoluteMediaUrl(api.getMediaUrl(`/api/clips/${clip.id}/stream`)),
    clip.videoUrl ? toAbsoluteMediaUrl(api.getMediaUrl(clip.videoUrl)) : '',
    toAbsoluteMediaUrl(api.getMediaUrl(`/clips/${clip.id}/stream`)),
    toAbsoluteMediaUrl(api.getMediaUrl(`/output/${validFilename}`)),
    toAbsoluteMediaUrl(api.getMediaUrl(`/output/clip-${clip.clip_number}.mp4`)),
    toAbsoluteMediaUrl(api.getMediaUrl(`/output/clips/${clip.id}.mp4`)),
    toAbsoluteMediaUrl(api.getMediaUrl(`/api/media/${validFilename}`)),
  ]
    .filter(Boolean)
    .filter((url, idx, self) => self.indexOf(url) === idx);

  const [srcIndex, setSrcIndex] = useState(0);
  const currentVideoUrl = candidateUrls[srcIndex] || toAbsoluteMediaUrl(api.getMediaUrl(`/api/clips/${clip.id}/stream`));
  const thumbnailUrl = toAbsoluteMediaUrl(api.getThumbnailUrl(clip) || `/output/clip-${clip.clip_number}.jpg`);

  const handleVideoError = () => {
    if (srcIndex < candidateUrls.length - 1) {
      // Auto-failover to next candidate streaming endpoint
      console.warn(`[ClipCard #${clip.clip_number}] Source ${candidateUrls[srcIndex]} failed, trying ${candidateUrls[srcIndex + 1]}...`);
      setSrcIndex((prev) => prev + 1);
      setVideoError(false);
    } else if (retryAttempts < 2) {
      // Automatic retry cycle after transient network stall
      console.warn(`[ClipCard #${clip.clip_number}] Cycling back to primary source...`);
      setRetryAttempts((prev) => prev + 1);
      setSrcIndex(0);
      setVideoError(false);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.load();
        }
      }, 500);
    } else {
      setVideoError(true);
      setIsBuffering(false);
    }
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoError(false);
    setSrcIndex(0);
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDownload) {
      onDownload(clip.id, clip.clip_number);
      return;
    }

    setDownloading(true);
    const downloadUrl = api.getClipDownloadUrl(clip.id);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `clip_${String(clip.clip_number).padStart(2, '0')}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all shadow-lg hover:shadow-xl group">
      {/* 9:16 Video Player Container */}
      <div
        onClick={togglePlay}
        className="relative aspect-[9/16] bg-black overflow-hidden flex items-center justify-center cursor-pointer select-none"
      >
        {videoError ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400 z-20">
            <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
            <p className="text-xs font-semibold text-slate-300">Video preview unavailable</p>
            <button
              onClick={handleRetry}
              className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry Playback
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              controls
              preload="metadata"
              playsInline
              poster={thumbnailUrl}
              src={currentVideoUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => setIsBuffering(false)}
              onError={handleVideoError}
              className="w-full h-full object-cover"
            />

            {/* Play Overlay (appears when paused and not in error state) */}
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none transition-opacity group-hover:bg-black/35">
                <div className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5 ml-0.5 fill-white" />
                </div>
              </div>
            )}

            {/* Buffering Spinner */}
            {isBuffering && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </>
        )}

        {/* Top Badges */}
        <div className="absolute top-2 left-2 pointer-events-none flex items-center gap-1.5 z-10">
          <span className="bg-black/80 backdrop-blur-md text-white text-[11px] font-mono px-2 py-0.5 rounded-md font-semibold border border-white/10 shadow-sm">
            #{clip.clip_number}
          </span>
          <span className="bg-emerald-950/80 backdrop-blur-md text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-emerald-500/20 shadow-sm flex items-center gap-1">
            {clip.aspect_ratio === '9:16'
              ? '720x1280 HD'
              : clip.aspect_ratio === '16:9'
              ? '1280x720 HD'
              : '720x720 HD'}
          </span>
        </div>
        <div className="absolute top-2 right-2 pointer-events-none flex items-center gap-1.5 z-10">
          {(clip.score || clip.hook_score) && (
            <span className="bg-amber-950/80 backdrop-blur-md text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-amber-500/20 shadow-sm">
              🔥 {clip.score || clip.hook_score}% Viral
            </span>
          )}
          <span className="bg-black/80 backdrop-blur-md text-indigo-300 text-[11px] font-mono px-2 py-0.5 rounded-md border border-white/10 shadow-sm">
            {clip.duration}s
          </span>
        </div>
      </div>

      {/* Metadata & Controls */}
      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2" title={clip.title}>
            {clip.title}
          </h3>
          {clip.hook ? (
            <div className="mt-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider block">3s Hook Factor</span>
              <p className="text-[11px] text-amber-200 line-clamp-2 italic leading-tight mt-0.5">"{clip.hook}"</p>
            </div>
          ) : clip.transcript_snippet ? (
            <p className="text-xs text-slate-400 italic line-clamp-2 mt-1" title={clip.transcript_snippet}>
              "{clip.transcript_snippet}"
            </p>
          ) : null}
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-2">
            <span>Ratio: {clip.aspect_ratio}</span>
            <span>·</span>
            <span>Captions: {clip.caption_status ? 'ON' : 'OFF'}</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
          <button
            onClick={() => onEdit(clip)}
            className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Scissors className="w-3.5 h-3.5" />
            Preview / Edit
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-300 rounded-lg transition-colors text-xs cursor-pointer flex items-center justify-center"
            title="Download MP4"
          >
            {downloading ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
