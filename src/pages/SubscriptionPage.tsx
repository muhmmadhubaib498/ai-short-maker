import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { firestoreService } from '../services/firestoreService';
import type { Payment, PaymentMethodConfig } from '../types';
import {
  CreditCard,
  Check,
  ShieldCheck,
  Gift,
  Clock,
  AlertCircle,
  HelpCircle,
  Smartphone,
  Building,
  CheckCircle,
  XCircle,
  Copy,
  Info,
} from 'lucide-react';

export const SubscriptionPage: React.FC = () => {
  const { user, subscription, license, isOwner, isPaid, refreshUser } = useAuth();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [transactionId, setTransactionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentSubmitStatus, setPaymentSubmitStatus] = useState<{ message: string; isError: boolean } | null>(null);

  // Free pass redemption state
  const [passCode, setPassCode] = useState('');
  const [passStatus, setPassStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // My payments history
  const [myPayments, setMyPayments] = useState<Payment[]>([]);
  const [copiedAccount, setCopiedAccount] = useState(false);

  const fetchPaymentData = async () => {
    try {
      const [methodsRes, paymentsRes] = await Promise.all([
        api.getPaymentMethods(),
        api.getMyPayments(),
      ]);
      setPaymentMethods(methodsRes.methods);
      if (methodsRes.methods.length > 0 && !selectedMethodId) {
        setSelectedMethodId(methodsRes.methods[0].id);
      }
      setMyPayments(paymentsRes.payments);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPaymentData();
  }, []);

  const activeMethod = paymentMethods.find((m) => m.id === selectedMethodId) || paymentMethods[0];
  const planAmount = selectedPlan === 'MONTHLY' ? 10 : 50;
  const planDuration = selectedPlan === 'MONTHLY' ? 30 : 365;

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) return;

    setIsSubmitting(true);
    setPaymentSubmitStatus(null);

    try {
      const res = await api.submitPayment({
        plan: selectedPlan,
        payment_method: activeMethod?.name || 'Easypaisa',
        transaction_id: transactionId.trim(),
      });

      // Sync payment to Firestore
      firestoreService.syncPayment(res.payment).catch((e) => {
        console.warn('Firestore payment sync error:', e);
      });

      setPaymentSubmitStatus({ message: res.message, isError: false });
      setTransactionId('');
      fetchPaymentData();
      refreshUser();
    } catch (err: any) {
      setPaymentSubmitStatus({ message: err.message || 'Payment submission failed.', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passCode.trim()) return;

    setIsRedeeming(true);
    setPassStatus(null);

    try {
      const res = await api.redeemCode(passCode.trim());
      setPassStatus({ message: res.message, isError: false });
      setPassCode('');
      await refreshUser();
    } catch (err: any) {
      setPassStatus({ message: err.message || 'Failed to activate code.', isError: true });
    } finally {
      setIsRedeeming(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* 1. Header & Active Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Subscription & Licenses</h1>
            {isOwner && (
              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-bold">
                OWNER LIFETIME
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Manage your subscription, activate Friend Pass codes, and track manual payments.
          </p>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 min-w-[240px]">
          <div className="text-[11px] text-slate-400 mb-0.5">Current Account Tier</div>
          <div className="text-sm font-bold text-white mb-1">
            {isOwner ? (
              <span className="text-amber-400">Owner Lifetime Access (Active)</span>
            ) : isPaid ? (
              <span className="text-emerald-400">
                {subscription?.plan === 'YEARLY' ? 'Yearly Pro' : 'Monthly Pro'} (Active)
              </span>
            ) : user?.demo_used ? (
              <span className="text-amber-400">Demo Expired (Upgrade Required)</span>
            ) : (
              <span className="text-indigo-400">Free Demo Available (1 Video)</span>
            )}
          </div>
          {license && (
            <div className="text-[11px] font-mono text-slate-400">
              License: <span className="text-slate-200 font-semibold">{license.license_key}</span>
            </div>
          )}
          {subscription?.expires_at && (
            <div className="text-[10px] text-slate-500 mt-1">
              Valid until: {new Date(subscription.expires_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      {/* 2. Free Pass Redemption Box */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-md">
        <div className="flex items-center gap-2.5 text-indigo-400 mb-2">
          <Gift className="w-5 h-5" />
          <h2 className="text-base font-semibold text-white">Have a License or Friend Pass Code?</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4 max-w-2xl leading-relaxed">
          If you received an Owner Friend Pass (e.g. FRIEND-XXXX-XXXX) or have an unlinked license key, enter it here to instantly activate 30 days of premium access with no payment needed.
        </p>

        <form onSubmit={handleRedeemCode} className="flex flex-col sm:flex-row gap-3 max-w-lg">
          <input
            type="text"
            value={passCode}
            onChange={(e) => setPassCode(e.target.value)}
            placeholder="Enter Code (e.g. FRIEND-7K29-XP41)"
            className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white uppercase placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={isRedeeming || !passCode.trim()}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shadow-sm shadow-indigo-600/30"
          >
            {isRedeeming ? 'Activating...' : 'Activate Code'}
          </button>
        </form>

        {passStatus && (
          <div
            className={`mt-4 text-xs p-3 rounded-xl max-w-lg ${
              passStatus.isError
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
            }`}
          >
            {passStatus.message}
          </div>
        )}
      </div>

      {/* 3. Manual Payment & Subscription Flow */}
      {!isOwner && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Plan Selection */}
          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-base font-semibold text-white">1. Select Your Plan</h2>

            {/* Monthly Option */}
            <div
              onClick={() => setSelectedPlan('MONTHLY')}
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                selectedPlan === 'MONTHLY'
                  ? 'bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-600/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase font-mono text-indigo-400">Monthly Pro</span>
                <span className="text-lg font-bold text-white">$10</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Full video processing, unlimited 9:16 vertical shorts, and synchronized captions for 30 days.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> 30 Days Unrestricted Access
              </div>
            </div>

            {/* Yearly Option */}
            <div
              onClick={() => setSelectedPlan('YEARLY')}
              className={`p-5 rounded-2xl border cursor-pointer transition-all relative ${
                selectedPlan === 'YEARLY'
                  ? 'bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-600/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="absolute top-4 right-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold px-2 py-0.5 rounded font-mono">
                SAVE 58%
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase font-mono text-indigo-400">Yearly Pro</span>
                <span className="text-lg font-bold text-white">$50</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Unrestricted access for an entire year. Includes priority job queue processing and zip downloads.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> 365 Days Unrestricted Access
              </div>
            </div>
          </div>

          {/* Right Column: Payment Details & TRX ID Form */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">2. Send Payment & Submit Transaction ID</h2>
              <p className="text-xs text-slate-400 mt-1">
                Selected: <span className="font-semibold text-white">{selectedPlan} Plan</span> (${planAmount} USD / {planDuration} days)
              </p>
            </div>

            {/* Configurable Payment Methods Tabs */}
            {paymentMethods.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Payment Method</label>
                <div className="flex flex-wrap gap-2">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethodId(method.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        selectedMethodId === method.id
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {method.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Display Active Payment Details */}
            {activeMethod && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Method</span>
                  <span className="text-xs font-semibold text-indigo-400">{activeMethod.name}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Account / Mobile Number</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-white tracking-wider">
                      {activeMethod.account_number}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeMethod.account_number)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-[10px]"
                      title="Copy number"
                    >
                      {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Account Title</span>
                  <span className="text-xs font-medium text-slate-200">{activeMethod.account_title}</span>
                </div>

                <div className="pt-2 border-t border-slate-900 text-xs text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-300 block mb-1">Instructions:</span>
                  {activeMethod.instructions}
                </div>
              </div>
            )}

            {/* Payment submission form */}
            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Transaction / Reference ID (TRX ID)
                </label>
                <input
                  type="text"
                  required
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. 29381048291 or Meezan-Ref-9921"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Your payment will be reviewed by the Owner/Admin. Entering a Transaction ID submits a review request; it is manually verified before license issuance.
                </p>
              </div>

              {paymentSubmitStatus && (
                <div
                  className={`text-xs p-3 rounded-xl ${
                    paymentSubmitStatus.isError
                      ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                      : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  {paymentSubmitStatus.message}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !transactionId.trim()}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/30"
              >
                {isSubmitting ? 'Submitting Verification Request...' : `Submit Payment of $${planAmount} for Review`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. Payment History Table */}
      {myPayments.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-white">Payment Submissions History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-mono">
                <tr>
                  <th className="pb-3 pr-4 font-normal">Plan</th>
                  <th className="pb-3 pr-4 font-normal">Amount</th>
                  <th className="pb-3 pr-4 font-normal">Method</th>
                  <th className="pb-3 pr-4 font-normal">Transaction ID</th>
                  <th className="pb-3 pr-4 font-normal">Date</th>
                  <th className="pb-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {myPayments.map((p) => {
                  const isApproved = p.status === 'APPROVED';
                  const isRejected = p.status === 'REJECTED';
                  const isPending = p.status === 'PENDING';

                  return (
                    <tr key={p.id} className="text-slate-300 hover:bg-slate-800/30">
                      <td className="py-3 pr-4 font-medium text-white">{p.plan}</td>
                      <td className="py-3 pr-4">${p.amount} USD</td>
                      <td className="py-3 pr-4 text-slate-400">{p.payment_method}</td>
                      <td className="py-3 pr-4 text-indigo-400">{p.transaction_id}</td>
                      <td className="py-3 pr-4 text-slate-500">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {isApproved && (
                          <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                            <CheckCircle className="w-3.5 h-3.5" /> APPROVED
                          </span>
                        )}
                        {isPending && (
                          <span className="text-amber-400 flex items-center gap-1 font-semibold">
                            <Clock className="w-3.5 h-3.5 animate-spin" /> PENDING REVIEW
                          </span>
                        )}
                        {isRejected && (
                          <span
                            className="text-rose-400 flex items-center gap-1 font-semibold"
                            title={p.rejection_reason || 'Verification failed'}
                          >
                            <XCircle className="w-3.5 h-3.5" /> REJECTED
                            {p.rejection_reason && (
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({p.rejection_reason})
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
