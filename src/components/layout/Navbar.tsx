import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AiSettingsModal } from '../AiSettingsModal';
import {
  Scissors,
  Bell,
  User as UserIcon,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  CreditCard,
  Video,
  FolderOpen,
  Sparkles,
} from 'lucide-react';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  openAuthModal: (mode: 'login' | 'signup') => void;
  openNotifications: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  openAuthModal,
  openNotifications,
}) => {
  const { user, isOwner, isAdmin, isPaid, canProcessVideo, unreadCount, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

  const navigateTo = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Brand / Logo wrapper - properly separated with flexbox gap and shrink-0 */}
        <div className="flex items-center gap-6 shrink-0">
          <button
            onClick={() => navigateTo(user ? 'dashboard' : 'landing')}
            className="flex items-center gap-3 text-left group focus:outline-none shrink-0"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20 group-hover:bg-indigo-500 transition-colors shrink-0">
              <Scissors className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white group-hover:text-indigo-200 transition-colors whitespace-nowrap">
              AI Shorts Maker
            </span>
          </button>
        </div>

        {/* Zone 2: Navigation Links with proper flexbox spacing (gap: 1.5rem) */}
        <nav
          className="hidden md:flex items-center text-sm font-medium text-slate-300 shrink-0"
          style={{ gap: '1.5rem' }}
        >
          {!user ? (
            <>
              <button
                onClick={() => navigateTo('landing')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${currentView === 'landing' ? 'text-white' : ''}`}
              >
                Home
              </button>
              <button
                onClick={() => {
                  navigateTo('landing');
                  setTimeout(() => {
                    document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Features
              </button>
              <button
                onClick={() => {
                  navigateTo('landing');
                  setTimeout(() => {
                    document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Pricing
              </button>
              <button
                onClick={() => openAuthModal('signup')}
                className="hover:text-white transition-colors text-indigo-400 whitespace-nowrap shrink-0"
              >
                Free Demo
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigateTo('dashboard')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${currentView === 'dashboard' ? 'text-white font-semibold' : ''}`}
              >
                Dashboard
              </button>
              <button
                onClick={() => {
                  if (!canProcessVideo && !isPaid && !isOwner) {
                    window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } }));
                    return;
                  }
                  navigateTo('create');
                }}
                className={`flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 ${currentView === 'create' ? 'text-indigo-400 font-semibold' : ''}`}
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Create Video
              </button>
              <button
                onClick={() => navigateTo('projects')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${currentView === 'projects' ? 'text-white font-semibold' : ''}`}
              >
                Projects
              </button>
              <button
                onClick={() => navigateTo('clips')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${currentView === 'clips' ? 'text-white font-semibold' : ''}`}
              >
                My Clips
              </button>
              <button
                onClick={() => navigateTo('subscription')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${currentView === 'subscription' ? 'text-white font-semibold' : ''}`}
              >
                Subscription
              </button>
              {(isOwner || isAdmin) && (
                <button
                  onClick={() => navigateTo('owner')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs uppercase tracking-wider font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    currentView === 'owner'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'text-amber-300/80 border-amber-500/20 hover:text-amber-200 hover:border-amber-500/40'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isOwner ? 'Owner Console' : 'Admin'}
                </button>
              )}
            </>
          )}
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-3">
          {!user ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => openAuthModal('login')}
                className="text-sm font-medium text-slate-300 hover:text-white px-3 py-1.5 transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => openAuthModal('signup')}
                className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg transition-colors whitespace-nowrap shadow-sm shadow-indigo-600/30"
              >
                Start Free
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {/* Gemini AI Key & Status Settings Button (Owner Only) */}
              {isOwner && (
                <button
                  onClick={() => setAiSettingsOpen(true)}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300 text-xs font-medium transition-colors cursor-pointer"
                  title="Google Gemini AI Engine & Key Settings"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Gemini AI</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </button>
              )}

              {/* Notifications Bell */}
              <button
                onClick={openNotifications}
                className="relative p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-900 focus:outline-none"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-slate-950" />
                )}
              </button>

              {/* Profile Menu Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors text-xs font-medium text-slate-200 focus:outline-none"
                >
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  <span className="max-w-[120px] truncate">{user.name}</span>
                  {isOwner && (
                    <span className="text-[10px] text-amber-400 font-mono">OWNER</span>
                  )}
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-xl shadow-black/50 py-2 z-50 text-xs">
                    <div className="px-4 py-2 border-b border-slate-800">
                      <p className="font-semibold text-white truncate">{user.name}</p>
                      <p className="text-slate-400 font-mono text-[11px] truncate">{user.email}</p>
                      <div className="mt-1 text-[11px] text-slate-400">
                        Plan: <span className="text-indigo-400 font-medium">{isOwner ? 'Owner Lifetime' : isPaid ? 'Premium Active' : 'Free Demo'}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => navigateTo('profile')}
                      className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                      Account Profile
                    </button>
                    <button
                      onClick={() => navigateTo('subscription')}
                      className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      Subscription & License
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setAiSettingsOpen(true);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 flex items-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        AI Key & Engine Settings
                      </button>
                    )}
                    {(isOwner || isAdmin) && (
                      <button
                        onClick={() => navigateTo('owner')}
                        className="w-full text-left px-4 py-2 hover:bg-slate-800 text-amber-300 hover:text-amber-200 flex items-center gap-2"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        {isOwner ? 'Owner Dashboard' : 'Admin Console'}
                      </button>
                    )}

                    <div className="border-t border-slate-800 my-1" />

                    <button
                      onClick={() => {
                        logout();
                        navigateTo('landing');
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-slate-950 px-4 pt-2 pb-6 space-y-3">
          {!user ? (
            <>
              <button
                onClick={() => navigateTo('landing')}
                className="block w-full text-left py-2 text-sm text-slate-200 font-medium"
              >
                Home
              </button>
              <button
                onClick={() => {
                  navigateTo('landing');
                  setTimeout(() => {
                    document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="block w-full text-left py-2 text-sm text-slate-200 font-medium"
              >
                Features
              </button>
              <button
                onClick={() => {
                  navigateTo('landing');
                  setTimeout(() => {
                    document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="block w-full text-left py-2 text-sm text-slate-200 font-medium"
              >
                Pricing
              </button>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAuthModal('login');
                  }}
                  className="w-full py-2.5 text-center text-sm font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-lg"
                >
                  Log In
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAuthModal('signup');
                  }}
                  className="w-full py-2.5 text-center text-sm font-semibold text-white bg-indigo-600 rounded-lg"
                >
                  Start Free Demo
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => navigateTo('dashboard')}
                className="block w-full text-left py-2 text-sm text-slate-200 font-medium"
              >
                Dashboard
              </button>
              <button
                onClick={() => {
                  if (!canProcessVideo && !isPaid && !isOwner) {
                    setMobileMenuOpen(false);
                    window.dispatchEvent(new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } }));
                    return;
                  }
                  navigateTo('create');
                }}
                className="block w-full text-left py-2 text-sm text-indigo-400 font-medium"
              >
                + Create Video
              </button>
              <button
                onClick={() => navigateTo('projects')}
                className="block w-full text-left py-2 text-sm text-slate-200 font-medium"
              >
                Projects
              </button>
              <button
                onClick={() => navigateTo('clips')}
                className="block w-full text-left py-2 text-sm text-slate-200 font-medium"
              >
                My Clips
              </button>
              <button
                onClick={() => navigateTo('subscription')}
                className="block w-full text-left py-2 text-sm text-slate-200 font-medium"
              >
                Subscription & License
              </button>
              <button
                onClick={() => navigateTo('profile')}
                className="block w-full text-left py-2 text-sm text-slate-200 font-medium"
              >
                Profile
              </button>
              {isOwner && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setAiSettingsOpen(true);
                  }}
                  className="block w-full text-left py-2 text-sm text-indigo-400 font-medium"
                >
                  AI Engine & Key Settings
                </button>
              )}
              {(isOwner || isAdmin) && (
                <button
                  onClick={() => navigateTo('owner')}
                  className="block w-full text-left py-2 text-sm text-amber-400 font-medium"
                >
                  {isOwner ? 'Owner Dashboard' : 'Admin Console'}
                </button>
              )}
              <div className="pt-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    logout();
                    navigateTo('landing');
                  }}
                  className="block w-full text-left py-2 text-sm text-red-400 font-medium"
                >
                  Log Out
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Dedicated AI Key & Settings Modal (Owner Only) */}
      {isOwner && <AiSettingsModal isOpen={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />}
    </header>
  );
};
