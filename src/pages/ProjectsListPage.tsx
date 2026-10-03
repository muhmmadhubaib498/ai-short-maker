import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Project } from '../types';
import {
  FolderOpen,
  Clock,
  Sparkles,
  ArrowRight,
  Trash2,
  RotateCcw,
} from 'lucide-react';

interface ProjectsListPageProps {
  onNavigateToProject: (id: string) => void;
  onNavigateToCreate: () => void;
}

export const ProjectsListPage: React.FC<ProjectsListPageProps> = ({
  onNavigateToProject,
  onNavigateToCreate,
}) => {
  const { isOwner, isPaid, canProcessVideo } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const handleCreateClick = () => {
    if (!canProcessVideo && !isPaid && !isOwner) {
      window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached', mandatory: true } }));
      return;
    }
    onNavigateToCreate();
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await api.getProjects();
      setProjects(res.projects);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete project "${name}"?`)) return;
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete project');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Video Projects</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Access your uploaded videos, processing logs, and generated clip batches.
          </p>
        </div>

        <button
          onClick={handleCreateClick}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 self-start sm:self-auto shadow-sm shadow-indigo-600/30 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Create Video
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-xs">
          <RotateCcw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
          Loading your video projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center">
          <FolderOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No projects yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            Upload your first video to start automatically extracting 9:16 vertical shorts.
          </p>
          <button
            onClick={handleCreateClick}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => onNavigateToProject(proj.id)}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded ${
                      proj.status === 'COMPLETED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : proj.status === 'FAILED'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse'
                    }`}
                  >
                    {proj.status}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(proj.created_at).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                  {proj.name}
                </h3>
                <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                  {proj.original_filename}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3.5 h-3.5" />
                  {proj.duration ? `${Math.round(proj.duration)}s` : 'Analyzing'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDelete(e, proj.id, proj.name)}
                    className="p-1 hover:text-rose-400 transition-colors"
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-indigo-400 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
