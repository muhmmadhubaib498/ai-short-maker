import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AiSettingsModal } from '../components/AiSettingsModal';
import {
  User,
  Mail,
  Lock,
  Calendar,
  CreditCard,
  ShieldCheck,
  Check,
  AlertCircle,
  LogOut,
  Sparkles,
} from 'lucide-react';

export const ProfilePage: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { user, subscription, license, isOwner, isPaid } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ message: string; isError: boolean } | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;

    if (newPassword !== confirmPassword) {
      setStatusMsg({ message: 'New passwords do not match.', isError: true });
      return;
    }

    if (newPassword.length < 6) {
      setStatusMsg({ message: 'Password must be at least 6 characters.', isError: true });
      return;
    }

    setIsChanging(true);
    setStatusMsg(null);

    try {
      const res = await api.changePassword({ currentPassword, newPassword });
      setStatusMsg({ message: res.message, isError: false });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setStatusMsg({ message: err.message || 'Failed to update password.', isError: true });
    } finally {
      setIsChanging(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Account Profile</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Review your account tier, license bindings, and security credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Information Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-400" />
            Profile Information
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Full Name</span>
              <span className="text-white font-medium">{user.name}</span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Email Address</span>
              <span className="text-white font-mono">{user.email}</span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Assigned Role</span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                  user.role === 'OWNER'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : user.role === 'ADMIN'
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {user.role}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Account Created</span>
              <span className="text-slate-300 font-mono">
                {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Free Demo Status</span>
              <span className="text-slate-300 font-mono">
                {user.demo_used ? 'Consumed' : 'Available (1 Video)'}
              </span>
            </div>
          </div>
        </div>

        {/* Subscription & License Details */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Subscription & License Binding
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Current Plan</span>
              <span className="text-white font-bold">
                {isOwner
                  ? 'Owner Lifetime Access'
                  : subscription?.plan === 'YEARLY'
                  ? 'Yearly Pro'
                  : subscription?.plan === 'MONTHLY'
                  ? 'Monthly Pro'
                  : 'Free Demo'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Subscription Expiration</span>
              <span className="text-slate-300 font-mono">
                {isOwner
                  ? 'Never (Lifetime)'
                  : subscription?.expires_at
                  ? new Date(subscription.expires_at).toLocaleDateString()
                  : 'Not active'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Active License Key</span>
              <span className="text-indigo-400 font-mono font-semibold">
                {isOwner
                  ? 'OWNER-LIFETIME-ACCESS'
                  : license
                  ? license.license_key
                  : 'No active license key'}
              </span>
            </div>

            {license?.license_type && (
              <div>
                <span className="text-slate-400 block mb-0.5">License Origin</span>
                <span className="text-slate-300 font-mono">{license.license_type}</span>
              </div>
            )}
          </div>
        </div>

        {/* AI Engine & Key Configuration Card (Owner Only) */}
        {isOwner && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                AI Speech & Highlight Intelligence Engine
              </h2>
              <button
                onClick={() => setAiModalOpen(true)}
                className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Verify / Configure Key
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Active AI Model</span>
                <span className="text-white font-mono font-bold">gemini-3.8-flash</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Status</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Connected & Active
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Failover Protection</span>
                <span className="text-indigo-300 font-medium text-xs">Multi-Key Auto-Rotation</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              All spoken video audio transcription and intelligent viral highlight detection are processed using enterprise Google Gemini AI with automated dual-key failover and rate-limit buffering.
            </p>
          </div>
        )}
      </div>

      {/* Change Password Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-indigo-400" />
          Update Password
        </h2>

        {statusMsg && (
          <div
            className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              statusMsg.isError
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
            }`}
          >
            {statusMsg.isError ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Check className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMsg.message}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              disabled={isChanging}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {isChanging ? 'Updating...' : 'Change Password'}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1 font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </form>
      </div>

      {isOwner && <AiSettingsModal isOpen={aiModalOpen} onClose={() => setAiModalOpen(false)} />}
    </div>
  );
};
