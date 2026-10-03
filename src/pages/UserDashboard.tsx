import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AiSettingsModal } from '../components/AiSettingsModal';
import type { Project, Clip } from '../types';
import {
  Sparkles,
  FolderOpen,
  Scissors,
  CreditCard,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Play,
  Download,
} from 'lucide-react';

interface UserDashboardProps {
  onNavigate: (view: string, data?: any) => void;
  openNotifications: () => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({ onNavigate, openNotifications }) => {
  const { user, subscription, license, isOwner, isPaid, canProcessVideo, unreadCount, refreshUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // License redemption inside Dashboard
  const [dashKeyInput, setDashKeyInput] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemStatus, setRedeemStatus] = useState<{ message: string; isError: boolean } | null>(null);

  const handleDashboardRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashKeyInput.trim()) return;

    setIsRedeeming(true);
    setRedeemStatus(null);
    try {
      const res = await api.redeemCode(dashKeyInput.trim());
      setRedeemStatus({ message: res.message || 'License key activated! Pro mode unlocked.', isError: false });
      setDashKeyInput('');
      await refreshUser();
    } catch (err: any) {
      setRedeemStatus({ message: err.message || 'Invalid or already redeemed license key.', isError: true });
    } finally {
      setIsRedeeming(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [projRes, clipRes] = await Promise.all([api.getProjects(), api.getClips()]);
        setProjects(projRes.projects);
        setClips(clipRes.clips);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const demoRemaining = !user?.demo_used && (typeof user?.credits !== 'number' || user.credits > 0);

  // Exact remaining time calculation for dynamic custom durations
  const formatRemainingDuration = () => {
    if (isOwner) {
      return { badge: 'OWNER LIFETIME', text: 'Lifetime Unlimited Access', isExpiringSoon: false, isExpired: false };
    }
    if (!subscription?.expires_at || !isPaid) {
      return {
        badge: user?.demo_used ? 'PRO EXPIRED' : 'FREE DEMO',
        text: user?.demo_used ? 'Pro Expired — Paywall Active' : 'Free Demo (1 Video Available)',
        isExpiringSoon: false,
        isExpired: true,
      };
    }

    const now = Date.now();
    const expiry = new Date(subscription.expires_at).getTime();
    const diffMs = expiry - now;

    if (diffMs <= 0) {
      return {
        badge: 'PRO EXPIRED',
        text: 'Pro Expired — Paywall Active',
        isExpiringSoon: false,
        isExpired: true,
      };
    }

    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffMinutes < 60) {
      const minText = `Expires in ${Math.max(1, diffMinutes)} Minutes`;
      return { badge: minText, text: `Pro Plan Active: ${minText}`, isExpiringSoon: true, isExpired: false };
    }
    if (diffHours < 24) {
      const remMins = diffMinutes % 60;
      const hourText = remMins > 0 ? `Expires in ${diffHours} Hours ${remMins}m` : `Expires in ${diffHours} Hours`;
      return { badge: hourText, text: `Pro Plan Active: ${hourText}`, isExpiringSoon: true, isExpired: false };
    }
    if (diffDays === 1) {
      return { badge: '1 Day Remaining', text: 'Pro Plan Active: 1 Day Remaining', isExpiringSoon: true, isExpired: false };
    }
    return { badge: `${diffDays} Days Remaining`, text: `Pro Plan Active: ${diffDays} Days Remaining`, isExpiringSoon: diffDays <= 2, isExpired: false };
  };

  const planDuration = formatRemainingDuration();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Welcome back, {user?.name}
            </h1>
            {isOwner && (
              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-bold">
                OWNER LIFETIME
              </span>
            )}
            {isPaid && !isOwner && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded font-mono font-bold flex items-center gap-1.5 border ${
                  planDuration.isExpiringSoon
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                PRO ACTIVE: {planDuration.badge}
              </span>
            )}
            {!isPaid && !isOwner && user?.demo_used && (
              <span className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                PAYWALL ACTIVE (0 CREDITS)
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Turn long podcasts and talks into viral 9:16 vertical clips in minutes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isPaid && !isOwner && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'upgrade' } }))}
              className="px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm shadow-amber-500/20 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Upgrade to Pro
            </button>
          )}
          {isOwner && (
            <button
              onClick={() => setAiModalOpen(true)}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-medium rounded-xl text-xs transition-colors flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              title="Configure / Check Google Gemini API Key"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              AI Key & Settings
            </button>
          )}
          <button
            onClick={() => {
              if (!canProcessVideo && !isPaid && !isOwner) {
                window.dispatchEvent(
                  new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached', mandatory: true } })
                );
                return;
              }
              onNavigate('create');
            }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-sm shadow-indigo-600/30 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Create New Shorts
          </button>
        </div>
      </div>

      {/* Paywall Banner if demo is finished */}
      {!demoRemaining && !isPaid && !isOwner && (
        <div className="p-4 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-amber-950/40 border border-indigo-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Free Demo Limit Reached (0/1 Videos Left)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Upgrade to Pro or redeem a License Key to continue generating unlimited AI viral clips.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } }))}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors shrink-0 shadow-sm cursor-pointer"
          >
            View Pricing & Plans →
          </button>
        </div>
      )}

      {/* 2. Account Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Plan Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Current Plan</span>
            <CreditCard className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-lg font-bold text-white mb-1">
            {isOwner
              ? 'Owner Lifetime'
              : isPaid
              ? (subscription?.plan === 'YEARLY' ? 'Yearly Pro' : 'Pro Plan')
              : 'Free Demo Plan'}
          </div>
          <div className="text-xs text-slate-400">
            {isOwner ? (
              <span className="text-emerald-400 font-medium">Permanent Lifetime Access</span>
            ) : isPaid ? (
              <span className={`font-medium ${planDuration.isExpiringSoon ? 'text-amber-400' : 'text-emerald-400'}`}>
                {planDuration.text}
              </span>
            ) : user?.demo_used ? (
              <div className="space-y-1">
                <span className="text-rose-400 font-medium block">Pro Expired (Paywall Active)</span>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'upgrade' } }))}
                  className="text-indigo-400 hover:underline block"
                >
                  Upgrade / Redeem Key →
                </button>
              </div>
            ) : (
              <button
                onClick={() => onNavigate('subscription')}
                className="text-indigo-400 hover:underline"
              >
                Upgrade to Pro →
              </button>
            )}
          </div>
        </div>

        {/* Demo Meter */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Free Demo Status</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white mb-1">
            {isOwner ? (
              <span className="text-emerald-400 font-mono">UNLIMITED</span>
            ) : isPaid ? (
              <span className="text-indigo-400 font-mono">PREMIUM ACTIVE</span>
            ) : demoRemaining ? (
              <span className="text-emerald-400">1 Available</span>
            ) : (
              <span className="text-slate-400">Used (0 Left)</span>
            )}
          </div>
          <div className="text-xs text-slate-400">
            {isOwner || isPaid ? (
              <span>Unlimited video uploads</span>
            ) : demoRemaining ? (
              <span>Ready for your first video</span>
            ) : (
              <span className="text-amber-400">Demo finished. Subscribe for more.</span>
            )}
          </div>
        </div>

        {/* Active License */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>License Status</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-base font-bold font-mono text-white mb-1 truncate">
            {isOwner ? 'OWNER-UNRESTRICTED' : license ? license.license_key : 'No Paid License'}
          </div>
          <div className="text-xs text-slate-400">
            {license ? (
              <span className="text-emerald-400">Verified & Active</span>
            ) : (
              <button
                onClick={() => onNavigate('subscription')}
                className="text-indigo-400 hover:underline"
              >
                Redeem Pass / Subscribe →
              </button>
            )}
          </div>
        </div>

        {/* Total Clips Generated */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>My Clips</span>
            <Scissors className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-lg font-bold text-white mb-1 font-mono">{clips.length}</div>
          <div className="text-xs text-slate-400">
            Across <span className="font-semibold text-slate-300">{projects.length}</span> projects
          </div>
        </div>
      </div>

      {/* Prominent License Key Redemption Card */}
      <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/40 rounded-2xl shadow-xl shadow-indigo-950/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="max-w-md">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <h3 className="text-base font-bold text-white tracking-wide">Redeem License Key</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                Instant Pro
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Have an Admin-issued License Key or Friend Pass? Enter it below to unlock 30-Day Monthly Pro or 365-Day Yearly Pro access instantly with unlimited clips.
            </p>
          </div>

          <form onSubmit={handleDashboardRedeem} className="flex-1 max-w-xl flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              placeholder="Enter license key (e.g. LIMA-XXXX-XXXX or YEAR-XXXX-XXXX)"
              value={dashKeyInput}
              onChange={(e) => setDashKeyInput(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-3 bg-slate-950 border border-indigo-500/30 focus:border-indigo-400 rounded-xl text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 shadow-inner"
            />
            <button
              type="submit"
              disabled={isRedeeming}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shrink-0 shadow-md shadow-indigo-600/30 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isRedeeming ? 'Activating...' : 'Redeem License Key'}
            </button>
          </form>
        </div>

        {redeemStatus && (
          <div
            className={`mt-3.5 p-3 rounded-xl text-xs flex items-center gap-2 ${
              redeemStatus.isError
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            {redeemStatus.isError ? <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" /> : <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />}
            <span className="font-medium">{redeemStatus.message}</span>
          </div>
        )}
      </div>

      {/* 3. Recent Projects */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Recent Video Projects</h2>
          </div>
          {projects.length > 0 && (
            <button
              onClick={() => onNavigate('projects')}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              View all ({projects.length}) <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-500 text-xs">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 text-center">
            <FolderOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-white mb-1">No video projects yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
              Upload your first video to start transcribing and generating 9:16 vertical shorts.
            </p>
            <button
              onClick={() => {
                if (!canProcessVideo && !isPaid && !isOwner) {
                  window.dispatchEvent(
                    new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached', mandatory: true } })
                  );
                  return;
                }
                onNavigate('create');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Upload Video
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 3).map((proj) => (
              <div
                key={proj.id}
                onClick={() => onNavigate('project-detail', proj.id)}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all cursor-pointer group flex flex-col justify-between"
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
                  <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                    {proj.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                    {proj.original_filename}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    {proj.duration ? `${Math.round(proj.duration)}s` : 'Analyzing'}
                  </span>
                  <span className="text-indigo-400 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Recent Generated Clips */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Recently Generated Clips</h2>
          </div>
          {clips.length > 0 && (
            <button
              onClick={() => onNavigate('clips')}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              View all ({clips.length}) <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {clips.length === 0 ? (
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-6 text-center text-xs text-slate-500">
            No clips generated yet. Once you upload and process a video, your vertical shorts will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {clips.slice(0, 6).map((c) => (
              <div
                key={c.id}
                onClick={() => onNavigate('project-detail', c.project_id)}
                className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-2 transition-all cursor-pointer group flex flex-col"
              >
                <div className="relative aspect-[9/16] bg-slate-950 rounded-lg overflow-hidden mb-2">
                  <video
                    src={c.videoUrl ? api.getMediaUrl(c.videoUrl) : `/output/clip-${c.clip_number}.mp4`}
                    poster={api.getThumbnailUrl(c) || `/output/clip-${c.clip_number}.jpg`}
                    preload="metadata"
                    muted
                    playsInline
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                    #{c.clip_number}
                  </div>
                  <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                    {c.duration}s
                  </div>
                </div>
                <p className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                  {c.title}
                </p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{c.aspect_ratio}</span>
                  <span className="text-indigo-400">Edit →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && <AiSettingsModal isOpen={aiModalOpen} onClose={() => setAiModalOpen(false)} />}
    </div>
  );
};
