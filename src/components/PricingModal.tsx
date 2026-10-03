import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { DynamicPaymentSettings, PaymentMethodConfig } from '../types';
import {
  X,
  Check,
  CreditCard,
  Sparkles,
  ShieldCheck,
  Copy,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Smartphone,
  Building,
  Key,
  Flame,
  ArrowRight,
} from 'lucide-react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'limit_reached' | 'upgrade' | null;
}

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, reason }) => {
  const { user, isPaid, isOwner, refreshUser } = useAuth();

  const [paymentSettings, setPaymentSettings] = useState<DynamicPaymentSettings | null>(null);
  const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Plan
  const [selectedPlan, setSelectedPlan] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const [activePaymentTab, setActivePaymentTab] = useState<'mobile' | 'bank' | 'international' | 'license'>('mobile');

  // Transaction submission
  const [selectedMethodName, setSelectedMethodName] = useState('Easypaisa');
  const [transactionId, setTransactionId] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // License redemption
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [redeemingLicense, setRedeemingLicense] = useState(false);
  const [licenseMessage, setLicenseMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Copied clipboard notification
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await api.getPaymentSettings();
        if (isMounted) {
          setPaymentSettings(res.settings);
          setMethods(res.methods || []);
        }
      } catch (err) {
        console.warn('Failed to load dynamic payment settings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSettings();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const monthlyUsd = paymentSettings?.pricing_monthly_usd || 10;
  const monthlyPkr = paymentSettings?.pricing_monthly_pkr || 1500;
  const yearlyUsd = paymentSettings?.pricing_yearly_usd || 70;
  const yearlyPkr = paymentSettings?.pricing_yearly_pkr || 19500;

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRedeemLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = licenseKeyInput.trim();
    if (!cleanKey) {
      setLicenseMessage({ text: 'Please enter a valid license key.', isError: true });
      return;
    }

    setRedeemingLicense(true);
    setLicenseMessage(null);

    try {
      const res = await api.redeemCode(cleanKey);
      setLicenseMessage({ text: res.message || 'Pro mode unlocked successfully!', isError: false });
      setLicenseKeyInput('');
      await refreshUser();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setLicenseMessage({
        text: err.message || 'Invalid or already redeemed license key.',
        isError: true,
      });
    } finally {
      setRedeemingLicense(false);
    }
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) {
      setPaymentMessage({ text: 'Please enter your Transaction ID (TRX ID).', isError: true });
      return;
    }

    setSubmittingPayment(true);
    setPaymentMessage(null);

    try {
      const res = await api.submitPayment({
        plan: selectedPlan,
        payment_method: selectedMethodName,
        transaction_id: transactionId.trim(),
      });
      setPaymentMessage({
        text: res.message || 'Payment submitted! It will be reviewed by admin shortly.',
        isError: false,
      });
      setTransactionId('');
      await refreshUser();
    } catch (err: any) {
      setPaymentMessage({
        text: err.message || 'Failed to submit payment. Please verify transaction ID.',
        isError: true,
      });
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-md">
                Pro Access
              </span>
              {reason === 'limit_reached' && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> 1-Free-Demo Used
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white mt-1">Unlock Unlimited AI Shorts Maker</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-300">
          {/* Paywall Banner if limit reached */}
          {reason === 'limit_reached' && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-3">
              <Flame className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-amber-200">You have completed your 1 free demo project!</p>
                <p className="text-amber-300/80 mt-0.5">
                  Upgrade to Pro to remove all duration caps, generate up to 20 clips per video, and enjoy unlimited processing.
                </p>
              </div>
            </div>
          )}

          {/* 1. Plan Selector: Monthly vs Yearly */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Monthly Card */}
            <div
              onClick={() => setSelectedPlan('MONTHLY')}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                selectedPlan === 'MONTHLY'
                  ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10'
                  : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-white text-sm">Monthly Pro</h3>
                  <p className="text-[11px] text-slate-400">Billed monthly (30 days access)</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-white">${monthlyUsd}</span>
                  <span className="text-xs text-slate-400"> /mo</span>
                  <p className="text-[11px] text-indigo-400 font-medium">Rs {monthlyPkr.toLocaleString()} PKR</p>
                </div>
              </div>
              <ul className="text-[11px] space-y-1 text-slate-300 mt-3 pt-3 border-t border-slate-800/80">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Unlimited Video Generations
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Up to 20 Viral Clips per Video
                </li>
              </ul>
            </div>

            {/* Yearly Card (Featured) */}
            <div
              onClick={() => setSelectedPlan('YEARLY')}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                selectedPlan === 'YEARLY'
                  ? 'border-indigo-500 bg-indigo-950/30 shadow-xl shadow-indigo-500/20 ring-1 ring-indigo-500'
                  : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
              }`}
            >
              <span className="absolute -top-2.5 right-4 px-2 py-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[9px] font-black uppercase rounded-full shadow">
                Best Value · Save 40%
              </span>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-white text-sm">Yearly Pro (VIP)</h3>
                  <p className="text-[11px] text-slate-400">Full 365 Days Unlimited Access</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-white">${yearlyUsd}</span>
                  <span className="text-xs text-slate-400"> /yr</span>
                  <p className="text-[11px] text-emerald-400 font-medium">Rs {yearlyPkr.toLocaleString()} PKR</p>
                </div>
              </div>
              <ul className="text-[11px] space-y-1 text-slate-300 mt-3 pt-3 border-t border-slate-800/80">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> All Monthly Pro Features
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Priority Fast FFmpeg Encoding Queue
                </li>
              </ul>
            </div>
          </div>

          {/* 2. Prominent License Key Redemption Box */}
          <div className="p-5 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/40 border border-indigo-500/40 rounded-2xl shadow-xl shadow-indigo-950/30">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Key className="w-4 h-4" />
                </span>
                <h4 className="text-sm font-bold text-white tracking-wide">
                  Redeem License Key
                </h4>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" /> Instant Pro Unlock
              </span>
            </div>
            <p className="text-xs text-slate-300 mb-3.5 leading-relaxed">
              Have an Admin-issued License Key or Friend Pass? Enter it below to unlock 30-Day or 365-Day Pro mode instantly with unlimited clip processing.
            </p>
            <form onSubmit={handleRedeemLicense} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                placeholder="Enter license key (e.g. LIMA-XXXX-XXXX or YEAR-XXXX-XXXX)"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-3 bg-slate-950 border border-indigo-500/30 focus:border-indigo-400 rounded-xl text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 shadow-inner"
              />
              <button
                type="submit"
                disabled={redeemingLicense}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-md shadow-indigo-600/30"
              >
                <Key className="w-3.5 h-3.5" />
                {redeemingLicense ? 'Activating Pro...' : 'Redeem License Key'}
              </button>
            </form>
            {licenseMessage && (
              <div
                className={`mt-3 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  licenseMessage.isError
                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                }`}
              >
                {licenseMessage.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                <span>{licenseMessage.text}</span>
              </div>
            )}
          </div>

          {/* 3. Multi-Payment Options Tabs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Choose Payment Method ({selectedPlan === 'MONTHLY' ? `$${monthlyUsd} / Rs ${monthlyPkr.toLocaleString()}` : `$${yearlyUsd} / Rs ${yearlyPkr.toLocaleString()}`})
              </h4>
            </div>

            {/* Sub-tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
              <button
                type="button"
                onClick={() => setActivePaymentTab('mobile')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activePaymentTab === 'mobile'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" /> Easypaisa / JazzCash
              </button>
              <button
                type="button"
                onClick={() => setActivePaymentTab('bank')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activePaymentTab === 'bank'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                <Building className="w-3.5 h-3.5" /> Bank Transfer (IBAN)
              </button>
              <button
                type="button"
                onClick={() => setActivePaymentTab('international')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activePaymentTab === 'international'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" /> PayPal / Payoneer / Card
              </button>
              <button
                type="button"
                onClick={() => setActivePaymentTab('license')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activePaymentTab === 'license'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5 text-amber-400" /> License Key
              </button>
            </div>

            {/* Mobile Tab (Easypaisa & JazzCash) */}
            {activePaymentTab === 'mobile' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                {/* Easypaisa Box */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400">Easypaisa</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(paymentSettings?.easypaisa_number || '03103098200', 'ep')}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'ep' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'ep' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="font-mono text-sm font-bold text-white">
                    {paymentSettings?.easypaisa_number || '03103098200'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Title: <span className="text-slate-200">{paymentSettings?.easypaisa_title || 'AI Shorts Maker Services'}</span>
                  </div>
                </div>

                {/* JazzCash Box */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">JazzCash</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(paymentSettings?.jazzcash_number || '03001234567', 'jc')}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'jc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'jc' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="font-mono text-sm font-bold text-white">
                    {paymentSettings?.jazzcash_number || '03001234567'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Title: <span className="text-slate-200">{paymentSettings?.jazzcash_title || 'AI Shorts Maker'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Bank Tab */}
            {activePaymentTab === 'bank' && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-indigo-400">
                    {paymentSettings?.bank_name || 'Meezan Bank / HBL Online'}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(paymentSettings?.bank_iban || 'PK36MEZN0001010106789123', 'iban')}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'iban' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'iban' ? 'IBAN Copied' : 'Copy IBAN'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Account Title: </span>
                    <span className="text-white font-medium">{paymentSettings?.bank_account_title || 'AI Shorts Maker Official'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Account Number: </span>
                    <span className="text-white font-mono">{paymentSettings?.bank_account_number || '0101-0106789123-01'}</span>
                  </div>
                </div>
                <div className="text-xs">
                  <span className="text-slate-400">IBAN: </span>
                  <span className="text-indigo-300 font-mono font-medium">{paymentSettings?.bank_iban || 'PK36MEZN0001010106789123'}</span>
                </div>
              </div>
            )}

            {/* International Tab */}
            {activePaymentTab === 'international' && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">PayPal Email</span>
                    <span className="text-white font-medium">{paymentSettings?.paypal_email || 'payments@aishortsmaker.com'}</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Payoneer Email</span>
                    <span className="text-white font-medium">{paymentSettings?.payoneer_email || 'payments@aishortsmaker.com'}</span>
                  </div>
                </div>
                {paymentSettings?.card_payment_link && (
                  <div className="pt-1">
                    <a
                      href={paymentSettings.card_payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Pay via Debit/Credit Card (Stripe) <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* License Tab */}
            {activePaymentTab === 'license' && (
              <div className="p-4 bg-slate-950 border border-indigo-500/30 rounded-xl space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>Instant Pro Activation via License Key</span>
                </div>
                <p className="text-xs text-slate-400">
                  Enter your 30-Day Monthly (LIMA-XXXX-XXXX) or 365-Day Yearly (YEAR-XXXX-XXXX) license key below for instant activation without waiting for payment verification.
                </p>
                <form onSubmit={handleRedeemLicense} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="e.g. LIMA-XXXX-XXXX or YEAR-XXXX-XXXX"
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                    className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={redeemingLicense}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {redeemingLicense ? 'Verifying...' : 'Redeem License Key'}
                  </button>
                </form>
              </div>
            )}

            {/* 4. Transaction Confirmation Form */}
            <form onSubmit={handleSubmitTransaction} className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
              <h5 className="text-xs font-bold text-white">Submit Transaction Confirmation</h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Selected Plan</label>
                  <select
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  >
                    <option value="MONTHLY">Monthly (${monthlyUsd} / Rs {monthlyPkr.toLocaleString()})</option>
                    <option value="YEARLY">Yearly (${yearlyUsd} / Rs {yearlyPkr.toLocaleString()})</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Method Used</label>
                  <input
                    type="text"
                    value={selectedMethodName}
                    onChange={(e) => setSelectedMethodName(e.target.value)}
                    placeholder="Easypaisa, JazzCash, Meezan..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Transaction ID (TRX ID)</label>
                  <input
                    type="text"
                    placeholder="e.g. 1284958219"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono placeholder:text-slate-600"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  {submittingPayment ? 'Submitting...' : 'Submit Payment for Verification'}
                </button>
              </div>
              {paymentMessage && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    paymentMessage.isError
                      ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  }`}
                >
                  {paymentMessage.isError ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{paymentMessage.text}</span>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
