import React, { useEffect, useMemo, useState } from 'react';
import { debugUploadsEnabled, isWwwHost, truncate } from '../../lib/debugUploads';
import { getAdminAuthStatus, getAdminPasswordLengthSafe, hasAdminPasswordInStorage } from '../../lib/adminAuth';
import {
  getUploadAttempts,
  subscribeUploadAttempts,
  clearUploadAttempts,
  getLatestAdminAuthSnapshot,
} from '../../lib/uploadDebugStore';
import type { AdminAuthStatus } from '../../lib/adminAuth';

export const AdminUploadDiagnosticsPanel: React.FC = () => {
  const debugEnabled = debugUploadsEnabled();
  const [collapsed, setCollapsed] = useState(true);
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [authStatusError, setAuthStatusError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(getUploadAttempts());
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (!debugEnabled) return;
    const unsubscribe = subscribeUploadAttempts(() => {
      setAttempts(getUploadAttempts());
    });
    setAttempts(getUploadAttempts());
    return unsubscribe;
  }, [debugEnabled]);

  useEffect(() => {
    if (!debugEnabled) return;
    let active = true;
    const load = async () => {
      try {
        const status = await getAdminAuthStatus();
        if (!active) return;
        setAuthStatus(status);
        setAuthStatusError(null);
      } catch (err) {
        if (!active) return;
        setAuthStatus(null);
        setAuthStatusError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [debugEnabled]);

  const clientInfo = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        origin: '',
        host: '',
        isWwwHost: false,
        userAgent: '',
        platform: '',
        isSecureContext: false,
      };
    }
    const nav = window.navigator;
    const platform =
      (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      nav.platform ||
      '';
    return {
      origin: window.location.origin,
      host: window.location.host,
      isWwwHost: isWwwHost(window.location.host),
      userAgent: nav.userAgent,
      platform,
      isSecureContext: window.isSecureContext,
    };
  }, []);

  const storageInfo = (() => {
    let localStorageAvailable = false;
    try {
      const key = '__sb_upload_debug__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      localStorageAvailable = true;
    } catch {
      localStorageAvailable = false;
    }
    const adminPasswordLength = getAdminPasswordLengthSafe();
    return {
      localStorageAvailable,
      adminPasswordPresent: hasAdminPasswordInStorage(),
      adminPasswordLength,
    };
  })();

  if (!debugEnabled) return null;

  const latestAuthSnapshot = getLatestAdminAuthSnapshot();

  const diagnosticsPayload = {
    timestamp: new Date().toISOString(),
    client: clientInfo,
    storage: storageInfo,
    adminAuthStatus: authStatus
      ? {
          envHasAdminPassword: authStatus.envHasAdminPassword,
          headerHasPassword: authStatus.headerHasPassword,
          matches: authStatus.matches,
          envAdminPasswordLength: authStatus.envAdminPasswordLength,
          headerPasswordLength: authStatus.headerPasswordLength,
          status: authStatus.status,
        }
      : null,
    adminAuthStatusError: authStatusError,
    latestAdminAuthSnapshot: latestAuthSnapshot,
    uploadAttempts: attempts,
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnosticsPayload, null, 2));
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold">Upload Diagnostics (Debug)</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy Failed' : 'Copy Diagnostics'}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-4">
          <section className="space-y-1">
            <div className="font-semibold">Client Environment</div>
            <div>origin: {clientInfo.origin}</div>
            <div>host: {clientInfo.host}</div>
            <div>isWwwHost: {String(clientInfo.isWwwHost)}</div>
            <div>userAgent: {clientInfo.userAgent}</div>
            <div>platform: {clientInfo.platform}</div>
            <div>isSecureContext: {String(clientInfo.isSecureContext)}</div>
          </section>

          <section className="space-y-1">
            <div className="font-semibold">Storage/Auth Snapshot</div>
            <div>localStorageAvailable: {String(storageInfo.localStorageAvailable)}</div>
            <div>adminPasswordPresent: {String(storageInfo.adminPasswordPresent)}</div>
            <div>adminPasswordLength: {storageInfo.adminPasswordLength}</div>
            {authStatus ? (
              <>
                <div>envHasAdminPassword: {String(authStatus.envHasAdminPassword)}</div>
                <div>headerHasPassword: {String(authStatus.headerHasPassword)}</div>
                <div>matches: {String(authStatus.matches)}</div>
                <div>envAdminPasswordLength: {authStatus.envAdminPasswordLength}</div>
                <div>headerPasswordLength: {authStatus.headerPasswordLength}</div>
              </>
            ) : (
              <div>debug-auth status: {authStatusError || 'pending'}</div>
            )}
          </section>

          {latestAuthSnapshot && (
            <section className="space-y-1">
              <div className="font-semibold">Latest Admin Request Snapshot</div>
              <div>time: {latestAuthSnapshot.timestamp}</div>
              <div>path: {latestAuthSnapshot.urlPath}</div>
              <div>method: {latestAuthSnapshot.method}</div>
              <div>adminHeaderAttached: {String(latestAuthSnapshot.adminHeaderAttached)}</div>
              <div>origin: {latestAuthSnapshot.origin}</div>
              <div>host: {latestAuthSnapshot.host}</div>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Last Upload Attempts</div>
              <button
                type="button"
                onClick={() => clearUploadAttempts()}
                className="text-xs font-medium text-amber-900 underline"
              >
                Clear
              </button>
            </div>
            {attempts.length === 0 ? (
              <div>No upload attempts recorded yet.</div>
            ) : (
              <div className="space-y-3">
                {attempts
                  .slice()
                  .reverse()
                  .map((attempt) => (
                    <div key={attempt.requestId} className="rounded-lg border border-amber-200 bg-white/70 p-3">
                      <div className="font-medium">requestId: {attempt.requestId}</div>
                      <div>time: {attempt.timestamp}</div>
                      <div>file: {attempt.fileName} ({attempt.fileSize} bytes, {attempt.fileType || 'unknown'})</div>
                      <div>requestPath: {attempt.requestPath}</div>
                      <div>adminHeaderAttached: {String(attempt.adminHeaderAttached)}</div>
                      {attempt.preflight?.attempted && (
                        <div>
                          preflight: status={attempt.preflight.status ?? 'n/a'} ok={String(attempt.preflight.ok)}
                        </div>
                      )}
                      {!attempt.preflight?.attempted && <div>preflight: not attempted</div>}
                      <div>responseStatus: {attempt.responseStatus ?? 'n/a'}</div>
                      {attempt.responseText && (
                        <div>response: {truncate(attempt.responseText, 300)}</div>
                      )}
                      {attempt.errorMessage && (
                        <div>error: {truncate(attempt.errorMessage, 300)}</div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
