import { debugUploadsEnabled } from './debugUploads';

export type UploadTraceEntry = {
  ts: string;
  step: string;
  details?: Record<string, unknown>;
};

const MAX_TRACE_ENTRIES = 50;
const traceEntries: UploadTraceEntry[] = [];

export function trace(step: string, details?: Record<string, unknown>): void {
  if (!debugUploadsEnabled()) return;
  traceEntries.push({
    ts: new Date().toISOString(),
    step,
    details,
  });
  if (traceEntries.length > MAX_TRACE_ENTRIES) {
    traceEntries.splice(0, traceEntries.length - MAX_TRACE_ENTRIES);
  }
}

export function getTrace(): UploadTraceEntry[] {
  return [...traceEntries];
}
