import React, { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { AdminSectionHeader } from './AdminSectionHeader';
import { adminFetchEmailList } from '../../lib/api';
import { formatDateTimeEastern } from '../../lib/date';
import type { EmailListSignup } from '../../lib/types';

export const AdminEmailListTab: React.FC = () => {
  const [signups, setSignups] = useState<EmailListSignup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await adminFetchEmailList();
        setSignups(data);
      } catch (err) {
        console.error('[AdminEmailListTab] Failed to load email list', err);
        setError('Failed to load email list');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const sortedSignups = useMemo(
    () =>
      [...signups].sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      }),
    [signups]
  );

  const handleCopy = async (email: string) => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email copied to clipboard');
    } catch (err) {
      console.error('[AdminEmailListTab] copy failed', err);
      toast.error('Failed to copy email');
    }
  };

  const handleCopyAll = async () => {
    if (!sortedSignups.length) return;
    const payload = sortedSignups.map((signup) => signup.email).filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      toast.success('All emails copied to clipboard');
    } catch (err) {
      console.error('[AdminEmailListTab] copy all failed', err);
      toast.error('Failed to copy emails');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="relative">
        <AdminSectionHeader title="Email List" subtitle="Customer email signups." />
        <div className="mt-3 md:mt-0 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2 flex justify-center md:justify-end">
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={!sortedSignups.length}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Copy className="h-4 w-4" />
            Copy All
          </button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Loading email list...</div>}
      {error && !isLoading && <div className="text-sm text-red-600">{error}</div>}

      {sortedSignups.length === 0 ? (
        <div className="text-sm text-gray-500">No signups yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Signed Up</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {sortedSignups.map((signup) => (
                <tr key={signup.id || `${signup.email}-${signup.createdAt}`}>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {signup.createdAt ? formatDateTimeEastern(signup.createdAt) : '-'}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">{signup.email || '-'}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 underline"
                      onClick={() => handleCopy(signup.email)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
