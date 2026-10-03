import React, { useState, useEffect } from 'react';
import { api, getStoredToken } from '../services/api';
import type { Clip, AspectRatio, CaptionStyle, CaptionPosition } from '../types';
import {
  X,
  Play,
  RotateCcw,
  Scissors,
  Type,
  Download,
  Trash2,
  Check,
  AlertCircle,
  Smartphone,
  Monitor,
  Square,
} from 'lucide-react';

interface ClipEditorModalProps {
  clip: Clip | null;
  isOpen: boolean;
  onClose: () => void;
  onClipUpdated: (updated: Clip) => void;
  onClipDeleted: (id: string) => void;
}

export const ClipEditorModal: React.FC<ClipEditorModalProps> = ({
  clip,
  isOpen,
  onClose,
  onClipUpdated,
  onClipDeleted,
}) => {
  // REACT RULES OF HOOKS: All hooks must be defined at the top before any conditional returns
  const [title, setTitle] = useState(clip?.title || '');
  const [startTime, setStartTime] = useState(clip?.start_time || 0);
  const [endTime, setEndTime] = useState(clip?.end_time || 0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(clip?.aspect_ratio || '9:16');
  const [captionStatus, setCaptionStatus] = useState<boolean>(clip?.caption_status || false);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(clip?.caption_style || 'clean');
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>(clip?.caption_position || 'bottom');
  const [captionSize, setCaptionSize] = useState<'small' | 'medium' | 'large'>(clip?.caption_size || 'medium');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [srcIndex, setSrcIndex] = useState(0);
  const [videoError, setVideoError] = useState(false);

  // Synchronize component state whenever clip prop changes or modal opens
  useEffect(() => {
    if (clip && isOpen) {
      setTitle(clip.title || '');
      setStartTime(clip.start_time || 0);
      setEndTime(clip.end_time || 0);
      setAspectRatio(clip.aspect_ratio || '9:16');
      setCaptionStatus(Boolean(clip.caption_status));
      setCaptionStyle(clip.caption_style || 'clean');
      setCaptionPosition(clip.caption_position || 'bottom');
      setCaptionSize(clip.caption_size || 'medium');
      setSrcIndex(0);
      setVideoError(false);
      setErrorMsg(null);
      setSaveSuccess(false);
    }
  }, [clip, isOpen]);

  // Conditional return strictly AFTER all hooks
  if (!isOpen || !clip) return null;

  const duration = Math.max(1, Number((endTime - startTime).toFixed(1)));

  // Helper to ensure all URLs are strictly absolute URLs with auth token
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

  // Deterministic candidate URLs with fallback progression (strictly absolute and relative)
  const candidateUrls = [
    toAbsoluteMediaUrl(`/api/clips/${clip.id}/stream`),
    toAbsoluteMediaUrl(`/clips/${clip.id}/stream`),
    toAbsoluteMediaUrl(`/output/${validFilename}`),
    toAbsoluteMediaUrl(`/output/clip-${clip.clip_number}.mp4`),
    toAbsoluteMediaUrl(`/output/clips/${clip.id}.mp4`),
    clip.videoUrl ? toAbsoluteMediaUrl(api.getMediaUrl(clip.videoUrl)) : '',
    toAbsoluteMediaUrl(`/api/media/${validFilename}`),
  ]
    .filter(Boolean)
    .filter((url, idx, self) => self.indexOf(url) === idx);

  const videoMediaUrl = candidateUrls[srcIndex] || toAbsoluteMediaUrl(`/output/${validFilename}`);
  const thumbnailUrl = toAbsoluteMediaUrl(api.getThumbnailUrl(clip) || `/output/clip-${clip.clip_number}.jpg`);

  const handleVideoError = () => {
    if (srcIndex < candidateUrls.length - 1) {
      setSrcIndex((prev) => prev + 1);
      setVideoError(false);
    } else {
      setVideoError(true);
    }
  };

  const handleSave = async (reprocess = false) => {
    setErrorMsg(null);
    setSaveSuccess(false);
    setIsSaving(true);

    try {
      const res = await api.updateClip(clip.id, {
        title,
        start_time: startTime,
        end_time: endTime,
        aspect_ratio: aspectRatio,
        caption_status: captionStatus,
        caption_style: captionStyle,
        caption_position: captionPosition,
        caption_size: captionSize,
        reprocess,
      });

      onClipUpdated(res.clip);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to save clip edits.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete Clip #${clip.clip_number}?`)) return;
    try {
      await api.deleteClip(clip.id);
      onClipDeleted(clip.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete clip.');
    }
  };

  const handleDownload = () => {
    const url = api.getClipDownloadUrl(clip.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clip_${clip.clip_number}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-indigo-600/30 text-indigo-400 font-mono text-xs flex items-center justify-center font-bold">
              #{clip.clip_number}
            </span>
            <h3 className="text-base font-semibold text-white">Clip Editor</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close clip editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          {/* Left: Video Player Preview */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <div
              className={`relative overflow-hidden rounded-lg bg-black shadow-lg flex items-center justify-center ${
                aspectRatio === '9:16'
                  ? 'w-[200px] h-[355px]'
                  : aspectRatio === '1:1'
                  ? 'w-[260px] h-[260px]'
                  : 'w-[320px] h-[180px]'
              } transition-all`}
            >
              <video
                key={`${clip.id}-${aspectRatio}-${srcIndex}`}
                src={videoMediaUrl}
                poster={thumbnailUrl}
                controls
                preload="metadata"
                playsInline
                onError={handleVideoError}
                className="w-full h-full object-cover"
              />

              {/* Dynamic caption overlay preview */}
              {captionStatus && (
                <div
                  className={`absolute inset-x-2 pointer-events-none text-center px-2 py-1 select-none ${
                    captionPosition === 'top'
                      ? 'top-4'
                      : captionPosition === 'middle'
                      ? 'top-1/2 -translate-y-1/2'
                      : 'bottom-6'
                  }`}
                >
                  <span
                    className={`inline-block px-2 py-0.5 rounded font-bold leading-tight ${
                      captionStyle === 'bold'
                        ? 'bg-amber-400 text-black uppercase tracking-wider'
                        : captionStyle === 'modern'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : captionStyle === 'highlight'
                        ? 'bg-black/80 text-yellow-300 border border-yellow-400/50'
                        : captionStyle === 'minimal'
                        ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
                        : 'bg-black/75 text-white'
                    } ${
                      captionSize === 'small' ? 'text-xs' : captionSize === 'large' ? 'text-base' : 'text-sm'
                    }`}
                  >
                    {clip.transcript_snippet ? clip.transcript_snippet.slice(0, 45) + '...' : 'Preview captions text here'}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 text-[11px] text-slate-400 font-mono text-center">
              Duration: <span className="text-white font-semibold">{duration}s</span> · Ratio: {aspectRatio}
            </div>
          </div>

          {/* Right: Controls & Form */}
          <div className="lg:col-span-7 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>Changes saved successfully!</span>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Clip Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Trimming Controls */}
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-indigo-400" />
                  Trim Timestamps (seconds)
                </span>
                <span className="text-[11px] font-mono text-indigo-300 font-semibold">{duration} seconds</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Start Time (sec)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={endTime - 1}
                    value={startTime}
                    onChange={(e) => setStartTime(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">End Time (sec)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={startTime + 1}
                    value={endTime}
                    onChange={(e) => setEndTime(Math.max(startTime + 1, parseFloat(e.target.value) || startTime + 1))}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Aspect Ratio Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                    aspectRatio === '9:16'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  9:16 Shorts
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                    aspectRatio === '16:9'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  16:9 Wide
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('1:1')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                    aspectRatio === '1:1'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Square className="w-3.5 h-3.5" />
                  1:1 Square
                </button>
              </div>
            </div>

            {/* Captions Controls */}
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-indigo-400" />
                  Synchronized Captions
                </label>
                <button
                  type="button"
                  onClick={() => setCaptionStatus(!captionStatus)}
                  className={`text-xs px-2.5 py-0.5 rounded font-medium transition-colors ${
                    captionStatus ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {captionStatus ? 'Captions ON' : 'Captions OFF'}
                </button>
              </div>

              {captionStatus && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Style</label>
                    <select
                      value={captionStyle}
                      onChange={(e) => setCaptionStyle(e.target.value as CaptionStyle)}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                    >
                      <option value="clean">Clean</option>
                      <option value="bold">Bold Yellow</option>
                      <option value="modern">Modern Violet</option>
                      <option value="highlight">Highlight Words</option>
                      <option value="minimal">Minimalist</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Position</label>
                    <select
                      value={captionPosition}
                      onChange={(e) => setCaptionPosition(e.target.value as CaptionPosition)}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                    >
                      <option value="bottom">Bottom (Social standard)</option>
                      <option value="middle">Middle</option>
                      <option value="top">Top</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Font Size</label>
                    <select
                      value={captionSize}
                      onChange={(e) => setCaptionSize(e.target.value as any)}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors text-xs flex items-center gap-1.5"
              title="Delete clip"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete Clip</span>
            </button>
            <button
              onClick={handleDownload}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1.5"
              title="Download clip MP4"
            >
              <Download className="w-4 h-4" />
              <span>Download MP4</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Save Metadata
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm shadow-indigo-600/30"
            >
              {isSaving ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  Reprocessing FFmpeg...
                </>
              ) : (
                <>
                  <Scissors className="w-3.5 h-3.5" />
                  Save & Reprocess Clip
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
