import { debugUploadsEnabled } from './debugUploads';

export type UploadDiagnosticEntry = {
  ts: string;
  level: 'info' | 'error';
  step: string;
  details?: Record<string, unknown>;
};

export type UploadDiagnosticsEnv = {
  userAgent: string;
  platform: string;
  isSecureContext: boolean;
};

const MAX_ENTRIES = 50;
const entries: UploadDiagnosticEntry[] = [];

export function diag(
  step: string,
  details?: Record<string, unknown>,
  level: 'info' | 'error' = 'info'
): void {
  if (!debugUploadsEnabled()) return;
  entries.push({
    ts: new Date().toISOString(),
    level,
    step,
    details,
  });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

export function getDiag(): UploadDiagnosticEntry[] {
  return [...entries];
}

export function getUploadDiagnosticsEnv(): UploadDiagnosticsEnv {
  if (typeof window === 'undefined') {
    return { userAgent: '', platform: '', isSecureContext: false };
  }
  return {
    userAgent: navigator?.userAgent || '',
    platform: (navigator as Navigator)?.platform || '',
    isSecureContext: window.isSecureContext ?? false,
  };
}

export function copyDiag(): string {
  const payload = {
    env: getUploadDiagnosticsEnv(),
    entries: getDiag(),
  };
  return JSON.stringify(payload, null, 2);
}
