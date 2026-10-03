import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Clip, AspectRatio } from '../types';
import { ClipEditorModal } from '../components/ClipEditorModal';
import { ClipCard } from '../components/ClipCard';
import {
  Scissors,
  Download,
  Search,
  Filter,
  Trash2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const MyClipsPage: React.FC<{ onNavigateToCreate: () => void }> = ({ onNavigateToCreate }) => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratioFilter, setRatioFilter] = useState<string>('all');

  // Clip editor
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const fetchClips = async () => {
    try {
      setLoading(true);
      const res = await api.getClips();
      setClips(res.clips);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClips();
  }, []);

  const filteredClips = clips.filter((clip) => {
    const matchesSearch =
      clip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clip.transcript_snippet?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRatio = ratioFilter === 'all' || clip.aspect_ratio === ratioFilter;
    return matchesSearch && matchesRatio;
  });

  const handleDownload = (clipId: string, clipNumber: number) => {
    const url = api.getClipDownloadUrl(clipId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clip_${clipNumber}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">My Video Clips</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Browse and manage all AI-generated vertical clips from your video projects.
          </p>
        </div>

        <button
          onClick={onNavigateToCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Create More Clips
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clip titles or transcripts..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-stretch sm:self-auto">
          {['all', '9:16', '16:9', '1:1'].map((r) => (
            <button
              key={r}
              onClick={() => setRatioFilter(r)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                ratioFilter === r ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              {r === 'all' ? 'All Ratios' : r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-xs">
          <RotateCcw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
          Loading your generated clips...
        </div>
      ) : filteredClips.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center">
          <Scissors className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No clips found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            {searchQuery || ratioFilter !== 'all'
              ? 'No clips matched your active filter. Try clearing your search.'
              : 'Upload a video to generate social-ready vertical clips with AI highlights and captions.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredClips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onEdit={(c) => {
                setEditingClip(c);
                setIsEditorOpen(true);
              }}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}

      {/* Editor Modal */}
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
