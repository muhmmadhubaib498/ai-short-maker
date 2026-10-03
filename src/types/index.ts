export type UserRole = 'OWNER' | 'ADMIN' | 'USER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export type PlanType = 'FREE_DEMO' | 'MONTHLY' | 'YEARLY' | 'OWNER_LIFETIME';
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export type LicenseType = 'PURCHASED' | 'FRIEND_PASS';
export type LicenseStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'PENDING';

export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type FreePassStatus = 'UNUSED' | 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export type ProjectStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type JobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'TRANSCRIBING'
  | 'ANALYZING'
  | 'GENERATING_CLIPS'
  | 'ADDING_CAPTIONS'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'FAILED';

export type AspectRatio = '9:16' | '16:9' | '1:1';
export type CaptionStyle = 'clean' | 'bold' | 'modern' | 'highlight' | 'minimal';
export type CaptionPosition = 'bottom' | 'middle' | 'top';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  demo_used: boolean;
  credits?: number;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: PlanType;
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string | null;
}

export interface License {
  id: string;
  license_key: string;
  user_id: string;
  plan: PlanType;
  license_type: LicenseType;
  status: LicenseStatus;
  duration_days?: number;
  created_at: string;
  activated_at: string;
  expires_at: string | null;
  payment_id: string | null;
}

export interface PaymentMethodConfig {
  id: string;
  name: string;
  account_number: string;
  account_title: string;
  instructions: string;
  enabled: boolean;
  icon?: string;
}

export interface Payment {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  plan: PlanType;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_id: string;
  status: PaymentStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
}

export interface FreePassCode {
  id: string;
  code: string;
  type: string;
  status: FreePassStatus;
  created_by: string;
  created_at: string;
  redeemed_by: string | null;
  redeemed_by_email?: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface ProjectSettings {
  aspectRatio: AspectRatio;
  captionStyle: CaptionStyle;
  captionPosition: CaptionPosition;
  captionSize: 'small' | 'medium' | 'large';
  captionsEnabled: boolean;
  promptPreset: string;
  customPrompt?: string;
  targetDuration: string; // e.g. '30-60s', '1-2m', '2-3m', 'custom'
  clipCount: number;
  language: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  original_filename: string;
  file_path: string;
  duration: number;
  status: ProjectStatus;
  settings: ProjectSettings;
  transcript: TranscriptSegment[] | null;
  created_at: string;
  updated_at: string;
}

export interface Clip {
  id: string;
  project_id: string;
  user_id: string;
  clip_number: number;
  title: string;
  file_path: string;
  filename?: string;
  thumbnail_path?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration: number;
  start_time: number;
  end_time: number;
  aspect_ratio: AspectRatio;
  caption_status: boolean;
  caption_style: CaptionStyle;
  caption_position: CaptionPosition;
  caption_size: 'small' | 'medium' | 'large';
  transcript_snippet: string;
  hook?: string;
  hook_score?: number;
  story_score?: number;
  engagement_score?: number;
  score?: number;
  created_at: string;
}

export interface Job {
  id: string;
  user_id: string;
  project_id: string;
  job_type: string;
  status: JobStatus;
  progress: number;
  stage: string;
  error_message: string | null;
  credit_deducted?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  created_at: string;
}

export interface DynamicPaymentSettings {
  pricing_monthly_usd: number;
  pricing_monthly_pkr: number;
  pricing_yearly_usd: number;
  pricing_yearly_pkr: number;
  pricing_monthly_duration: number;
  pricing_yearly_duration: number;
  // Easypaisa & JazzCash
  easypaisa_number: string;
  easypaisa_title: string;
  jazzcash_number: string;
  jazzcash_title: string;
  // Bank details
  bank_name: string;
  bank_account_title: string;
  bank_account_number: string;
  bank_iban: string;
  // International payment details
  paypal_email: string;
  payoneer_email: string;
  card_payment_link: string; // Stripe / Visa / Mastercard link
  instructions?: string;
}

export interface AppSettings {
  app_name: string;
  support_email: string;
  owner_email: string;
  pricing_monthly_amount: number;
  pricing_monthly_duration: number;
  pricing_yearly_amount: number;
  pricing_yearly_duration: number;
  demo_max_projects: number;
  demo_max_video_duration_minutes: number;
  demo_max_clips: number;
  max_upload_size_mb: number;
  payment_methods: PaymentMethodConfig[];
  payment_settings?: DynamicPaymentSettings;
  gemini_configured?: boolean;
  openai_configured?: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
  subscription: Subscription | null;
  license: License | null;
}
