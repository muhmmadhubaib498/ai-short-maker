import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  User,
  Subscription,
  License,
  Payment,
  FreePassCode,
  Project,
  Clip,
  Job,
  Notification,
  AppSettings,
  PaymentMethodConfig,
  DynamicPaymentSettings,
} from '../src/types';

const STORAGE_DIR = path.resolve(process.cwd(), 'storage');
const DB_FILE = path.join(STORAGE_DIR, 'database.json');
const USERS_DIR = path.join(STORAGE_DIR, 'users');
const PROCESSED_DIR = path.join(STORAGE_DIR, 'processed');

export interface DatabaseSchema {
  users: User[];
  passwords: Record<string, string>; // userId -> password_hash
  subscriptions: Subscription[];
  licenses: License[];
  payments: Payment[];
  free_pass_codes: FreePassCode[];
  projects: Project[];
  clips: Clip[];
  jobs: Job[];
  notifications: Notification[];
  admin_permissions: Record<string, string[]>; // userId -> ['users', 'payments', 'licenses', 'support', 'reports', 'jobs']
  settings: AppSettings;
}

const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: 'easypaisa_default',
    name: 'Easypaisa',
    account_number: '03103098200',
    account_title: 'AI Shorts Maker Services',
    instructions:
      'Send the exact plan amount to Easypaisa account number 03103098200. After sending, enter your Transaction ID (TRX ID from SMS or App) below and submit for review.',
    enabled: true,
    icon: 'wallet',
  },
  {
    id: 'jazzcash_default',
    name: 'JazzCash',
    account_number: '03001234567',
    account_title: 'AI Shorts Maker',
    instructions:
      'Send via JazzCash mobile account or retailer. Provide the JazzCash TID reference for instant verification.',
    enabled: true,
    icon: 'smartphone',
  },
  {
    id: 'bank_transfer_default',
    name: 'Bank Transfer (Meezan / HBL)',
    account_number: '0101-0106789123-01',
    account_title: 'AI Shorts Maker Official',
    instructions:
      'Transfer via any online banking app or ATM (IBAN: PK36MEZN0001010106789123). Enter your transaction / reference number for manual verification.',
    enabled: true,
    icon: 'building',
  },
  {
    id: 'international_default',
    name: 'International (PayPal / Card)',
    account_number: 'payments@aishortsmaker.com',
    account_title: 'AI Shorts Maker Global',
    instructions:
      'Send PayPal to payments@aishortsmaker.com or use the Card payment link. Enter your PayPal Transaction ID or receipt number below.',
    enabled: true,
    icon: 'credit-card',
  },
];

export const DEFAULT_DYNAMIC_PAYMENT_SETTINGS: DynamicPaymentSettings = {
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
};

const DEFAULT_SETTINGS: AppSettings = {
  app_name: 'AI SHORTS MAKER',
  support_email: 'support@aishortsmaker.com',
  owner_email: process.env.OWNER_EMAIL || 'muhmmadhubaib498@gmail.com',
  pricing_monthly_amount: 10,
  pricing_monthly_duration: 30,
  pricing_yearly_amount: 70,
  pricing_yearly_duration: 365,
  demo_max_projects: 1,
  demo_max_video_duration_minutes: 5,
  demo_max_clips: 3,
  max_upload_size_mb: 500,
  payment_methods: DEFAULT_PAYMENT_METHODS,
  payment_settings: DEFAULT_DYNAMIC_PAYMENT_SETTINGS,
  gemini_configured: Boolean(process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY),
  openai_configured: Boolean(process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY),
};

class Database {
  private data: DatabaseSchema;
  private isSaving = false;
  private savePending = false;

  constructor() {
    this.ensureDirectories();
    this.data = this.load();
  }

  private ensureDirectories() {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
    if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }

  private load(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        // Ensure all arrays and settings exist
        const users = (parsed.users || []).map((u) => {
          if (u.role === 'OWNER') {
            return { ...u, credits: 9999 };
          }
          const credits = typeof u.credits === 'number' ? u.credits : (u.demo_used ? 0 : 1);
          return { ...u, credits };
        });

        return {
          users,
          passwords: parsed.passwords || {},
          subscriptions: parsed.subscriptions || [],
          licenses: parsed.licenses || [],
          payments: parsed.payments || [],
          free_pass_codes: parsed.free_pass_codes || [],
          projects: parsed.projects || [],
          clips: parsed.clips || [],
          jobs: parsed.jobs || [],
          notifications: parsed.notifications || [],
          admin_permissions: parsed.admin_permissions || {},
          settings: {
            ...DEFAULT_SETTINGS,
            ...(parsed.settings || {}),
            owner_email: process.env.OWNER_EMAIL || parsed.settings?.owner_email || DEFAULT_SETTINGS.owner_email,
            gemini_configured: Boolean(process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY),
            openai_configured: Boolean(process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY),
          },
        };
      } catch (err) {
        console.error('Error loading database.json, initializing fresh store:', err);
      }
    }

    const fresh: DatabaseSchema = {
      users: [],
      passwords: {},
      subscriptions: [],
      licenses: [],
      payments: [],
      free_pass_codes: [],
      projects: [],
      clips: [],
      jobs: [],
      notifications: [],
      admin_permissions: {},
      settings: DEFAULT_SETTINGS,
    };
    this.saveSync(fresh);
    return fresh;
  }

  private writeLock: Promise<void> = Promise.resolve();

  private saveSync(state: DatabaseSchema) {
    const tempFile = `${DB_FILE}.${Date.now()}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  }

  /**
   * Safe atomic file writing with mutex locking for database.json.
   * Serializes all asynchronous writes and atomically swaps temporary files to prevent corruption.
   */
  public save(): Promise<void> {
    this.writeLock = this.writeLock
      .then(async () => {
        const payload = JSON.stringify(this.data, null, 2);
        const tempFile = `${DB_FILE}.${Date.now()}.${crypto.randomUUID()}.tmp`;
        await fs.promises.writeFile(tempFile, payload, 'utf-8');
        await fs.promises.rename(tempFile, DB_FILE);
      })
      .catch((err) => {
        console.error('Failed to save database state atomically:', err);
      });
    return this.writeLock;
  }

  // Users
  getUsers(): User[] {
    return this.data.users;
  }

  getUserById(id: string): User | undefined {
    const user = this.data.users.find((u) => u.id === id);
    if (!user) return undefined;
    if (user.role === 'OWNER') {
      user.credits = 9999;
    } else if (typeof user.credits !== 'number') {
      user.credits = user.demo_used ? 0 : 1;
    }
    return user;
  }

  getUserByEmail(email: string): User | undefined {
    const user = this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return undefined;
    if (user.role === 'OWNER') {
      user.credits = 9999;
    } else if (typeof user.credits !== 'number') {
      user.credits = user.demo_used ? 0 : 1;
    }
    return user;
  }

  getUserPasswordHash(userId: string): string | undefined {
    return this.data.passwords[userId];
  }

  setUserPasswordHash(userId: string, hash: string) {
    this.data.passwords[userId] = hash;
    this.save();
  }

  insertUser(user: User, passwordHash: string) {
    if (user.role === 'OWNER') {
      user.credits = 9999;
    } else if (typeof user.credits !== 'number') {
      user.credits = 1;
    }
    this.data.users.push(user);
    this.data.passwords[user.id] = passwordHash;
    this.save();
  }

  updateUser(id: string, updates: Partial<User>) {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      this.data.users[idx] = {
        ...this.data.users[idx],
        ...updates,
        updated_at: new Date().toISOString(),
      };
      this.save();
      return this.data.users[idx];
    }
    return undefined;
  }

  /**
   * Deleting a user triggers safe transactional cascade cleanup of orphaned
   * jobs, clips, projects, subscriptions, notifications, and payments.
   */
  deleteUser(id: string) {
    // 1. Identify all projects owned by user
    const userProjects = this.data.projects.filter((p) => p.user_id === id);
    const userProjectIds = new Set(userProjects.map((p) => p.id));

    // 2. Cascade cleanup from database state
    this.data.jobs = this.data.jobs.filter((j) => j.user_id !== id && !userProjectIds.has(j.project_id));
    this.data.clips = this.data.clips.filter((c) => c.user_id !== id && !userProjectIds.has(c.project_id));
    this.data.projects = this.data.projects.filter((p) => p.user_id !== id);
    this.data.payments = this.data.payments.filter((p) => p.user_id !== id);
    this.data.subscriptions = this.data.subscriptions.filter((s) => s.user_id !== id);
    this.data.notifications = this.data.notifications.filter((n) => n.user_id !== id);

    delete this.data.passwords[id];
    delete this.data.admin_permissions[id];
    this.data.users = this.data.users.filter((u) => u.id !== id);

    // 3. Atomically persist updated database
    this.save();

    // 4. Safe filesystem cleanup for user's storage directory
    const userDir = path.join(USERS_DIR, id);
    if (fs.existsSync(userDir)) {
      try {
        fs.rmSync(userDir, { recursive: true, force: true });
      } catch (rmErr) {
        console.warn(`[Cascade Cleanup] Could not remove storage directory for user ${id}:`, rmErr);
      }
    }
  }

  // Subscriptions
  getSubscriptions(): Subscription[] {
    return this.data.subscriptions;
  }

  getSubscriptionByUserId(userId: string): Subscription | undefined {
    return this.data.subscriptions.find((s) => s.user_id === userId);
  }

  insertSubscription(sub: Subscription) {
    const existingIdx = this.data.subscriptions.findIndex((s) => s.user_id === sub.user_id);
    if (existingIdx !== -1) {
      this.data.subscriptions[existingIdx] = sub;
    } else {
      this.data.subscriptions.push(sub);
    }
    this.save();
  }

  updateSubscription(id: string, updates: Partial<Subscription>) {
    const idx = this.data.subscriptions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.data.subscriptions[idx] = { ...this.data.subscriptions[idx], ...updates };
      this.save();
      return this.data.subscriptions[idx];
    }
    return undefined;
  }

  // Licenses
  getLicenses(): License[] {
    return this.data.licenses;
  }

  getLicenseById(id: string): License | undefined {
    return this.data.licenses.find((l) => l.id === id);
  }

  getLicenseByUserId(userId: string): License | undefined {
    return this.data.licenses.find((l) => l.user_id === userId && l.status === 'ACTIVE');
  }

  getLicenseByKey(key: string): License | undefined {
    const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return this.data.licenses.find(
      (l) =>
        l.license_key.trim().toUpperCase() === key.trim().toUpperCase() ||
        l.license_key.replace(/[^A-Z0-9]/g, '').toUpperCase() === cleanKey
    );
  }

  insertLicense(license: License) {
    this.data.licenses.push(license);
    this.save();
  }

  updateLicense(id: string, updates: Partial<License>) {
    const idx = this.data.licenses.findIndex((l) => l.id === id);
    if (idx !== -1) {
      this.data.licenses[idx] = { ...this.data.licenses[idx], ...updates };
      this.save();
      return this.data.licenses[idx];
    }
    return undefined;
  }

  deleteLicense(id: string): boolean {
    const idx = this.data.licenses.findIndex((l) => l.id === id);
    if (idx !== -1) {
      this.data.licenses.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  // Payments
  getPayments(): Payment[] {
    return this.data.payments;
  }

  getPaymentById(id: string): Payment | undefined {
    return this.data.payments.find((p) => p.id === id);
  }

  getPaymentsByUserId(userId: string): Payment[] {
    return this.data.payments.filter((p) => p.user_id === userId);
  }

  insertPayment(payment: Payment) {
    this.data.payments.unshift(payment);
    this.save();
  }

  updatePayment(id: string, updates: Partial<Payment>) {
    const idx = this.data.payments.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.data.payments[idx] = { ...this.data.payments[idx], ...updates };
      this.save();
      return this.data.payments[idx];
    }
    return undefined;
  }

  // Free Pass Codes
  getFreePassCodes(): FreePassCode[] {
    return this.data.free_pass_codes;
  }

  getFreePassCode(code: string): FreePassCode | undefined {
    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return this.data.free_pass_codes.find(
      (c) =>
        c.code.trim().toUpperCase() === code.trim().toUpperCase() ||
        c.code.replace(/[^A-Z0-9]/g, '').toUpperCase() === cleanCode
    );
  }

  insertFreePassCodes(codes: FreePassCode[]) {
    this.data.free_pass_codes.unshift(...codes);
    this.save();
  }

  updateFreePassCode(id: string, updates: Partial<FreePassCode>) {
    const idx = this.data.free_pass_codes.findIndex((c) => c.id === id);
    if (idx !== -1) {
      this.data.free_pass_codes[idx] = { ...this.data.free_pass_codes[idx], ...updates };
      this.save();
      return this.data.free_pass_codes[idx];
    }
    return undefined;
  }

  // Projects
  getProjects(): Project[] {
    return this.data.projects;
  }

  getProjectsByUserId(userId: string): Project[] {
    return this.data.projects.filter((p) => p.user_id === userId);
  }

  getProjectById(id: string): Project | undefined {
    return this.data.projects.find((p) => p.id === id);
  }

  insertProject(project: Project) {
    this.data.projects.unshift(project);
    this.save();
  }

  updateProject(id: string, updates: Partial<Project>) {
    const idx = this.data.projects.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.data.projects[idx] = {
        ...this.data.projects[idx],
        ...updates,
        updated_at: new Date().toISOString(),
      };
      this.save();
      return this.data.projects[idx];
    }
    return undefined;
  }

  deleteProject(id: string) {
    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    this.data.clips = this.data.clips.filter((c) => c.project_id !== id);
    this.data.jobs = this.data.jobs.filter((j) => j.project_id !== id);
    this.save();
  }

  // Clips
  getClips(): Clip[] {
    return this.data.clips;
  }

  getClipsByProjectId(projectId: string): Clip[] {
    return this.data.clips.filter((c) => c.project_id === projectId);
  }

  getClipsByUserId(userId: string): Clip[] {
    return this.data.clips.filter((c) => c.user_id === userId);
  }

  getClipById(id: string): Clip | undefined {
    return this.data.clips.find((c) => c.id === id);
  }

  insertClips(clips: Clip[]) {
    this.data.clips.push(...clips);
    this.save();
  }

  updateClip(id: string, updates: Partial<Clip>) {
    const idx = this.data.clips.findIndex((c) => c.id === id);
    if (idx !== -1) {
      this.data.clips[idx] = { ...this.data.clips[idx], ...updates };
      this.save();
      return this.data.clips[idx];
    }
    return undefined;
  }

  deleteClip(id: string) {
    this.data.clips = this.data.clips.filter((c) => c.id !== id);
    this.save();
  }

  // Jobs
  getJobs(): Job[] {
    return this.data.jobs;
  }

  getJobById(id: string): Job | undefined {
    return this.data.jobs.find((j) => j.id === id);
  }

  getJobByProjectId(projectId: string): Job | undefined {
    return this.data.jobs.find((j) => j.project_id === projectId);
  }

  insertJob(job: Job) {
    this.data.jobs.unshift(job);
    this.save();
  }

  updateJob(id: string, updates: Partial<Job>) {
    const idx = this.data.jobs.findIndex((j) => j.id === id);
    if (idx !== -1) {
      this.data.jobs[idx] = {
        ...this.data.jobs[idx],
        ...updates,
        updated_at: new Date().toISOString(),
      };
      this.save();
      return this.data.jobs[idx];
    }
    return undefined;
  }

  // Notifications
  getNotifications(userId: string): Notification[] {
    return this.data.notifications.filter((n) => n.user_id === userId);
  }

  insertNotification(notification: Notification) {
    this.data.notifications.unshift(notification);
    this.save();
  }

  markNotificationRead(id: string, userId: string) {
    const idx = this.data.notifications.findIndex((n) => n.id === id && n.user_id === userId);
    if (idx !== -1) {
      this.data.notifications[idx].read = true;
      this.save();
    }
  }

  markAllNotificationsRead(userId: string) {
    for (const notif of this.data.notifications) {
      if (notif.user_id === userId) {
        notif.read = true;
      }
    }
    this.save();
  }

  // Settings
  getSettings(): AppSettings {
    const isGeminiSet = Boolean(process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY);
    return {
      ...this.data.settings,
      payment_settings: {
        ...DEFAULT_DYNAMIC_PAYMENT_SETTINGS,
        ...(this.data.settings.payment_settings || {}),
      },
      gemini_configured: isGeminiSet,
      openai_configured: isGeminiSet,
    };
  }

  updateSettings(updates: Partial<AppSettings>) {
    const isGeminiSet = Boolean(process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY);
    this.data.settings = {
      ...this.data.settings,
      ...updates,
      gemini_configured: isGeminiSet,
      openai_configured: isGeminiSet,
    };
    this.save();
    return this.getSettings();
  }

  getPaymentSettings(): DynamicPaymentSettings {
    return {
      ...DEFAULT_DYNAMIC_PAYMENT_SETTINGS,
      ...(this.data.settings.payment_settings || {}),
      pricing_monthly_usd: this.data.settings.payment_settings?.pricing_monthly_usd || this.data.settings.pricing_monthly_amount || 10,
      pricing_yearly_usd: this.data.settings.payment_settings?.pricing_yearly_usd || this.data.settings.pricing_yearly_amount || 70,
    };
  }

  updatePaymentSettings(updates: Partial<DynamicPaymentSettings>): DynamicPaymentSettings {
    const current = this.getPaymentSettings();
    const updated: DynamicPaymentSettings = {
      ...current,
      ...updates,
    };

    // Keep top-level pricing amounts synchronized
    if (updates.pricing_monthly_usd !== undefined) {
      this.data.settings.pricing_monthly_amount = updates.pricing_monthly_usd;
    }
    if (updates.pricing_yearly_usd !== undefined) {
      this.data.settings.pricing_yearly_amount = updates.pricing_yearly_usd;
    }

    // Keep payment_methods array in sync with dynamic settings
    const methods = this.data.settings.payment_methods || [];
    for (const m of methods) {
      if (m.id.includes('easypaisa') || m.name.toLowerCase().includes('easypaisa')) {
        if (updated.easypaisa_number) m.account_number = updated.easypaisa_number;
        if (updated.easypaisa_title) m.account_title = updated.easypaisa_title;
        m.instructions = `Send to Easypaisa ${updated.easypaisa_number} (${updated.easypaisa_title}). Enter your TRX ID below.`;
      } else if (m.id.includes('jazzcash') || m.name.toLowerCase().includes('jazzcash')) {
        if (updated.jazzcash_number) m.account_number = updated.jazzcash_number;
        if (updated.jazzcash_title) m.account_title = updated.jazzcash_title;
        m.instructions = `Send to JazzCash ${updated.jazzcash_number} (${updated.jazzcash_title}). Enter your TID reference below.`;
      } else if (m.id.includes('bank') || m.name.toLowerCase().includes('bank')) {
        if (updated.bank_account_number) m.account_number = updated.bank_account_number;
        if (updated.bank_account_title) m.account_title = updated.bank_account_title;
        if (updated.bank_name) m.name = `Bank Transfer (${updated.bank_name})`;
        if (updated.bank_iban) {
          m.instructions = `Transfer via online banking or ATM (IBAN: ${updated.bank_iban}). Enter your transaction reference number.`;
        }
      } else if (m.id.includes('international') || m.name.toLowerCase().includes('international')) {
        if (updated.paypal_email) m.account_number = updated.paypal_email;
        if (updated.payoneer_email || updated.card_payment_link) {
          m.instructions = `PayPal: ${updated.paypal_email || 'N/A'} | Payoneer: ${updated.payoneer_email || 'N/A'}. Enter your PayPal transaction ID.`;
        }
      }
    }

    this.data.settings.payment_settings = updated;
    this.save();
    return updated;
  }

  // Admin Permissions
  getAdminPermissions(userId: string): string[] {
    return this.data.admin_permissions[userId] || ['users', 'payments', 'licenses', 'support', 'reports', 'jobs'];
  }

  setAdminPermissions(userId: string, permissions: string[]) {
    this.data.admin_permissions[userId] = permissions;
    this.save();
  }
}

export const db = new Database();
