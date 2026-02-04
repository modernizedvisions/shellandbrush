import { debugUploadsEnabled } from './debugUploads';

export type UploadAttempt = {
  requestId: string;
  timestamp: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  requestPath: string;
  requestUrl: string;
  adminHeaderAttached: boolean;
  responseStatus?: number | null;
  responseText?: string | null;
  errorName?: string | null;
  errorMessage?: string | null;
  preflight?: {
    attempted: boolean;
    status?: number | null;
    ok?: boolean | null;
    responseText?: string | null;
    error?: string | null;
  };
};

export type AdminAuthSnapshot = {
  timestamp: string;
  urlPath: string;
  method: string;
  adminHeaderAttached: boolean;
  origin: string;
  host: string;
};

const MAX_UPLOAD_ATTEMPTS = 30;
const MAX_AUTH_SNAPSHOTS = 50;

let uploadAttempts: UploadAttempt[] = [];
let authSnapshots: AdminAuthSnapshot[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

export function subscribeUploadAttempts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordUploadAttempt(attempt: UploadAttempt): void {
  if (!debugUploadsEnabled()) return;
  uploadAttempts = [...uploadAttempts, attempt].slice(-MAX_UPLOAD_ATTEMPTS);
  emit();
}

export function getUploadAttempts(): UploadAttempt[] {
  return uploadAttempts;
}

export function clearUploadAttempts(): void {
  uploadAttempts = [];
  emit();
}

export function recordAdminAuthSnapshot(snapshot: AdminAuthSnapshot): void {
  if (!debugUploadsEnabled()) return;
  authSnapshots = [...authSnapshots, snapshot].slice(-MAX_AUTH_SNAPSHOTS);
  emit();
}

export function getAdminAuthSnapshots(): AdminAuthSnapshot[] {
  return authSnapshots;
}

export function getLatestAdminAuthSnapshot(): AdminAuthSnapshot | null {
  return authSnapshots.length ? authSnapshots[authSnapshots.length - 1] : null;
}
