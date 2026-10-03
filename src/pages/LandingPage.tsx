import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Scissors,
  Sparkles,
  Smartphone,
  Type,
  Layers,
  Globe,
  Zap,
  Download,
  Check,
  ArrowRight,
  ShieldCheck,
  Gift,
  Play,
} from 'lucide-react';

interface LandingPageProps {
  onStartFree: () => void;
  onLogin: () => void;
  onNavigateToSubscription: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartFree,
  onLogin,
  onNavigateToSubscription,
}) => {
  const { user } = useAuth();
  const [passCode, setPassCode] = useState('');
  const [passStatus, setPassStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const handleRedeemPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passCode.trim()) return;

    if (!user) {
      onLogin();
      return;
    }

    setIsRedeeming(true);
    setPassStatus(null);
    try {
      const res = await api.redeemCode(passCode.trim());
      setPassStatus({ message: res.message, isError: false });
      setPassCode('');
      setTimeout(() => {
        onNavigateToSubscription();
      }, 1500);
    } catch (err: any) {
      setPassStatus({ message: err.message || 'Failed to activate code.', isError: true });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32 border-b border-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.18),rgba(255,255,255,0))] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-10">
            {/* Quiet text kicker instead of pill sandwich */}
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-indigo-400 mb-4 tracking-wider uppercase">
              <span>Next-Gen Video Intelligence</span>
              <span aria-hidden="true">·</span>
              <span>Google Gemini AI</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 leading-[1.15] text-balance">
              Turn Long Videos Into Engaging Shorts With AI
            </h1>

            <p className="text-base sm:text-lg text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed">
              Upload your long video and let AI find the moments worth sharing. Intelligently selects complete thoughts, converts horizontally to 9:16 vertical shorts, and generates synchronized captions.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={onStartFree}
                className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Start Free Demo
              </button>
              <button
                onClick={() => {
                  document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold rounded-xl text-sm transition-colors"
              >
                View Pricing ($10/mo)
              </button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> 1 Free Demo Included
              </span>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <span className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> No Watermarks
              </span>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <span className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Real FFmpeg Processing
              </span>
            </div>
          </div>

          {/* High-Fidelity Hero Showcase Graphic */}
          <div className="relative max-w-4xl mx-auto rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
            <img
              src="/src/assets/images/hero_shorts_creator_1790403301668.jpg"
              alt="AI Shorts Maker Transformation Interface"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-cover max-h-[500px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none" />
            <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs bg-slate-950/80 backdrop-blur-md p-4 rounded-xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-white">Full-Stack Pipeline:</span>
                <span className="text-slate-300">Extract Audio → Transcribe → AI Analysis → 9:16 Smart Crop → Captions</span>
              </div>
              <button
                onClick={onStartFree}
                className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 whitespace-nowrap"
              >
                Try It Now <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Mechanism Showcase: Horizontal to Vertical Transformation */}
      <section className="py-20 bg-slate-950 border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
              How AI Shorts Maker Transforms Your Video
            </h2>
            <p className="text-sm text-slate-400">
              Unlike dumb cutters that split videos by minute counters, our engine listens to the transcript, identifies viral hooks, and crops without distortion.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-5xl mx-auto">
            {/* Input Video Preview */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3 px-1 text-xs text-slate-400 font-mono">
                <span>INPUT: Long Form 16:9 Podcast / Webinar</span>
                <span className="text-indigo-400">45:00 min</span>
              </div>
              <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
                <img
                  src="/src/assets/images/sample_video_frame_1790403313368.jpg"
                  alt="Podcast Raw Interview Still"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-200">AI Analysis:</span> Scans the entire audio spectrum, recognizes full speaker thoughts, removes dead air, and matches requested tone (e.g. Motivational, Educational, Funny).
              </div>
            </div>

            {/* Output Vertical Short Preview */}
            <div className="lg:col-span-5 flex flex-col items-center bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="w-full flex items-center justify-between mb-3 text-xs text-slate-400 font-mono">
                <span>OUTPUT: 9:16 Vertical Short</span>
                <span className="text-emerald-400 font-semibold">Ready in 45s</span>
              </div>
              <div className="w-[200px] h-[355px] rounded-xl overflow-hidden bg-black relative border-2 border-indigo-500/40 shadow-2xl">
                <img
                  src="/src/assets/images/vertical_short_preview_1790403329858.jpg"
                  alt="Vertical Highlight Sample"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 inset-x-2 text-center pointer-events-none">
                  <span className="bg-amber-400 text-black text-xs font-bold px-2 py-0.5 rounded shadow">
                    "WE BUILT IT IN 48 HOURS"
                  </span>
                </div>
              </div>
              <div className="mt-4 text-center text-xs text-slate-400 font-mono">
                9:16 Auto Center Crop · Synchronized Subtitles
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Features Grid */}
      <section id="features-section" className="py-20 bg-slate-950 border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
              Engineered for High Viral Retention
            </h2>
            <p className="text-sm text-slate-400">
              Every feature exists to ensure you get standalone, high-value clips ready for TikTok, Instagram Reels, and YouTube Shorts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">AI Highlight Detection</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Finds motivational moments, funny quotes, or answers without cutting a sentence in the middle.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Smart 9:16 Cropping</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Intelligently crops horizontal video into vertical shorts keeping speakers in the center without distortion or stretching.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <Type className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Synchronized Captions</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Generates stylized social media captions. Choose Clean, Bold, Modern, or Highlight styles with social-safe positioning.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">English, Urdu & Hindi</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Full multilingual transcript comprehension tailored for regional humor, cadence, and cultural storytelling hooks.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Multiple Clip Lengths</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Target 30–60s, 1–2 minutes, or custom duration. Generate 3, 5, 10, 15, or 20 distinct clips in one job.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <Scissors className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Simple Fast Editor</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Fine-tune start and end timestamps, switch aspect ratio, toggle captions, and re-process instantly via FFmpeg.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Real Job Progress</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Actual background task progress from audio extraction to Google Gemini transcription to FFmpeg clip rendering.
              </p>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                <Download className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Download All (ZIP)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Export individual clips with clean filenames or stream a single compressed ZIP package with one click.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Pricing & Plans Section */}
      <section id="pricing-section" className="py-20 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
              Simple, Transparent Pricing
            </h2>
            <p className="text-sm text-slate-400">
              Start with a free demo. Upgrade to Monthly or Yearly for high-volume clipping with manual Easypaisa or bank payment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-12">
            {/* Free Demo Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">Starter</div>
                <h3 className="text-xl font-bold text-white mb-2">Free Demo</h3>
                <div className="text-3xl font-bold text-white mb-4">
                  $0 <span className="text-xs font-normal text-slate-400">/ 1 project</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  Test the quality of our transcription, highlight detection, and vertical clip renderer with your first video.
                </p>

                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>1 Complete Video Project</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Up to 3 AI-Generated Clips</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Auto 9:16 Smart Cropping</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Synchronized Captions</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <button
                  onClick={onStartFree}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-xs transition-colors"
                >
                  Start 1 Free Demo
                </button>
              </div>
            </div>

            {/* Monthly Card */}
            <div className="bg-slate-900 border-2 border-indigo-500 rounded-2xl p-6 flex flex-col justify-between relative shadow-xl shadow-indigo-600/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[11px] font-semibold px-3 py-0.5 rounded-full tracking-wide">
                MOST POPULAR
              </div>
              <div>
                <div className="text-xs font-mono text-indigo-400 uppercase tracking-wider mb-2">Creators</div>
                <h3 className="text-xl font-bold text-white mb-2">Monthly Pro</h3>
                <div className="text-3xl font-bold text-white mb-4">
                  $10 <span className="text-xs font-normal text-slate-400">/ 30 days</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  Full unrestricted video processing with unlimited highlights and high-definition vertical export.
                </p>

                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Full 30 Days Premium Access</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Up to 20 Clips per Video</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>All Aspect Ratios (9:16, 16:9, 1:1)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Unique Paid License Key</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Manual Easypaisa / Bank Transfer</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <button
                  onClick={onNavigateToSubscription}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-sm shadow-indigo-600/30"
                >
                  Subscribe Monthly ($10)
                </button>
              </div>
            </div>

            {/* Yearly Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">Best Value</div>
                <h3 className="text-xl font-bold text-white mb-2">Yearly Pass</h3>
                <div className="text-3xl font-bold text-white mb-4">
                  $50 <span className="text-xs font-normal text-slate-400">/ 365 days</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  Save 58% over the monthly plan for long-term creators, agencies, and podcast editors.
                </p>

                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Full 365 Days Unrestricted Access</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Fast Track Job Processing Priority</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Unlimited ZIP Archives & Downloads</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Priority Support</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <button
                  onClick={onNavigateToSubscription}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-xs transition-colors"
                >
                  Subscribe Yearly ($50)
                </button>
              </div>
            </div>
          </div>

          {/* 5. "Have a License / Free Pass Code?" Box */}
          <div className="max-w-xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 text-indigo-400 mb-2">
              <Gift className="w-5 h-5" />
              <h3 className="text-base font-semibold text-white">Have a License or Friend Pass Code?</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Enter your purchased License key or a Friend Pass code (e.g. FRIEND-XXXX-XXXX) to activate 30 days of premium access instantly.
            </p>

            <form onSubmit={handleRedeemPass} className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
              <input
                type="text"
                value={passCode}
                onChange={(e) => setPassCode(e.target.value)}
                placeholder="Enter Code (e.g. FRIEND-7K29-XP41)"
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white uppercase placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={isRedeeming}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {isRedeeming ? 'Activating...' : 'Activate Code'}
              </button>
            </form>

            {passStatus && (
              <div
                className={`mt-3 text-xs p-2.5 rounded-lg ${
                  passStatus.isError ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'
                }`}
              >
                {passStatus.message}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
