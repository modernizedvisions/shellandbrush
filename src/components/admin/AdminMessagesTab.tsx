import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { adminDeleteMessage } from '../../lib/api';
import { adminFetch } from '../../lib/adminAuth';
import { AdminSectionHeader } from './AdminSectionHeader';
import { formatDateTimeEastern } from '../../lib/date';

interface AdminMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  imageUrl?: string | null;
  createdAt: string;
  status?: string;
}

export interface AdminMessagesTabProps {
  onCreateCustomOrderFromMessage: (message: {
    customerName?: string;
    customerEmail?: string;
    description?: string;
    messageId?: string;
  }) => void;
}

export const AdminMessagesTab: React.FC<AdminMessagesTabProps> = ({ onCreateCustomOrderFromMessage }) => {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<AdminMessage | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const truncateMessage = (text: string, max = 15): string => {
    if (!text) return '';
    return text.length <= max ? text : text.slice(0, max) + '...';
  };

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await adminFetch('/api/admin/messages');
        if (!res.ok) throw new Error('Failed to load messages');
        const json = await res.json();
        let incoming: AdminMessage[];
        if (Array.isArray(json)) {
          incoming = json as AdminMessage[];
        } else if (Array.isArray(json?.messages)) {
          incoming = json.messages as AdminMessage[];
        } else {
          console.error('[AdminMessagesTab] Unexpected messages payload', json);
          incoming = [];
        }
        console.log('[AdminMessagesTab] Loaded messages', incoming);
        setMessages(incoming);
      } catch (err) {
        console.error('[AdminMessagesTab] Failed to load messages', err);
        setError('Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      }),
    [messages]
  );

  const openMessage = (msg: AdminMessage) => {
    setSelectedMessage(msg);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleDeleteMessage = () => {
    if (!selectedMessage) return;
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteMessage = async () => {
    if (!selectedMessage) return;
    const id = selectedMessage.id;
    console.debug('[messages] delete clicked', { id, hasHandler: !!adminDeleteMessage });
    console.debug('[messages] calling delete endpoint', { url: `/api/admin/messages/${id}`, method: 'DELETE' });
    setIsDeleting(true);
    try {
      await adminDeleteMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setSelectedMessage(null);
      setIsDialogOpen(false);
      setIsDeleteConfirmOpen(false);
      toast.success('Message deleted from dashboard');
    } catch (err) {
      console.error('[AdminMessagesTab] Failed to delete message', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete message');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <AdminSectionHeader title="Messages" subtitle="Customer messages from the contact form." />

      {isLoading && <div className="text-sm text-gray-500">Loading messages...</div>}
      {error && !isLoading && <div className="text-sm text-red-600">{error}</div>}

      {sortedMessages.length === 0 ? (
        <div className="text-sm text-gray-500">No messages yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Received</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Image</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Message</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {sortedMessages.map((msg) => (
                <tr key={msg.id || `${msg.email}-${msg.createdAt}`}>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {msg.createdAt ? formatDateTimeEastern(msg.createdAt) : '-'}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">{msg.name || 'Unknown'}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{msg.email || '-'}</td>
                  <td className="px-4 py-3">
                    {msg.imageUrl ? (
                      <img
                        src={msg.imageUrl}
                        alt={msg.name || 'Message image'}
                        className="h-10 w-10 rounded-md border border-slate-200 object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">No image</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[12rem] text-sm text-slate-700">
                      {truncateMessage(msg.message || '', 15) || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm font-medium text-gray-700 underline"
                      onClick={() => openMessage(msg)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="relative">
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleDeleteMessage}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center"
              aria-label="Delete message"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCloseDialog}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              CLOSE
            </button>
          </div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Message Details</h2>
          </div>

          <div className="max-h-[80vh] overflow-y-auto overflow-x-hidden">
            {selectedMessage && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Name</p>
                  <p className="text-sm text-gray-900">{selectedMessage.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Email</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900">{selectedMessage.email || '-'}</p>
                    {selectedMessage.email && (
                      <Copy
                        className="h-4 w-4 cursor-pointer text-neutral-500 hover:text-neutral-800 transition"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedMessage.email);
                          toast.success('Email copied to clipboard!');
                        }}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Message</p>
                  <p className="whitespace-pre-wrap break-words text-sm text-gray-900">
                    {selectedMessage.message || '-'}
                  </p>
                </div>
                {selectedMessage.imageUrl && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-wide text-slate-500">IMAGE</span>
                      <a
                        href={selectedMessage.imageUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-sky-700 hover:underline"
                      >
                        Download image
                      </a>
                    </div>
                    <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                      <img
                        src={selectedMessage.imageUrl}
                        alt={selectedMessage.name || 'Uploaded image'}
                        className="block h-auto w-full max-h-[70vh] object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        title="Are you sure?"
        description="This will permanently delete this message."
        confirmText={isDeleting ? 'Deleting...' : 'Confirm'}
        cancelText="Cancel"
        confirmVariant="danger"
        confirmDisabled={isDeleting}
        cancelDisabled={isDeleting}
        onCancel={() => {
          if (!isDeleting) setIsDeleteConfirmOpen(false);
        }}
        onConfirm={confirmDeleteMessage}
      />
    </div>
  );
};
