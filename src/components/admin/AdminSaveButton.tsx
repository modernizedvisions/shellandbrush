import { CheckCircle, Loader2 } from 'lucide-react';

type SaveState = 'idle' | 'saving' | 'success' | 'error';

type AdminSaveButtonProps = {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  saveState: SaveState;
};

export function AdminSaveButton({ onClick, disabled, saveState }: AdminSaveButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || saveState === 'saving'}
      className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
    >
      {saveState === 'saving' ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : saveState === 'success' ? (
        <>
          <CheckCircle className="h-4 w-4 text-green-200" />
          Saved
        </>
      ) : (
        'Save'
      )}
    </button>
  );
}
