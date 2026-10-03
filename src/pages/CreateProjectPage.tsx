import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { firestoreService } from '../services/firestoreService';
import { cloudUploadService, type UploadController } from '../services/chunkUploadService';
import type { AspectRatio, CaptionStyle, CaptionPosition } from '../types';
import {
  UploadCloud,
  FileVideo,
  Sparkles,
  Scissors,
  Check,
  AlertCircle,
  Smartphone,
  Monitor,
  Square,
  Type,
  Lock,
  ArrowRight,
  HelpCircle,
  Cloud,
  RotateCcw,
  X,
} from 'lucide-react';

interface CreateProjectPageProps {
  onProjectCreated: (projectId: string) => void;
  onNavigateToSubscription: () => void;
}

const PRESET_OPTIONS = [
  { id: 'Best Moments', label: 'Best Moments', desc: 'High retention peaks & standout quotes' },
  { id: 'Funny', label: 'Funny Moments', desc: 'Humor, jokes, comedic timing & reactions' },
  { id: 'Motivational', label: 'Motivational', desc: 'Inspiring wisdom, energy, and drive' },
  { id: 'Educational', label: 'Educational', desc: 'Tutorial moments, explanations & insights' },
  { id: 'Important Points', label: 'Important Points', desc: 'Core takeaways and summary thoughts' },
  { id: 'Emotional', label: 'Emotional', desc: 'Deep personal storytelling and resonance' },
  { id: 'Viral-worthy', label: 'Viral-Worthy Hooks', desc: 'Catchy controversial or debate starters' },
  { id: 'Storytelling', label: 'Storytelling', desc: 'Complete narrative anecdotes with resolution' },
  { id: 'Podcast Highlights', label: 'Podcast Highlights', desc: 'Engaging guest responses and banter' },
  { id: 'Custom', label: 'Custom Instruction', desc: 'Provide your own specific search prompt' },
];

export const CreateProjectPage: React.FC<CreateProjectPageProps> = ({
  onProjectCreated,
  onNavigateToSubscription,
}) => {
  const { user, isOwner, isPaid, canProcessVideo, refreshUser } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');

  // AI Prompt settings
  const [promptPreset, setPromptPreset] = useState('Best Moments');
  const [customPrompt, setCustomPrompt] = useState('');
  const [targetDuration, setTargetDuration] = useState('30-60s');
  const [clipCount, setClipCount] = useState(3);
  const [language, setLanguage] = useState('auto');

  // Video output settings
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('clean');
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>('bottom');
  const [captionSize, setCaptionSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Commercial Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const uploadControllerRef = useRef<UploadController | null>(null);

  const handleCancelUpload = () => {
    if (uploadControllerRef.current) {
      uploadControllerRef.current.cancel();
    }
    setIsUploading(false);
    setUploadProgress(0);
    uploadControllerRef.current = null;
  };

  // Automatically show mandatory Pricing Modal overlay when credits are exhausted
  React.useEffect(() => {
    if (!canProcessVideo && user && !isOwner) {
      window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached', mandatory: true } }));
    }
  }, [canProcessVideo, user, isOwner]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const MAX_2GB = 2048 * 1024 * 1024;
      if (file.size > MAX_2GB) {
        setErrorMsg(`Video file is too large (${(file.size / (1024 * 1024)).toFixed(0)}MB). Maximum allowed size is 2GB (2,048MB).`);
        return;
      }
      setSelectedFile(file);
      if (!projectName) {
        setProjectName(file.name.replace(/\.[^/.]+$/, ''));
      }
      setErrorMsg(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const MAX_2GB = 2048 * 1024 * 1024;
      if (file.size > MAX_2GB) {
        setErrorMsg(`Video file is too large (${(file.size / (1024 * 1024)).toFixed(0)}MB). Maximum allowed size is 2GB (2,048MB).`);
        return;
      }
      setSelectedFile(file);
      if (!projectName) {
        setProjectName(file.name.replace(/\.[^/.]+$/, ''));
      }
      setErrorMsg(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select a video file to upload.');
      return;
    }

    // STRICT 1-FREE-DEMO HARD PAYWALL:
    if (!canProcessVideo && !isPaid && !isOwner) {
      window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } }));
      setErrorMsg('You have already used your 1 free demo project. Please upgrade to Pro to continue creating AI Shorts.');
      return;
    }

    const MAX_2GB = 2048 * 1024 * 1024;
    if (selectedFile.size > MAX_2GB) {
      setErrorMsg(`Video file exceeds the 2GB limit. Please choose a file up to 2GB.`);
      return;
    }

    setErrorMsg(null);
    setIsUploading(true);
    setUploadProgress(2);

    try {
      const uploadOptions = {
        projectName: projectName.trim() || selectedFile.name,
        promptPreset,
        customPrompt,
        targetDuration,
        clipCount,
        language,
        aspectRatio,
        captionsEnabled,
        captionStyle,
        captionPosition,
        captionSize,
      };

      const res = await cloudUploadService.uploadVideo(
        selectedFile,
        uploadOptions,
        (progress) => {
          setUploadProgress(progress.percent);
        },
        (ctrl) => {
          uploadControllerRef.current = ctrl;
        }
      );

      setUploadProgress(100);

      // Track project in Firestore asynchronously
      firestoreService.syncProject(res.project).catch((e) => {
        console.warn('Firestore project sync warning:', e);
      });

      // Immediately refresh user state so credits = 0 and demo_used = true are reflected in UI
      await refreshUser().catch(() => {});

      // Brief delay so user sees 100% completion before smooth transition
      setTimeout(() => {
        onProjectCreated(res.project.id);
      }, 400);
    } catch (err: any) {
      if (err.message && err.message.includes('cancelled')) {
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }
      console.error('Upload error:', err);

      // Paywall HTTP 402 detection: automatically open Pricing Modal
      if (
        err.status === 402 ||
        err.code === 'FREE_LIMIT_REACHED' ||
        String(err.message || '').toLowerCase().includes('limit reached') ||
        String(err.message || '').toLowerCase().includes('purchase credits')
      ) {
        window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } }));
      }

      setErrorMsg(err.message || 'Unable to upload video. Please check your network and try again.');
      setIsUploading(false);
      setUploadProgress(0);
    } finally {
      uploadControllerRef.current = null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Create AI Shorts</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Upload your long video. AI will transcribe speech, detect engaging moments, and render 9:16 vertical clips.
        </p>
      </div>

      {/* Free Demo Consumed Banner */}
      {!canProcessVideo && user && (
        <div className="mb-6 bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                1-Free-Demo Consumed <span className="text-[11px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">0 Credits Left</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Your 1 free trial video demo has been used. To create more viral shorts, please upgrade to Pro or redeem a License Key.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } }))}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm shadow-indigo-600/30 cursor-pointer"
            >
              View Plans <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } }))}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-xs transition-colors cursor-pointer"
            >
              Redeem Key
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-400 hover:text-rose-200 transition-colors p-1"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. File Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center cursor-pointer transition-colors ${
            selectedFile
              ? 'border-indigo-500/60 bg-indigo-950/20'
              : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo"
            onChange={handleFileChange}
            className="hidden"
          />

          {selectedFile ? (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-3">
                <FileVideo className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-white truncate max-w-md">{selectedFile.name}</h3>
              <p className="text-xs text-slate-400 font-mono mt-1">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Ready for AI processing
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
                className="mt-3 text-xs text-slate-400 hover:text-rose-400 transition-colors underline"
              >
                Change video file
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-slate-800/80 text-slate-400 flex items-center justify-center mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">
                Choose video or drag & drop here
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mb-3">
                Supports MP4, MOV, MKV, WEBM, AVI (up to 2GB / 2,000MB) via High-Speed Chunked Upload.
              </p>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors">
                  Browse Files
                </span>
                <span className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px] font-medium rounded-lg flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5" />
                  Chunked Upload (Up to 2GB)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Project Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. Founder Interview Episode 4"
            className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* 2. "What should the AI look for?" Section */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold text-white mb-1 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              What should the AI look for?
            </label>
            <p className="text-xs text-slate-400">
              The AI models will specifically rank moments matching this intent and ensure thoughts aren't cut mid-sentence.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {PRESET_OPTIONS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPromptPreset(preset.id)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  promptPreset === preset.id
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold truncate">{preset.label}</div>
                <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{preset.desc}</div>
              </button>
            ))}
          </div>

          {promptPreset === 'Custom' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Custom AI Instruction
              </label>
              <textarea
                rows={2}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. Find the 3 most shocking statements about future AI models and the host's reaction..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>

        {/* 3. Clip Duration & Count Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Target Duration */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <label className="block text-xs font-semibold text-slate-300 mb-2">Target Duration</label>
            <div className="grid grid-cols-2 gap-2">
              {['30-60s', '1-2m', '2-3m', 'custom'].map((dur) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setTargetDuration(dur)}
                  className={`py-2 px-2 text-xs font-mono font-medium rounded-lg border transition-colors ${
                    targetDuration === dur
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {dur}
                </button>
              ))}
            </div>
          </div>

          {/* Number of Clips */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <label className="block text-xs font-semibold text-slate-300 mb-2">Clip Quantity</label>
            <div className="flex items-center gap-1.5">
              {[3, 5, 10, 15, 20].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setClipCount(cnt)}
                  className={`flex-1 py-2 text-xs font-mono font-medium rounded-lg border transition-colors ${
                    clipCount === cnt
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* Spoken Language */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <label className="block text-xs font-semibold text-slate-300 mb-2">Spoken Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="auto">Auto Detect</option>
              <option value="en">English</option>
              <option value="ur">Urdu (اردو)</option>
              <option value="hi">Hindi (हिन्दी)</option>
            </select>
          </div>
        </div>

        {/* 4. Output Video Settings (Aspect Ratio & Captions) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-white">Video Formatting & Captions</h3>
              <p className="text-[11px] text-slate-400">Intelligent center crop and synchronized subtitle overlays</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Aspect Ratio */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`py-2 px-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
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
                  className={`py-2 px-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
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
                  className={`py-2 px-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
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

            {/* Caption Style */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium text-slate-400">Captions</label>
                <button
                  type="button"
                  onClick={() => setCaptionsEnabled(!captionsEnabled)}
                  className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                    captionsEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {captionsEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              {captionsEnabled ? (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={captionStyle}
                    onChange={(e) => setCaptionStyle(e.target.value as any)}
                    className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                  >
                    <option value="clean">Clean White</option>
                    <option value="bold">Bold Yellow</option>
                    <option value="modern">Modern Violet</option>
                    <option value="highlight">Highlight Words</option>
                    <option value="minimal">Minimalist</option>
                  </select>

                  <select
                    value={captionPosition}
                    onChange={(e) => setCaptionPosition(e.target.value as any)}
                    className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                  >
                    <option value="bottom">Bottom (Social Safe)</option>
                    <option value="middle">Middle</option>
                    <option value="top">Top</option>
                  </select>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-1 font-mono">No captions will be rendered</div>
              )}
            </div>
          </div>
        </div>

        {/* Commercial Progress Experience (OpusClip / Vizard.ai Style) */}
        {isUploading && (
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 space-y-5 animate-fade-in shadow-2xl shadow-indigo-950/40">
            {/* 4-Step Pipeline Stepper */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-medium">
              <div className="p-3 rounded-xl bg-indigo-600/15 border border-indigo-500/40 text-indigo-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping shrink-0" />
                <span className="truncate">1. Uploading Video</span>
              </div>
              <div
                className={`p-3 rounded-xl border flex items-center gap-2 transition-colors ${
                  uploadProgress >= 100
                    ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                <span className="truncate">2. Transcribing Speech</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                <span className="truncate">3. Finding Best Moments</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                <span className="truncate">4. Generating 9:16 Shorts</span>
              </div>
            </div>

            {/* Progress Bar & Status */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white font-medium flex items-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  {uploadProgress < 100 ? `Streaming video to cloud... ${uploadProgress}%` : 'Finalizing video stream...'}
                </span>
                <span className="text-indigo-400 font-bold font-mono text-sm">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 rounded-full transition-all duration-300 shadow-sm shadow-indigo-500/50"
                  style={{ width: `${Math.max(4, uploadProgress)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-slate-400">
                Cloud stream upload active. Packet loss and network drops are absorbed silently in background.
              </p>
              <button
                type="button"
                onClick={handleCancelUpload}
                className="px-3 py-1 text-slate-400 hover:text-rose-300 text-xs transition-colors flex items-center gap-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Generate AI Shorts / Create Video Button */}
        <div
          className="pt-2"
          onClick={() => {
            if (!canProcessVideo && !isOwner) {
              window.dispatchEvent(
                new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached', mandatory: true } })
              );
            }
          }}
        >
          {!canProcessVideo && user && !isOwner && (
            <div className="mb-2.5 text-center text-xs text-amber-400 font-medium flex items-center justify-center gap-1.5 bg-amber-500/10 border border-amber-500/20 py-2 px-3 rounded-xl cursor-pointer">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Free generation limit reached (0 credits). Upgrade to Pro or Redeem License Key to enable Create Video.</span>
            </div>
          )}
          <button
            type="submit"
            disabled={!selectedFile || isUploading || (!canProcessVideo && !isOwner)}
            className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold rounded-2xl transition-all shadow-xl shadow-indigo-600/25 disabled:shadow-none flex items-center justify-center gap-2.5 text-sm sm:text-base cursor-pointer disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 animate-spin text-white" />
                <span>Processing Video ({uploadProgress}%)...</span>
              </span>
            ) : (!canProcessVideo && !isOwner) ? (
              <span className="flex items-center gap-2 text-slate-400">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Create Video (0 Credits — Pro Required)</span>
              </span>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>Create Video ({clipCount} Short Clips)</span>
                <ArrowRight className="w-4 h-4 text-indigo-200" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
