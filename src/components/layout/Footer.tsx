import React from 'react';
import { Scissors } from 'lucide-react';

export const Footer: React.FC<{
  setCurrentView: (view: string) => void;
  openAuthModal: (mode: 'login' | 'signup') => void;
}> = ({ setCurrentView, openAuthModal }) => {
  return (
    <footer className="w-full bg-slate-950 border-t border-slate-900 text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="text-base font-bold text-white tracking-tight">AI Shorts Maker</span>
            </div>
            <p className="text-slate-400 max-w-sm leading-relaxed mb-4">
              Turn long podcasts, keynotes, webinars, and educational videos into high-retention 9:16 vertical shorts powered by Google Gemini AI and intelligent viral highlight detection.
            </p>
            <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
              <span>English</span>
              <span aria-hidden="true">·</span>
              <span>Urdu</span>
              <span aria-hidden="true">·</span>
              <span>Hindi</span>
              <span aria-hidden="true">·</span>
              <span>FFmpeg Powered</span>
            </div>
          </div>

          <div>
            <h4 className="text-slate-200 font-semibold mb-3">Product</h4>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => {
                    setCurrentView('landing');
                    setTimeout(() => {
                      document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className="hover:text-slate-200 transition-colors"
                >
                  Highlight Selection
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setCurrentView('landing');
                    setTimeout(() => {
                      document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className="hover:text-slate-200 transition-colors"
                >
                  Auto 9:16 Crop
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setCurrentView('landing');
                    setTimeout(() => {
                      document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className="hover:text-slate-200 transition-colors"
                >
                  Synchronized Captions
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setCurrentView('landing');
                    setTimeout(() => {
                      document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className="hover:text-slate-200 transition-colors"
                >
                  Pricing & Plans
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-200 font-semibold mb-3">Support & Account</h4>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => openAuthModal('signup')}
                  className="hover:text-slate-200 transition-colors text-indigo-400"
                >
                  Start Free Demo
                </button>
              </li>
              <li>
                <button
                  onClick={() => openAuthModal('login')}
                  className="hover:text-slate-200 transition-colors"
                >
                  Customer Login
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setCurrentView('subscription');
                  }}
                  className="hover:text-slate-200 transition-colors"
                >
                  Redeem License / Free Pass
                </button>
              </li>
              <li>
                <a href="mailto:support@aishortsmaker.com" className="hover:text-slate-200 transition-colors">
                  Contact Support
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
          <p>© {new Date().getFullYear()} AI Shorts Maker. All rights reserved.</p>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Privacy Policy</span>
            <span aria-hidden="true">·</span>
            <span>Terms of Service</span>
            <span aria-hidden="true">·</span>
            <span>Easypaisa Manual Verification</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
