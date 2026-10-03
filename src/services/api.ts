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
  AuthResponse,
} from '../types';

const TOKEN_KEY = 'ai_shorts_auth_token';

export interface ApiRequestOptions extends RequestInit {
  noRetry?: boolean;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const isGet = !options.method || options.method.toUpperCase() === 'GET';

  // DISABLE RETRIES FOR POLLING ENDPOINTS: Prevents catastrophic request storms
  const isPollingEndpoint =
    Boolean(options.noRetry) ||
    endpoint.includes('/job') ||
    endpoint.includes('/events') ||
    endpoint.includes('/notifications');

  const MAX_RETRIES = isPollingEndpoint ? 1 : (isGet ? 3 : 2);
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const res = await fetch(endpoint, {
        ...options,
        headers,
      });

      // Transient gateway drops (502/503/504) -> auto retry silently only on non-polling requests
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.min(3000, attempt * 1000)));
        continue;
      }

      const contentType = res.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const errorMsg = isJson && data?.error ? data.error : typeof data === 'string' ? data : 'Request failed';
        const err: any = new Error(errorMsg);
        err.status = res.status;
        err.code = data?.code;

        if (res.status === 402 || data?.code === 'FREE_LIMIT_REACHED') {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('open-pricing-modal', { detail: { reason: 'limit_reached' } })
            );
          }
        }

        throw err;
      }

      return data as T;
    } catch (err: any) {
      // Never loop on client validation or auth errors (400, 401, 403, 404, 409) or if retries disabled
      if (isPollingEndpoint || (err.status && err.status >= 400 && err.status < 500)) {
        throw err;
      }

      const isNetworkError =
        !err.status ||
        err.name === 'TypeError' ||
        String(err.message || '').toLowerCase().includes('failed to fetch') ||
        String(err.message || '').toLowerCase().includes('network') ||
        String(err.message || '').toLowerCase().includes('aborted');

      if (isNetworkError && attempt < MAX_RETRIES) {
        const delay = Math.min(4000, attempt * 1000 + Math.random() * 400);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Connection temporarily unstable. Retrying in background...');
}

export const api = {
  // Auth
  signup: (data: { name: string; email: string; password: string }) =>
    request<AuthResponse>('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  firebaseLogin: (data: { idToken?: string; uid: string; email: string; name: string }) =>
    request<AuthResponse>('/api/auth/firebase-login', { method: 'POST', body: JSON.stringify(data) }),

  getMe: () =>
    request<{ user: User; subscription: Subscription | null; license: License | null; unreadNotifications: number }>(
      '/api/auth/me'
    ),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Projects
  uploadProject: (
    formData: FormData,
    onProgress?: (progress: { loaded: number; total: number; percent: number; stage: string; statusText: string }) => void
  ): Promise<{ project: Project; job: Job }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const token = getStoredToken();

      // 15-minute timeout for large video uploads
      xhr.timeout = 15 * 60 * 1000;

      xhr.open('POST', '/api/projects/upload', true);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      // Real Byte-by-Byte Upload Progress
      if (xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            // Bytes uploading to server counts for 0% - 90%
            const rawPercent = (event.loaded / event.total);
            const calculatedPercent = Math.min(90, Math.max(5, Math.round(rawPercent * 90)));
            const mbLoaded = (event.loaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (event.total / (1024 * 1024)).toFixed(1);
            const statusText = `Uploading video: ${mbLoaded}MB / ${mbTotal}MB (${calculatedPercent}%)`;

            onProgress?.({
              loaded: event.loaded,
              total: event.total,
              percent: calculatedPercent,
              stage: 'uploading',
              statusText,
            });
          } else {
            onProgress?.({
              loaded: event.loaded,
              total: event.total,
              percent: 50,
              stage: 'uploading',
              statusText: 'Uploading video to server...',
            });
          }
        };

        xhr.upload.onload = () => {
          onProgress?.({
            loaded: 1,
            total: 1,
            percent: 92,
            stage: 'processing',
            statusText: 'Video received. Probing formats and creating project...',
          });
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            onProgress?.({
              loaded: 1,
              total: 1,
              percent: 100,
              stage: 'done',
              statusText: 'Upload completed! Directing to project monitor...',
            });
            resolve(data);
          } catch (e) {
            reject(new Error('Invalid response received from server.'));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.error || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(xhr.responseText || `Upload failed with HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error occurred while uploading video. Please check your internet connection and retry.'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Upload timed out after 15 minutes. Please try a smaller video or check your connection speed.'));
      };

      xhr.onabort = () => {
        reject(new Error('Upload was aborted.'));
      };

      xhr.send(formData);
    });
  },

  createProjectFromStorage: (data: {
    storageUrl: string;
    storagePath?: string;
    originalFilename: string;
    fileSize: number;
    projectName: string;
    aspectRatio: string;
    captionStyle: string;
    captionPosition: string;
    captionSize: string;
    captionsEnabled: boolean;
    promptPreset: string;
    customPrompt: string;
    targetDuration: string;
    clipCount: number;
    language: string;
  }) =>
    request<{ project: Project; job: Job }>('/api/projects/create-from-storage', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getProjects: () => request<{ projects: Project[] }>('/api/projects'),

  getProject: (id: string) => request<{ project: Project; clips: Clip[]; job: Job | null }>(`/api/projects/${id}`),

  getProjectJob: (id: string) => request<{ job: Job | null }>(`/api/projects/${id}/job`, { noRetry: true }),

  retryProject: (id: string) =>
    request<{ success: boolean; project: Project; job: Job }>(`/api/projects/${id}/retry`, { method: 'POST' }),

  deleteProject: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/projects/${id}`, { method: 'DELETE' }),

  getZipDownloadUrl: (projectId: string) => {
    const token = getStoredToken();
    return `/api/projects/${projectId}/download-zip${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  // Clips
  getClips: () => request<{ clips: Clip[] }>('/api/clips'),

  getClip: (id: string) => request<{ clip: Clip }>(`/api/clips/${id}`),

  updateClip: (id: string, updates: Partial<Clip> & { reprocess?: boolean }) =>
    request<{ clip: Clip; message: string }>(`/api/clips/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteClip: (id: string) => request<{ success: boolean; message: string }>(`/api/clips/${id}`, { method: 'DELETE' }),

  getClipDownloadUrl: (clipId: string) => {
    const token = getStoredToken();
    return `/api/clips/${clipId}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  getMediaUrl: (filePathOrUrl?: string) => {
    if (!filePathOrUrl) return '';
    if (filePathOrUrl.startsWith('blob:')) {
      return filePathOrUrl;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    let url = filePathOrUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const clean = url.replace(/\\/g, '/');
      const parts = clean.split('/storage/users/');
      if (parts.length > 1) {
        url = `${origin}/output/users/${parts[1]}`;
      } else {
        const outputParts = clean.split('/output/');
        if (outputParts.length > 1) {
          url = `${origin}/output/${outputParts[1]}`;
        } else if (clean.startsWith('/')) {
          url = `${origin}${clean}`;
        } else {
          const fileName = clean.split('/').pop() || clean;
          url = `${origin}/api/media/${fileName}`;
        }
      }
    }
    const token = getStoredToken();
    if (token && !url.startsWith('blob:')) {
      const sep = url.includes('?') ? '&' : '?';
      if (!url.includes('token=')) {
        url = `${url}${sep}token=${encodeURIComponent(token)}`;
      }
    }
    return url;
  },

  getThumbnailUrl: (clip: Clip) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    let url = '';
    if (clip.thumbnailUrl) {
      if (clip.thumbnailUrl.startsWith('http://') || clip.thumbnailUrl.startsWith('https://') || clip.thumbnailUrl.startsWith('blob:')) {
        url = clip.thumbnailUrl;
      } else {
        url = `${origin}${clip.thumbnailUrl.startsWith('/') ? '' : '/'}${clip.thumbnailUrl}`;
      }
    } else if (clip.thumbnail_path) {
      const clean = clip.thumbnail_path.replace(/\\/g, '/');
      const parts = clean.split('/storage/users/');
      if (parts.length > 1) {
        url = `${origin}/output/users/${parts[1]}`;
      } else {
        url = `${origin}/output/clip-${clip.clip_number}.jpg`;
      }
    } else {
      url = `${origin}/output/clip-${clip.clip_number}.jpg`;
    }
    const token = getStoredToken();
    if (token && !url.startsWith('blob:')) {
      const sep = url.includes('?') ? '&' : '?';
      if (!url.includes('token=')) {
        url = `${url}${sep}token=${encodeURIComponent(token)}`;
      }
    }
    return url;
  },

  // Payments
  getPaymentSettings: () =>
    request<{ settings: DynamicPaymentSettings; methods: PaymentMethodConfig[] }>('/api/payments/settings'),

  getPaymentMethods: () => request<{ methods: PaymentMethodConfig[] }>('/api/payments/methods'),

  getMyPayments: () => request<{ payments: Payment[] }>('/api/payments/my'),

  submitPayment: (data: { plan: string; payment_method: string; transaction_id: string }) =>
    request<{ payment: Payment; message: string }>('/api/payments/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Licenses
  getMyLicense: () =>
    request<{ license: License | null; subscription: Subscription | null }>('/api/licenses/my'),

  redeemCode: (code: string) =>
    request<{ success: boolean; message: string; subscription?: Subscription; license?: License }>(
      '/api/licenses/redeem',
      {
        method: 'POST',
        body: JSON.stringify({ code }),
      }
    ),

  // Notifications
  getNotifications: () => request<{ notifications: Notification[] }>('/api/notifications'),

  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  markAllNotificationsRead: () => request<{ success: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  // Owner APIs
  owner: {
    getMetrics: () => request<{ metrics: any; recentUsers: User[]; recentPayments: Payment[]; recentJobs: Job[] }>('/api/owner/metrics'),

    getUsers: () => request<{ users: (User & { subscription: Subscription | null; license: License | null })[] }>('/api/owner/users'),

    updateUser: (id: string, updates: any) =>
      request<{ user: User; message: string }>(`/api/owner/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),

    deleteUser: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/owner/users/${id}`, { method: 'DELETE' }),

    getPayments: () => request<{ payments: Payment[] }>('/api/owner/payments'),

    approvePayment: (id: string) =>
      request<{ payment: Payment; license: License; subscription: Subscription; message: string }>(
        `/api/owner/payments/${id}/approve`,
        { method: 'POST' }
      ),

    rejectPayment: (id: string, rejection_reason: string) =>
      request<{ payment: Payment; message: string }>(`/api/owner/payments/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason }),
      }),

    getLicenses: () => request<{ licenses: License[] }>('/api/owner/licenses'),

    updateLicense: (id: string, updates: any) =>
      request<{ license: License; message: string }>(`/api/owner/licenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),

    generateFreePasses: (quantity: number) =>
      request<{ codes: FreePassCode[]; message: string }>('/api/owner/free-passes/generate', {
        method: 'POST',
        body: JSON.stringify({ quantity }),
      }),

    getFreePasses: () => request<{ codes: FreePassCode[] }>('/api/owner/free-passes'),

    revokeFreePass: (id: string) =>
      request<{ code: FreePassCode; message: string }>(`/api/owner/free-passes/${id}/revoke`, {
        method: 'POST',
      }),

    getPricing: () => request<any>('/api/owner/pricing'),

    updatePricing: (data: any) =>
      request<{ settings: any; message: string }>('/api/owner/pricing', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getPaymentSettings: () => request<{ settings: DynamicPaymentSettings }>('/api/owner/payment-settings'),

    updatePaymentSettings: (data: Partial<DynamicPaymentSettings>) =>
      request<{ settings: DynamicPaymentSettings; message: string }>('/api/owner/payment-settings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    generateLicense: (data: { plan?: string; duration_days?: number }) =>
      request<{ license: License; message: string }>('/api/owner/licenses/generate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    deleteLicense: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/owner/licenses/${id}`, {
        method: 'DELETE',
      }),

    revokeLicense: (id: string) =>
      request<{ success: boolean; license: License; message: string }>(`/api/owner/licenses/${id}/revoke`, {
        method: 'POST',
      }),

    getPaymentMethods: () => request<{ methods: PaymentMethodConfig[] }>('/api/owner/payment-methods'),

    updatePaymentMethods: (methods: PaymentMethodConfig[]) =>
      request<{ methods: PaymentMethodConfig[]; message: string }>('/api/owner/payment-methods', {
        method: 'POST',
        body: JSON.stringify({ methods }),
      }),

    getSettings: () => request<{ settings: AppSettings }>('/api/owner/settings'),

    updateSettings: (data: any) =>
      request<{ settings: AppSettings; message: string }>('/api/owner/settings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getAdmins: () => request<{ admins: any[] }>('/api/owner/admins'),

    createAdmin: (data: any) =>
      request<{ admin: any; message: string }>('/api/owner/admins', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getJobs: () => request<{ jobs: Job[] }>('/api/owner/jobs'),
  },

  // Health
  getHealth: () => request<{ status: string; app_name: string; gemini_configured?: boolean; openai_configured?: boolean; time: string }>('/api/health'),
};

export { chunkUploadService } from './chunkUploadService';
