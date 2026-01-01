import React from 'react';
import { Plus } from 'lucide-react';
import type { HeroCollageImage } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';
import { adminUploadImage } from '../../lib/api';
import { AdminSaveButton } from './AdminSaveButton';

const isBlockedImageUrl = (value?: string) => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 2000) return true;
  const lower = trimmed.toLowerCase();
  return lower.startsWith('data:') || lower.startsWith('blob:') || lower.includes(';base64,');
};

export interface AdminHomeTabProps {
  heroImages: HeroCollageImage[];
  onHeroChange: (images: HeroCollageImage[]) => void;
  onSaveHeroConfig: () => Promise<void>;
  homeSaveState: 'idle' | 'saving' | 'success';
  homeSaveError?: string;
  heroRotationEnabled?: boolean;
  onHeroRotationToggle?: (enabled: boolean) => void;
}

export function AdminHomeTab({
  heroImages,
  onHeroChange,
  onSaveHeroConfig,
  homeSaveState,
  homeSaveError,
  heroRotationEnabled = false,
  onHeroRotationToggle,
}: AdminHomeTabProps) {
  return (
    <div className="space-y-12">
      <HeroCollageAdmin
        images={heroImages}
        onChange={onHeroChange}
        onSave={onSaveHeroConfig}
        saveState={homeSaveState}
        saveError={homeSaveError}
        heroRotationEnabled={heroRotationEnabled}
        onHeroRotationToggle={onHeroRotationToggle}
      />
    </div>
  );
}

interface HeroCollageAdminProps {
  images: HeroCollageImage[];
  onChange: (images: HeroCollageImage[]) => void;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success';
  saveError?: string;
  heroRotationEnabled?: boolean;
  onHeroRotationToggle?: (enabled: boolean) => void;
}

function HeroCollageAdmin({
  images,
  onChange,
  onSave,
  saveState,
  saveError,
  heroRotationEnabled = false,
  onHeroRotationToggle,
}: HeroCollageAdminProps) {
  const slots = [0, 1, 2];
  const hasUploads = images.some((img) => img?.uploading);
  const hasBlocked = images.some((img) => isBlockedImageUrl(img?.imageUrl));

  const handleFileSelect = async (index: number, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const existing = images[index];
    const id = existing?.id || `hero-${index}-${crypto.randomUUID?.() || Date.now()}`;
    const buildNext = (overrides: Partial<HeroCollageImage>) =>
      slots
        .map((slotIndex) => {
          if (slotIndex !== index) return images[slotIndex];
          return {
            id,
            imageUrl: previewUrl,
            imageId: existing?.imageId,
            alt: existing?.alt,
            createdAt: existing?.createdAt || new Date().toISOString(),
            uploading: true,
            uploadError: undefined,
            ...overrides,
          };
        })
        .filter((img): img is HeroCollageImage => Boolean(img && img.imageUrl));
    const next = buildNext({});
    onChange(next);

    try {
      const result = await adminUploadImage(file, {
        scope: 'home',
        entityType: 'home_hero',
        entityId: 'home',
        kind: 'hero',
        sortOrder: index,
        isPrimary: index === 0,
      });
      URL.revokeObjectURL(previewUrl);
      onChange(
        buildNext({
          imageUrl: result.url,
          imageId: result.id,
          uploading: false,
          uploadError: undefined,
        })
      );
    } catch (err) {
      onChange(
        buildNext({
          uploading: false,
          uploadError: err instanceof Error ? err.message : 'Upload failed',
        })
      );
    }
  };

  const handleAltChange = (index: number, alt: string) => {
    const existing = images[index];
    if (!existing) return;
    const next = [...images];
    next[index] = { ...existing, alt };
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <section className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="space-y-2">
        <AdminSectionHeader
          title="Hero Images"
          subtitle="main images on your site"
        />
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-slate-900">Rotate Hero Images</p>
            <p className="text-xs text-slate-600">
              ON: rotate through all hero images. OFF: show only the first image.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
              checked={!!heroRotationEnabled}
              onChange={(e) => onHeroRotationToggle?.(e.target.checked)}
            />
            <span>{heroRotationEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="flex justify-center sm:justify-end">
          <AdminSaveButton
            onClick={async () => {
              if (hasBlocked) {
                console.error('[admin home] blocked: invalid hero image URLs detected.');
                return;
              }
              await onSave();
            }}
            disabled={hasUploads || hasBlocked}
            saveState={saveState}
          />
        </div>
        {hasBlocked && <div className="text-xs text-red-600">Upload hero images before saving (no blob/data URLs).</div>}
        {saveError && <div className="text-xs text-red-600">{saveError}</div>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => {
          const image = images[slot];
          const inputId = `hero-collage-${slot}`;
          return (
            <div
              key={slot}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(slot, file);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">Hero Image {slot + 1}</div>
                <div className="flex items-center gap-2">
                  {image && (
                    <button type="button" onClick={() => handleRemove(slot)} className="text-xs text-red-600 hover:text-red-700">
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => document.getElementById(inputId)?.click()}
                    className="text-xs text-slate-700 underline hover:text-slate-900"
                  >
                    {image ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

              <div className="aspect-[3/4] rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                {image?.imageUrl ? (
                  <img src={image.imageUrl} alt={image.alt || `Hero image ${slot + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-slate-500 text-sm">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Drop or upload</span>
                  </div>
                )}
              </div>
              {image?.uploading && (
                <div className="text-xs text-slate-500">Uploading...</div>
              )}
              {image?.uploadError && (
                <div className="text-xs text-red-600">{image.uploadError}</div>
              )}

              <div className="space-y-1">
                <label htmlFor={`${inputId}-alt`} className="text-xs font-medium text-slate-700">
                  Alt text / description
                </label>
                <input
                  id={`${inputId}-alt`}
                  type="text"
                  value={image?.alt || ''}
                  onChange={(e) => handleAltChange(slot, e.target.value)}
                  placeholder="Optional description"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(slot, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

