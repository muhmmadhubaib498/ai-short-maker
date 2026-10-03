import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import type {
  User,
  Payment,
  License,
  FreePassCode,
  Job,
  AppSettings,
  PaymentMethodConfig,
  DynamicPaymentSettings,
} from '../../types';
import {
  ShieldCheck,
  Users,
  CreditCard,
  Gift,
  Tag,
  Settings,
  Cpu,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Plus,
  Trash2,
  Copy,
  Download,
  AlertTriangle,
  Check,
  Sliders,
  DollarSign,
  FileVideo,
  Key,
  Smartphone,
  Sparkles,
} from 'lucide-react';

export const OwnerDashboard: React.FC = () => {
  const { user, isOwner } = useAuth();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'payments' | 'licenses' | 'freepasses' | 'pricing' | 'paymentMethods' | 'settings' | 'admins' | 'jobs'
  >('overview');

  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<any>(null);

  // Users tab state
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Payments tab state
  const [paymentsList, setPaymentsList] = useState<Payment[]>([]);
  const [rejectReasonInput, setRejectReasonInput] = useState<{ [id: string]: string }>({});

  // Free passes tab state
  const [freePasses, setFreePasses] = useState<FreePassCode[]>([]);
  const [generateQuantity, setGenerateQuantity] = useState(10);
  const [customQuantity, setCustomQuantity] = useState('');
  const [passFilter, setPassFilter] = useState<'ALL' | 'UNUSED' | 'USED' | 'REVOKED'>('ALL');

  // Licenses tab state
  const [licensesList, setLicensesList] = useState<License[]>([]);
  const [genLicensePlan, setGenLicensePlan] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [genLicenseDays, setGenLicenseDays] = useState<number>(30);
  const [isGeneratingLicense, setIsGeneratingLicense] = useState(false);
  const [deletingLicId, setDeletingLicId] = useState<string | null>(null);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);

  // Pricing tab state
  const [pricingForm, setPricingForm] = useState<any>({
    pricing_monthly_amount: 10,
    pricing_monthly_duration: 30,
    pricing_yearly_amount: 50,
    pricing_yearly_duration: 365,
    demo_max_projects: 1,
    demo_max_video_duration_minutes: 5,
    demo_max_clips: 3,
    max_upload_size_mb: 500,
  });

  // Payment Methods & Dynamic Payment Settings
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [dynamicSettings, setDynamicSettings] = useState<DynamicPaymentSettings>({
    pricing_monthly_usd: 10,
    pricing_monthly_pkr: 1500,
    pricing_yearly_usd: 70,
    pricing_yearly_pkr: 19500,
    pricing_monthly_duration: 30,
    pricing_yearly_duration: 365,
    easypaisa_number: '03103098200',
    easypaisa_title: 'AI Shorts Maker Services',
    jazzcash_number: '03001234567',
    jazzcash_title: 'AI Shorts Maker',
    bank_name: 'Meezan Bank',
    bank_account_title: 'AI Shorts Maker Official',
    bank_account_number: '0101-0106789123-01',
    bank_iban: 'PK36MEZN0001010106789123',
    paypal_email: 'payments@aishortsmaker.com',
    payoneer_email: 'payments@aishortsmaker.com',
    card_payment_link: 'https://buy.stripe.com/example',
    instructions:
      'Transfer the exact plan amount to any supported payment method below. Then enter your Transaction ID or redeem a license key for instant Pro activation.',
  });

  // Settings tab state
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Admins tab state
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // Jobs tab state
  const [jobsList, setJobsList] = useState<Job[]>([]);

  // Global action message
  const [actionNotice, setActionNotice] = useState<{ text: string; isError?: boolean } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const showNotice = (text: string, isError = false) => {
    setActionNotice({ text, isError });
    setTimeout(() => setActionNotice(null), 3500);
  };

  const loadDataForTab = async (tab = activeTab) => {
    try {
      setLoading(true);
      if (tab === 'overview') {
        const res = await api.owner.getMetrics();
        setMetricsData(res);
      } else if (tab === 'users') {
        const res = await api.owner.getUsers();
        setUsersList(res.users);
      } else if (tab === 'payments') {
        const res = await api.owner.getPayments();
        setPaymentsList(res.payments);
      } else if (tab === 'licenses') {
        const res = await api.owner.getLicenses();
        setLicensesList(res.licenses);
      } else if (tab === 'freepasses') {
        const res = await api.owner.getFreePasses();
        setFreePasses(res.codes);
      } else if (tab === 'pricing') {
        const [priceRes, pRes] = await Promise.all([api.owner.getPricing(), api.owner.getPaymentSettings()]);
        setPricingForm(priceRes);
        if (pRes?.settings) setDynamicSettings(pRes.settings);
      } else if (tab === 'paymentMethods') {
        const [pRes, methodsRes] = await Promise.all([api.owner.getPaymentSettings(), api.owner.getPaymentMethods()]);
        if (pRes?.settings) setDynamicSettings(pRes.settings);
        setPaymentMethods(methodsRes.methods);
      } else if (tab === 'settings') {
        const res = await api.owner.getSettings();
        setAppSettings(res.settings);
      } else if (tab === 'admins') {
        const res = await api.owner.getAdmins();
        setAdminsList(res.admins);
      } else if (tab === 'jobs') {
        const res = await api.owner.getJobs();
        setJobsList(res.jobs);
      }
    } catch (err: any) {
      console.error(err);
      showNotice(err.message || 'Failed to fetch data.', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDataForTab(activeTab);
  }, [activeTab]);

  // User Actions
  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api.owner.updateUser(userId, { status: nextStatus });
      setUsersList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u))
      );
      showNotice(`User status updated to ${nextStatus}.`);
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  const handleExtendUserSub = async (userId: string, days: number) => {
    try {
      await api.owner.updateUser(userId, { extend_days: days });
      loadDataForTab('users');
      showNotice(`Extended user subscription by ${days} days.`);
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!window.confirm(`Delete user "${name}" and all their projects?`)) return;
    try {
      await api.owner.deleteUser(userId);
      setUsersList((prev) => prev.filter((u) => u.id !== userId));
      showNotice('User deleted successfully.');
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  // Payment Actions
  const handleApprovePayment = async (paymentId: string) => {
    try {
      const res = await api.owner.approvePayment(paymentId);
      setPaymentsList((prev) =>
        prev.map((p) => (p.id === paymentId ? res.payment : p))
      );
      showNotice(res.message);
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    const reason = rejectReasonInput[paymentId] || 'Transaction could not be verified on the specified account.';
    try {
      const res = await api.owner.rejectPayment(paymentId, reason);
      setPaymentsList((prev) =>
        prev.map((p) => (p.id === paymentId ? res.payment : p))
      );
      showNotice('Payment rejected and user notified.');
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  // Free Pass Actions
  const handleGenerateFreePasses = async (qty: number) => {
    try {
      const res = await api.owner.generateFreePasses(qty);
      setFreePasses((prev) => [...res.codes, ...prev]);
      showNotice(res.message);
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  const handleRevokePass = async (id: string) => {
    try {
      const res = await api.owner.revokeFreePass(id);
      setFreePasses((prev) =>
        prev.map((p) => (p.id === id ? res.code : p))
      );
      showNotice('Pass code revoked.');
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  const handleExportPasses = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Code,Status,Created At,Redeemed By,Redeemed At,Expires At']
        .concat(
          freePasses.map(
            (p) =>
              `${p.code},${p.status},${p.created_at},${p.redeemed_by_email || p.redeemed_by || ''},${p.redeemed_at || ''},${p.expires_at || ''}`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `friend_pass_codes_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // License Key Generation (Flexible Custom Days)
  const handleGenerateLicenseKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingLicense(true);
    try {
      const days = Math.max(1, genLicenseDays || 30);
      const res = await api.owner.generateLicense({
        plan: days >= 365 ? 'YEARLY' : 'MONTHLY',
        duration_days: days,
      });
      setLicensesList((prev) => [res.license, ...prev]);
      setNewlyGeneratedKey(res.license.license_key);
      showNotice(res.message || `Generated ${days}-Day Pro Key: ${res.license.license_key}`);
    } catch (err: any) {
      showNotice(err.message || 'Failed to generate license key.', true);
    } finally {
      setIsGeneratingLicense(false);
    }
  };

  // License Key Deletion & Pro Revocation
  const handleDeleteLicense = async (lic: License) => {
    const isBound = Boolean(lic.user_id);
    const confirmPrompt = isBound
      ? `Revoke and Delete license key "${lic.license_key}"?\n\n⚠️ WARNING: This license is currently ACTIVE on a user account. Deleting it will immediately revoke their Pro status and restore the paywall block!`
      : `Delete license key "${lic.license_key}"?`;

    if (!window.confirm(confirmPrompt)) return;

    setDeletingLicId(lic.id);
    try {
      const res = await api.owner.deleteLicense(lic.id);
      setLicensesList((prev) => prev.filter((item) => item.id !== lic.id));
      showNotice(res.message || `License ${lic.license_key} deleted successfully.`);
    } catch (err: any) {
      showNotice(err.message || 'Failed to delete license key.', true);
    } finally {
      setDeletingLicId(null);
    }
  };

  // Pricing Save
  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.owner.updatePricing(pricingForm);
      showNotice(res.message);
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  // Payment Methods Save
  const handleSavePaymentMethods = async () => {
    try {
      const res = await api.owner.updatePaymentMethods(paymentMethods);
      setPaymentMethods(res.methods);
      showNotice('Payment methods updated successfully.');
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  // Create Admin
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.owner.createAdmin({
        name: newAdminName,
        email: newAdminEmail,
        password: newAdminPassword,
      });
      setAdminsList((prev) => [...prev, res.admin]);
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      showNotice(res.message);
    } catch (e: any) {
      showNotice(e.message, true);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {isOwner ? 'Owner Management Console' : 'Administrator Console'}
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold uppercase">
              {user?.role}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            System authorization, user management, manual payment reviews, and Free Pass generation.
          </p>
        </div>

        {actionNotice && (
          <div
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 animate-fade-in ${
              actionNotice.isError ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}
          >
            {actionNotice.isError ? <AlertTriangle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            <span>{actionNotice.text}</span>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-800/80 text-xs font-medium text-slate-400 scrollbar-none">
        {[
          { id: 'overview', label: 'Overview', icon: Sliders },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'payments', label: 'Payments Queue', icon: CreditCard },
          { id: 'licenses', label: 'Licenses', icon: Key },
          { id: 'freepasses', label: 'Free Pass Generator', icon: Gift },
          { id: 'pricing', label: 'Pricing & Limits', icon: DollarSign },
          { id: 'paymentMethods', label: 'Payment Settings', icon: CreditCard },
          { id: 'settings', label: 'App & AI Config', icon: Settings },
          { id: 'admins', label: 'Admin Team', icon: ShieldCheck },
          { id: 'jobs', label: 'Jobs Monitor', icon: Cpu },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/30'
                  : 'hover:text-white hover:bg-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && metricsData && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 block mb-1">Total Users</span>
              <span className="text-xl font-bold font-mono text-white">{metricsData.metrics.totalUsers}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 block mb-1">Monthly Subs</span>
              <span className="text-xl font-bold font-mono text-indigo-400">{metricsData.metrics.monthlySubs}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 block mb-1">Yearly Subs</span>
              <span className="text-xl font-bold font-mono text-emerald-400">{metricsData.metrics.yearlySubs}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 block mb-1">Pending Payments</span>
              <span className="text-xl font-bold font-mono text-amber-400">{metricsData.metrics.pendingPayments}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 block mb-1">Total Revenue</span>
              <span className="text-xl font-bold font-mono text-emerald-400">${metricsData.metrics.totalRevenue}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[11px] text-slate-400 block mb-1">Clips Rendered</span>
              <span className="text-xl font-bold font-mono text-white">{metricsData.metrics.totalClips}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Payments */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Recent Payment Requests</h3>
                <button
                  onClick={() => setActiveTab('payments')}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  Manage queue →
                </button>
              </div>

              {metricsData.recentPayments.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No payment requests yet.</p>
              ) : (
                <div className="divide-y divide-slate-800/60 font-mono text-xs">
                  {metricsData.recentPayments.map((p: any) => (
                    <div key={p.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium">{p.user_email}</div>
                        <div className="text-[11px] text-slate-400">
                          {p.plan} · ${p.amount} · Trx: {p.transaction_id}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          p.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : p.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Free Pass Stats Summary */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Free Pass / Friend Pass Overview</h3>
                <button
                  onClick={() => setActiveTab('freepasses')}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  Generate codes →
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
                <div className="p-3 bg-slate-950 rounded-xl">
                  <span className="text-slate-400 block text-[11px]">Unused Codes</span>
                  <span className="text-lg font-bold text-emerald-400">{metricsData.metrics.freePassUnused}</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl">
                  <span className="text-slate-400 block text-[11px]">Redeemed Codes</span>
                  <span className="text-lg font-bold text-indigo-400">{metricsData.metrics.freePassUsed}</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl">
                  <span className="text-slate-400 block text-[11px]">Total Generated</span>
                  <span className="text-lg font-bold text-white">{metricsData.metrics.freePassTotal}</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl">
                  <span className="text-slate-400 block text-[11px]">Active Video Jobs</span>
                  <span className="text-lg font-bold text-amber-400">{metricsData.metrics.activeJobs}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Users Management */}
      {activeTab === 'users' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">User Accounts ({usersList.length})</h2>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-mono">
                <tr>
                  <th className="pb-3 pr-4 font-normal">User</th>
                  <th className="pb-3 pr-4 font-normal">Role</th>
                  <th className="pb-3 pr-4 font-normal">Plan</th>
                  <th className="pb-3 pr-4 font-normal">Expiry</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {usersList
                  .filter(
                    (u) =>
                      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
                      u.email.toLowerCase().includes(userSearch.toLowerCase())
                  )
                  .map((u) => {
                    const isUserOwner = u.role === 'OWNER';
                    return (
                      <tr key={u.id} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="py-3 pr-4">
                          <div className="font-sans font-medium text-white">{u.name}</div>
                          <div className="text-[11px] text-slate-400">{u.email}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === 'OWNER'
                                ? 'bg-amber-500/10 text-amber-400'
                                : u.role === 'ADMIN'
                                ? 'bg-indigo-500/10 text-indigo-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-300">
                          {u.subscription?.plan || (u.demo_used ? 'Demo Used' : 'Free Demo')}
                        </td>
                        <td className="py-3 pr-4 text-slate-400">
                          {isUserOwner
                            ? 'Never'
                            : u.subscription?.expires_at
                            ? new Date(u.subscription.expires_at).toLocaleDateString()
                            : '-'}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.status === 'ACTIVE'
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : 'text-rose-400 bg-rose-500/10'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 text-right space-x-2">
                          {!isUserOwner && (
                            <>
                              <button
                                onClick={() => handleToggleUserStatus(u.id, u.status)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] transition-colors"
                              >
                                {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                              </button>
                              <button
                                onClick={() => handleExtendUserSub(u.id, 30)}
                                className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded text-[11px] transition-colors"
                              >
                                +30d Sub
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id, u.name)}
                                className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-500/10 transition-colors"
                                title="Delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5 inline" />
                              </button>
                            </>
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

      {/* Tab 3: Payments Queue */}
      {activeTab === 'payments' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Manual Payments Verification Queue</h2>
              <p className="text-xs text-slate-400">
                Review submitted Easypaisa & Bank transfer Transaction IDs. Approving activates the user's plan and issues a unique license.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-mono">
                <tr>
                  <th className="pb-3 pr-4 font-normal">User</th>
                  <th className="pb-3 pr-4 font-normal">Plan</th>
                  <th className="pb-3 pr-4 font-normal">Amount</th>
                  <th className="pb-3 pr-4 font-normal">Method</th>
                  <th className="pb-3 pr-4 font-normal">Transaction ID</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 font-normal text-right">Review Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {paymentsList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No payments recorded yet.
                    </td>
                  </tr>
                ) : (
                  paymentsList.map((p) => {
                    const isPending = p.status === 'PENDING';
                    return (
                      <tr key={p.id} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="py-3 pr-4">
                          <div className="font-sans font-medium text-white">{p.user_name || p.user_id}</div>
                          <div className="text-[11px] text-slate-400">{p.user_email}</div>
                        </td>
                        <td className="py-3 pr-4 font-medium text-white">{p.plan}</td>
                        <td className="py-3 pr-4">${p.amount} USD</td>
                        <td className="py-3 pr-4 text-slate-400">{p.payment_method}</td>
                        <td className="py-3 pr-4 text-indigo-400 font-bold">{p.transaction_id}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              p.status === 'APPROVED'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : p.status === 'PENDING'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleApprovePayment(p.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => handleRejectPayment(p.id)}
                                className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 rounded text-[11px] transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              Reviewed {p.reviewed_at ? new Date(p.reviewed_at).toLocaleDateString() : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Licenses */}
      {activeTab === 'licenses' && (
        <div className="space-y-6 animate-fade-in">
          {/* License Key Generator */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Key className="w-5 h-5" />
              <h2 className="text-base font-semibold text-white">Generate Pro License Key (Custom Duration)</h2>
            </div>
            <p className="text-xs text-slate-400">
              Generate official Pro license keys for ANY custom duration (e.g. 1 day, 2 days, 5 days, 15 days, 30 days, 365 days). When a user redeems the key, Pro access is activated until the exact calculated expiry timestamp.
            </p>

            <form onSubmit={handleGenerateLicenseKey} className="space-y-3 pt-1">
              {/* Duration Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-medium mr-1">Quick Presets:</span>
                {[
                  { label: '1 Day', days: 1 },
                  { label: '2 Days', days: 2 },
                  { label: '5 Days', days: 5 },
                  { label: '15 Days', days: 15 },
                  { label: '30 Days', days: 30 },
                  { label: '365 Days', days: 365 },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => {
                      setGenLicenseDays(preset.days);
                      setGenLicensePlan(preset.days >= 365 ? 'YEARLY' : 'MONTHLY');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      genLicenseDays === preset.days
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                        : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Days Input & Submit */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
                  <label htmlFor="custom-license-days" className="text-xs text-slate-300 font-medium">Valid for Days:</label>
                  <input
                    id="custom-license-days"
                    type="number"
                    value={genLicenseDays}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setGenLicenseDays(val);
                      setGenLicensePlan(val >= 365 ? 'YEARLY' : 'MONTHLY');
                    }}
                    className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono text-center focus:outline-none focus:border-indigo-500"
                    min={1}
                    max={3650}
                  />
                  <span className="text-xs text-slate-400">days</span>
                </div>

                <button
                  type="submit"
                  disabled={isGeneratingLicense}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs rounded-xl transition-colors shadow-sm shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isGeneratingLicense ? 'Generating...' : `Generate ${genLicenseDays}-Day Pro Key`}
                </button>
              </div>
            </form>

            {newlyGeneratedKey && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 text-xs animate-fade-in">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-300">Generated Pro Key:</span>
                  <span className="font-mono font-bold text-white bg-slate-950 px-2.5 py-1 rounded border border-emerald-500/30">
                    {newlyGeneratedKey}
                  </span>
                  <span className="text-[11px] text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded font-mono">
                    {genLicenseDays} Days Valid
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(newlyGeneratedKey);
                    showNotice('License key copied to clipboard!');
                  }}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" /> Copy Key
                </button>
              </div>
            )}
          </div>

          {/* Issued Licenses Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Issued Licenses ({licensesList.length})</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage all generated keys. Revoking or deleting an active key immediately blocks user Pro access.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-400 font-mono">
                  <tr>
                    <th className="pb-3 pr-4 font-normal">License Key</th>
                    <th className="pb-3 pr-4 font-normal">Duration</th>
                    <th className="pb-3 pr-4 font-normal">Assigned User</th>
                    <th className="pb-3 pr-4 font-normal">Plan</th>
                    <th className="pb-3 pr-4 font-normal">Expiry</th>
                    <th className="pb-3 pr-4 font-normal">Status</th>
                    <th className="pb-3 text-right font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {licensesList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No licenses issued yet. Generate a custom-day key above to get started.
                      </td>
                    </tr>
                  ) : (
                    licensesList.map((lic) => {
                      const days = lic.duration_days || (lic.plan === 'YEARLY' ? 365 : 30);
                      const isAssigned = Boolean(lic.user_id);
                      const assignedUserText = (lic as any).user_email || (lic as any).user_name || (lic.user_id ? `User: ${lic.user_id}` : 'Unassigned (Pending)');

                      return (
                        <tr key={lic.id} className="text-slate-300 hover:bg-slate-800/30">
                          <td className="py-3 pr-4 font-bold text-white font-mono">{lic.license_key}</td>
                          <td className="py-3 pr-4 text-indigo-300 font-semibold">{days} Days</td>
                          <td className="py-3 pr-4 text-slate-400 truncate max-w-[180px]" title={assignedUserText}>
                            {assignedUserText}
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-slate-300">{lic.plan}</span>
                            <span className="text-[10px] text-slate-500 ml-1">({lic.license_type})</span>
                          </td>
                          <td className="py-3 pr-4 text-slate-400">
                            {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Upon Redeem'}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                lic.status === 'ACTIVE'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : lic.status === 'PENDING'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {lic.status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(lic.license_key);
                                  showNotice('License key copied to clipboard!');
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                                title="Copy Key"
                              >
                                <Copy className="w-3 h-3" />
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLicense(lic)}
                                disabled={deletingLicId === lic.id}
                                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title={isAssigned ? "Revoke bound user's Pro access and delete key" : "Delete license key"}
                              >
                                <Trash2 className="w-3 h-3 text-rose-400" />
                                {deletingLicId === lic.id ? 'Deleting...' : 'Delete / Revoke'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Free Pass / Friend Pass Generator & Management */}
      {activeTab === 'freepasses' && (
        <div className="space-y-6 animate-fade-in">
          {/* Generator Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-400">
                <Gift className="w-5 h-5" />
                <h2 className="text-base font-semibold text-white">Owner Free Pass / Friend Pass Generator</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Generate batches of cryptographically unique Friend Pass codes (e.g. FRIEND-XXXX-XXXX). Each code grants a normal user 30 days of full premium access without payment.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-xs font-semibold text-slate-300 mr-2">Generate Batch:</span>
              {[5, 10, 20, 50, 100].map((qty) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => handleGenerateFreePasses(qty)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  +{qty} Codes
                </button>
              ))}

              <button
                type="button"
                onClick={handleExportPasses}
                className="ml-auto px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Codes List Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">
                Generated Codes List ({freePasses.length})
              </h3>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(['ALL', 'UNUSED', 'USED', 'REVOKED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setPassFilter(st)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      passFilter === st ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-400 font-mono">
                  <tr>
                    <th className="pb-3 pr-4 font-normal">Code</th>
                    <th className="pb-3 pr-4 font-normal">Status</th>
                    <th className="pb-3 pr-4 font-normal">Created Date</th>
                    <th className="pb-3 pr-4 font-normal">Redeemed By</th>
                    <th className="pb-3 pr-4 font-normal">Redeemed Date</th>
                    <th className="pb-3 font-normal text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {freePasses
                    .filter((p) => passFilter === 'ALL' || p.status === passFilter)
                    .map((p) => {
                      const isUnused = p.status === 'UNUSED';
                      return (
                        <tr key={p.id} className="text-slate-300 hover:bg-slate-800/30">
                          <td className="py-3 pr-4 font-bold text-white font-mono flex items-center gap-2">
                            <span>{p.code}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(p.code);
                                setCopiedCode(p.code);
                                setTimeout(() => setCopiedCode(null), 2000);
                              }}
                              className="p-1 hover:text-indigo-400 transition-colors"
                              title="Copy code"
                            >
                              {copiedCode === p.code ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.status === 'UNUSED'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : p.status === 'USED'
                                  ? 'bg-indigo-500/10 text-indigo-400'
                                  : 'bg-rose-500/10 text-rose-400'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-slate-400">
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-4 text-slate-300">
                            {p.redeemed_by_email || p.redeemed_by || '-'}
                          </td>
                          <td className="py-3 pr-4 text-slate-400">
                            {p.redeemed_at ? new Date(p.redeemed_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="py-3 text-right">
                            {isUnused && (
                              <button
                                onClick={() => handleRevokePass(p.id)}
                                className="px-2 py-0.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 rounded text-[10px] transition-colors"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Pricing & Limits */}
      {activeTab === 'pricing' && (
        <form onSubmit={handleSavePricing} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 animate-fade-in max-w-2xl">
          <div>
            <h2 className="text-base font-semibold text-white">Configurable Pricing & Demo Rules</h2>
            <p className="text-xs text-slate-400 mt-1">
              Changes take effect immediately across all client payment views and limits enforcement without changing source code.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Monthly Price ($)</label>
              <input
                type="number"
                value={pricingForm.pricing_monthly_amount}
                onChange={(e) => setPricingForm({ ...pricingForm, pricing_monthly_amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Monthly Duration (Days)</label>
              <input
                type="number"
                value={pricingForm.pricing_monthly_duration}
                onChange={(e) => setPricingForm({ ...pricingForm, pricing_monthly_duration: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Yearly Price ($)</label>
              <input
                type="number"
                value={pricingForm.pricing_yearly_amount}
                onChange={(e) => setPricingForm({ ...pricingForm, pricing_yearly_amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Yearly Duration (Days)</label>
              <input
                type="number"
                value={pricingForm.pricing_yearly_duration}
                onChange={(e) => setPricingForm({ ...pricingForm, pricing_yearly_duration: parseInt(e.target.value) || 365 })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Free Demo Project Limit</label>
              <input
                type="number"
                value={pricingForm.demo_max_projects}
                onChange={(e) => setPricingForm({ ...pricingForm, demo_max_projects: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Max Upload Size (MB)</label>
              <input
                type="number"
                value={pricingForm.max_upload_size_mb}
                onChange={(e) => setPricingForm({ ...pricingForm, max_upload_size_mb: parseInt(e.target.value) || 500 })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-colors shadow-sm shadow-indigo-600/30"
          >
            Save Pricing Settings
          </button>
        </form>
      )}

      {/* Tab 7: Payment Methods & Dynamic Payment Settings */}
      {activeTab === 'paymentMethods' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 animate-fade-in max-w-4xl">
          <div>
            <div className="flex items-center gap-2 text-indigo-400">
              <CreditCard className="w-5 h-5" />
              <h2 className="text-base font-semibold text-white">Dynamic Payment Settings & Multi-Payment Gateway</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure live Easypaisa, JazzCash, Bank IBAN, PayPal/Payoneer/Card links, and pricing in USD/PKR. Changes reflect instantly in all users' Pricing Modals.
            </p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setLoading(true);
                const res = await api.owner.updatePaymentSettings(dynamicSettings);
                setDynamicSettings(res.settings);
                showNotice('Payment settings, accounts, and pricing updated successfully.');
              } catch (err: any) {
                showNotice(err.message || 'Failed to update payment settings.', true);
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-6"
          >
            {/* Section 1: Pricing ($ USD & Rs PKR) */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Plan Pricing ($ USD & Rs PKR)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Monthly Price ($ USD)</label>
                  <input
                    type="number"
                    value={dynamicSettings.pricing_monthly_usd}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, pricing_monthly_usd: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Monthly Price (Rs PKR)</label>
                  <input
                    type="number"
                    value={dynamicSettings.pricing_monthly_pkr}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, pricing_monthly_pkr: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Yearly Price ($ USD)</label>
                  <input
                    type="number"
                    value={dynamicSettings.pricing_yearly_usd}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, pricing_yearly_usd: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Yearly Price (Rs PKR)</label>
                  <input
                    type="number"
                    value={dynamicSettings.pricing_yearly_pkr}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, pricing_yearly_pkr: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Pakistani Mobile Wallets */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" /> Easypaisa & JazzCash Accounts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                  <span className="text-xs font-semibold text-emerald-400">Easypaisa</span>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={dynamicSettings.easypaisa_number}
                      onChange={(e) =>
                        setDynamicSettings({ ...dynamicSettings, easypaisa_number: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Account Title</label>
                    <input
                      type="text"
                      value={dynamicSettings.easypaisa_title}
                      onChange={(e) =>
                        setDynamicSettings({ ...dynamicSettings, easypaisa_title: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                  <span className="text-xs font-semibold text-amber-400">JazzCash</span>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={dynamicSettings.jazzcash_number}
                      onChange={(e) =>
                        setDynamicSettings({ ...dynamicSettings, jazzcash_number: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Account Title</label>
                    <input
                      type="text"
                      value={dynamicSettings.jazzcash_title}
                      onChange={(e) =>
                        setDynamicSettings({ ...dynamicSettings, jazzcash_title: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Bank Transfer Details */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" /> Bank Account Details (Meezan / HBL / Any Bank)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={dynamicSettings.bank_name}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, bank_name: e.target.value })
                    }
                    placeholder="e.g. Meezan Bank"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Account Title</label>
                  <input
                    type="text"
                    value={dynamicSettings.bank_account_title}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, bank_account_title: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={dynamicSettings.bank_account_number}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, bank_account_number: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Bank IBAN</label>
                  <input
                    type="text"
                    value={dynamicSettings.bank_iban}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, bank_iban: e.target.value })
                    }
                    placeholder="PK36MEZN..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: International Payment Info */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-purple-400" /> International Payments (PayPal, Payoneer, Visa/Mastercard)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">PayPal Email</label>
                  <input
                    type="text"
                    value={dynamicSettings.paypal_email}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, paypal_email: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Payoneer Email</label>
                  <input
                    type="text"
                    value={dynamicSettings.payoneer_email}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, payoneer_email: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Visa / Mastercard / Stripe Checkout Link
                  </label>
                  <input
                    type="text"
                    value={dynamicSettings.card_payment_link}
                    onChange={(e) =>
                      setDynamicSettings({ ...dynamicSettings, card_payment_link: e.target.value })
                    }
                    placeholder="https://buy.stripe.com/..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Section 5: Customer Instructions */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <label className="block text-[11px] font-semibold text-slate-300">
                Payment Instructions (Shown in Pricing Modal)
              </label>
              <textarea
                rows={2}
                value={dynamicSettings.instructions || ''}
                onChange={(e) =>
                  setDynamicSettings({ ...dynamicSettings, instructions: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-colors shadow-sm shadow-indigo-600/30 cursor-pointer"
            >
              Save All Payment Settings & Pricing
            </button>
          </form>
        </div>
      )}

      {/* Tab 8: App & AI Config */}
      {activeTab === 'settings' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 animate-fade-in max-w-2xl">
          <div>
            <h2 className="text-base font-semibold text-white">System & AI Integration Status</h2>
            <p className="text-xs text-slate-400 mt-1">
              Manage core identity and inspect connected speech and AI models.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold">Google Gemini AI Integration:</span>
                <span
                  className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                    appSettings?.gemini_configured ?? appSettings?.openai_configured
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {appSettings?.gemini_configured ?? appSettings?.openai_configured ? 'KEY DETECTED & ACTIVE' : 'KEY MISSING'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Primary AI provider for speech-to-text audio transcription and intelligent viral highlight detection. Server uses environment secret <code className="text-indigo-300">GEMINI_API_KEY</code>.
              </p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold">Configured Owner Email:</span>
                <span className="font-mono text-indigo-400">{appSettings?.owner_email}</span>
              </div>
              <p className="text-xs text-slate-400">
                Any login matching this email automatically receives permanent Lifetime status and full Owner authorization.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 9: Admin Management */}
      {activeTab === 'admins' && (
        <div className="space-y-6 animate-fade-in max-w-3xl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-white">Add New Administrator</h2>
            <p className="text-xs text-slate-400">
              Create an administrative account with server-enforced access to payments, users, and jobs.
            </p>

            <form onSubmit={handleCreateAdmin} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Admin Name</label>
                <input
                  type="text"
                  required
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  placeholder="e.g. Jordan Admin"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Admin Email</label>
                <input
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@aishortsmaker.com"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                />
              </div>
              <div className="sm:col-span-3 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg transition-colors"
                >
                  Create Admin Account
                </button>
              </div>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">Active Administrators ({adminsList.length})</h3>
            <div className="divide-y divide-slate-800/60 font-mono text-xs">
              {adminsList.map((a) => (
                <div key={a.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-sans font-medium text-white">{a.name}</div>
                    <div className="text-[11px] text-slate-400">{a.email}</div>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Permissions: {a.permissions?.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 10: Jobs Monitor */}
      {activeTab === 'jobs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Background Video Processing Jobs ({jobsList.length})</h2>
            <button
              onClick={() => loadDataForTab('jobs')}
              className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-mono"
            >
              <RotateCcw className="w-3 h-3" /> Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-mono">
                <tr>
                  <th className="pb-3 pr-4 font-normal">Job ID</th>
                  <th className="pb-3 pr-4 font-normal">User ID</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 pr-4 font-normal">Progress</th>
                  <th className="pb-3 pr-4 font-normal">Stage Description</th>
                  <th className="pb-3 font-normal">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {jobsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No video jobs processed yet.
                    </td>
                  </tr>
                ) : (
                  jobsList.map((j) => (
                    <tr key={j.id} className="text-slate-300 hover:bg-slate-800/30">
                      <td className="py-3 pr-4 font-bold text-white">{j.id}</td>
                      <td className="py-3 pr-4 text-slate-400 truncate max-w-[100px]">{j.user_id}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            j.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : j.status === 'FAILED'
                              ? 'bg-rose-500/10 text-rose-400'
                              : 'bg-indigo-500/10 text-indigo-400 animate-pulse'
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-bold text-indigo-400">{j.progress}%</td>
                      <td className="py-3 pr-4 text-slate-300 truncate max-w-[220px]" title={j.stage}>
                        {j.stage}
                        {j.error_message && (
                          <span className="text-rose-400 block text-[10px] truncate">{j.error_message}</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-500">
                        {new Date(j.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
