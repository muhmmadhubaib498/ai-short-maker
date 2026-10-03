import React, { useEffect, useState } from 'react';
import { api, getStoredToken } from '../services/api';
import type { Project, Clip, Job } from '../types';
import { ClipEditorModal } from '../components/ClipEditorModal';
import { ClipCard } from '../components/ClipCard';
import {
  Download,
  Scissors,
  Clock,
  Sparkles,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Trash2,
  Share2,
  FileArchive,
  Play,
} from 'lucide-react';

interface ProjectDetailsPageProps {
  projectId: string;
  onBack: () => void;
  onProjectDeleted: () => void;
}

export const ProjectDetailsPage: React.FC<ProjectDetailsPageProps> = ({
  projectId,
  onBack,
  onProjectDeleted,
}) => {
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editor Modal State
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryProject = async () => {
    try {
      setIsRetrying(true);
      const res = await api.retryProject(projectId);
      setJob(res.job);
      setProject(res.project);
    } catch (err: any) {
      console.error('Failed to retry project:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  const fetchProjectData = async () => {
    try {
      const res = await api.getProject(projectId);
      setProject(res.project);
      setClips(res.clips);
      setJob(res.job);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to load project details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  // Real-Time SSE with Auth Token & Non-overlapping Recursive Polling
  useEffect(() => {
    if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') return;

    let eventSource: EventSource | null = null;
    let isDisposed = false;
    let pollTimer: NodeJS.Timeout | null = null;

    try {
      const token = getStoredToken();
      const sseUrl = token
        ? `/api/projects/${projectId}/events?token=${encodeURIComponent(token)}`
        : `/api/projects/${projectId}/events`;

      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.job) {
            setJob(data.job);
            if (data.job.status === 'COMPLETED') {
              fetchProjectData();
              eventSource?.close();
            } else if (data.job.status === 'FAILED') {
              eventSource?.close();
            }
          }
        } catch (_) {}
      };

      eventSource.onerror = () => {
        // Close SSE on connection drop; polling fallback continues uninterrupted
        eventSource?.close();
      };
    } catch (_) {}

    // Recursive setTimeout polling: waits strictly for previous request completion to eliminate request storms
    const pollJobStatus = async () => {
      if (isDisposed) return;
      try {
        const res = await api.getProjectJob(projectId);
        if (!isDisposed && res.job) {
          setJob(res.job);
          if (res.job.status === 'COMPLETED') {
            fetchProjectData();
            eventSource?.close();
            return;
          } else if (res.job.status === 'FAILED') {
            eventSource?.close();
            return;
          }
        }
      } catch (err) {
        console.warn('Job polling sync:', err);
      }

      // Schedule next poll ONLY after previous request has completely finished
      if (!isDisposed) {
        pollTimer = setTimeout(pollJobStatus, 2000);
      }
    };

    // Initial delayed poll
    pollTimer = setTimeout(pollJobStatus, 2000);

    return () => {
      isDisposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (eventSource) eventSource.close();
    };
  }, [projectId, job?.status]);

  const handleDeleteProject = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete project "${project?.name}"?`)) return;
    try {
      await api.deleteProject(projectId);
      onProjectDeleted();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete project.');
    }
  };

  const handleDownloadZip = () => {
    const zipUrl = api.getZipDownloadUrl(projectId);
    window.location.href = zipUrl;
  };

  const handleDownloadClip = (clipId: string, clipNumber: number) => {
    const url = api.getClipDownloadUrl(clipId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project?.name || 'video').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_clip_${String(clipNumber).padStart(2, '0')}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-400 text-xs">
        <RotateCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
        Loading project & video clips...
      </div>
    );
  }

  if (errorMsg || !project) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
          {errorMsg || 'Project not found.'}
        </div>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const isProcessing = job && !['COMPLETED', 'FAILED'].includes(job.status);
  const isFailed = job?.status === 'FAILED';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-1">
            <span>File: {project.original_filename}</span>
            <span aria-hidden="true">·</span>
            <span>Duration: {project.duration ? `${Math.round(project.duration)}s` : 'Analyzing'}</span>
            <span aria-hidden="true">·</span>
            <span>Ratio: {project.settings.aspectRatio}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {clips.length > 0 && !isProcessing && (
            <button
              onClick={handleDownloadZip}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-2 shadow-sm shadow-indigo-600/30"
            >
              <FileArchive className="w-4 h-4" />
              Download All (ZIP)
            </button>
          )}
          <button
            onClick={handleDeleteProject}
            className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors text-xs"
            title="Delete Project"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Real Background Job Tracker */}
      {isProcessing && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 shadow-xl animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <RotateCcw className="w-5 h-5 text-indigo-400 animate-spin" />
              <div>
                <h3 className="text-sm font-semibold text-white">AI Video Processing in Progress</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{job.stage}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold font-mono text-indigo-400">{job.progress}%</span>
              <span className="block text-[10px] text-slate-500 font-mono uppercase">{job.status}</span>
            </div>
          </div>

          {/* Real Percentage Bar */}
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, job.progress)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] text-slate-400">
            <div className={`p-2 rounded bg-slate-950 ${job.progress >= 25 ? 'text-emerald-400' : ''}`}>
              1. Extract Audio ({job.progress >= 25 ? 'Done' : '...'})
            </div>
            <div className={`p-2 rounded bg-slate-950 ${job.progress >= 40 ? 'text-emerald-400' : ''}`}>
              2. Gemini Transcribe ({job.progress >= 40 ? 'Done' : '...'})
            </div>
            <div className={`p-2 rounded bg-slate-950 ${job.progress >= 60 ? 'text-emerald-400' : ''}`}>
              3. AI Highlights ({job.progress >= 60 ? 'Done' : '...'})
            </div>
            <div className={`p-2 rounded bg-slate-950 ${job.progress >= 95 ? 'text-emerald-400' : ''}`}>
              4. 9:16 FFmpeg & Captions ({job.progress >= 95 ? 'Done' : '...'})
            </div>
          </div>
        </div>
      )}

      {/* Recovery State Handling */}
      {isFailed && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 text-slate-300 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-white">Video Processing Ready to Retry</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Speech transcription or moment detection was paused due to temporary network latency. The system has automatically preserved your uploaded file.
                </p>
              </div>
            </div>
            <button
              onClick={handleRetryProject}
              disabled={isRetrying}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-2 shrink-0 disabled:opacity-50 shadow-sm shadow-indigo-600/30"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Re-queueing...' : 'Retry Processing'}
            </button>
          </div>
        </div>
      )}

      {/* Results Section: "Your clips are ready!" */}
      {!isProcessing && !isFailed && clips.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-white">Your clips are ready!</h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                AI analyzed the transcript, isolated {clips.length} standalone complete moments, and cropped to {project.settings.aspectRatio}.
              </p>
            </div>
          </div>

          {/* Clip Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                onEdit={(c) => {
                  setEditingClip(c);
                  setIsEditorOpen(true);
                }}
                onDownload={handleDownloadClip}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal Editor */}
      <ClipEditorModal
        clip={editingClip}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingClip(null);
        }}
        onClipUpdated={(updated) => {
          setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          setEditingClip(updated);
        }}
        onClipDeleted={(id) => {
          setClips((prev) => prev.filter((c) => c.id !== id));
        }}
      />
    </div>
  );
};
