import { truncate } from './debugUploads';

export type ReadinessResult =
  | { ok: true }
  | { ok: false; code: string; message: string; debug?: string };

const PLACEHOLDER_MESSAGE =
  "This file isn\u2019t available locally yet (common with iCloud placeholders). Download it to your device and try again.";

export async function probeFileReadable(file: File): Promise<ReadinessResult> {
  if (!file) {
    return { ok: false, code: 'FILE_MISSING', message: 'No file selected.' };
  }
  if (file.size === 0) {
    return {
      ok: false,
      code: 'FILE_SIZE_ZERO',
      message: PLACEHOLDER_MESSAGE,
      debug: `name=${file.name} type=${file.type || '(empty)'}`,
    };
  }
  try {
    const buf = await file.slice(0, 32).arrayBuffer();
    if (buf.byteLength === 0) {
      return {
        ok: false,
        code: 'FILE_READ_EMPTY',
        message: PLACEHOLDER_MESSAGE,
        debug: `name=${file.name} size=${file.size}`,
      };
    }
  } catch (err) {
    const errorName = err instanceof Error ? err.name : 'Error';
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'FILE_READ_THROW',
      message: PLACEHOLDER_MESSAGE,
      debug: truncate(`${errorName}: ${errorMessage}`),
    };
  }
  return { ok: true };
}
