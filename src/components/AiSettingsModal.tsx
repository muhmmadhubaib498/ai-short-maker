import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, ShieldCheck, X, RefreshCw, Cpu, Server, Key } from 'lucide-react';
import { api } from '../services/api';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({ isOpen, onClose }) => {
  const [checking, setChecking] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Checking AI status...');

  const verifyConnection = async () => {
    setChecking(true);
    setStatusMessage('Pinging server AI engine...');
    try {
      const health = await api.getHealth();
      const configured = Boolean(health.gemini_configured ?? health.openai_configured);
      setIsConfigured(configured);
      if (configured) {
        setStatusMessage('Enterprise Gemini AI is actively connected with multi-key auto-failover.');
      } else {
        setStatusMessage('AI key is not detected. Please ensure GEMINI_API_KEY_2 or GEMINI_API_KEY is configured in Settings > Secrets.');
      }
    } catch {
      setIsConfigured(false);
      setStatusMessage('Unable to reach server health endpoint.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      verifyConnection();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">AI Engine & Key Settings</h2>
              <p className="text-[11px] text-slate-400">Google Gemini API integration & environment configuration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Status Banner */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {isConfigured ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <Key className="w-5 h-5 text-amber-400 shrink-0" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">Google Gemini API</span>
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                      isConfigured
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {checking ? 'VERIFYING...' : isConfigured ? 'CONNECTED & ACTIVE' : 'KEY REQUIRED'}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">{statusMessage}</p>
              </div>
            </div>

            <button
              onClick={verifyConnection}
              disabled={checking}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors disabled:opacity-50 shrink-0"
              title="Refresh AI Connection"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Model & Architecture Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Engine Architecture</h3>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  Primary Model
                </span>
                <span className="text-slate-200 font-mono font-bold block">gemini-3.8-flash</span>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-indigo-400" />
                  Execution Tier
                </span>
                <span className="text-slate-200 font-mono font-bold block">Server-Side Proxy</span>
              </div>
            </div>
          </div>

          {/* Key Management Instructions */}
          <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-2 text-indigo-300">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-indigo-200">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              Automated Failover & Key Management
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Your API key is automatically loaded on the server with dual-key rotation. <span className="font-semibold text-white">GEMINI_API_KEY_2</span> is prioritized as primary with instant auto-fallback to <span className="font-semibold text-white">GEMINI_API_KEY</span>.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">
                GEMINI_API_KEY_2 (Primary)
              </span>
              <span>&rarr; Active</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/50 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs transition-colors"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
};
