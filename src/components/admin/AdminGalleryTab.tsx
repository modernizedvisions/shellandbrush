import React from 'react';
import { CheckCircle, Eye, EyeOff, Plus, Trash2, Upload } from 'lucide-react';
import type { GalleryImage } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';

export interface AdminGalleryTabProps {
  images: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
  fileInputRef: React.RefObject<HTMLInputElement>;
  title?: string;
  description?: string;
  maxImages?: number;
}

export function AdminGalleryTab(props: AdminGalleryTabProps) {
  return (
    <GalleryAdmin
      images={props.images}
      onChange={props.onChange}
      onSave={props.onSave}
      saveState={props.saveState}
      fileInputRef={props.fileInputRef}
      title={props.title}
      description={props.description}
      maxImages={props.maxImages}
    />
  );
}

interface GalleryAdminProps {
  images: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
  fileInputRef: React.RefObject<HTMLInputElement>;
  title?: string;
  description?: string;
  maxImages?: number;
}

function GalleryAdmin({
  images,
  onChange,
  onSave,
  saveState,
  fileInputRef,
  title = 'Gallery Management',
  description = 'Add, hide, or remove gallery images.', // Uses PUT /api/gallery with payload { images: GalleryImage[] }
  maxImages,
}: GalleryAdminProps) {
  const handleAddImages = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    const allowed = typeof maxImages === 'number' ? Math.max(0, maxImages - images.length) : undefined;
    const selected = typeof allowed === 'number' ? fileArray.slice(0, allowed) : fileArray;
    const readers = selected.map((file) => {
      return new Promise<GalleryImage>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id: crypto.randomUUID(),
            imageUrl: reader.result as string,
            alt: file.name,
            hidden: false,
            createdAt: new Date().toISOString(),
            position: images.length,
          } as GalleryImage);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers)
      .then((newImages) => onChange([...images, ...newImages]))
      .catch((err) => console.error('Error reading images', err));
  };

  const handleRemove = (id: string) => {
    onChange(images.filter((img) => img.id !== id));
  };

  const handleToggleVisibility = (id: string) => {
    onChange(
      images.map((img) =>
        img.id === id
          ? {
              ...img,
              hidden: !img.hidden,
            }
          : img
      )
    );
  };

  const handleMove = (id: string, direction: 'up' | 'down') => {
    const idx = images.findIndex((img) => img.id === id);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= images.length) return;

    const newImages = [...images];
    [newImages[idx], newImages[targetIdx]] = [newImages[targetIdx], newImages[idx]];
    onChange(newImages);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleAddImages(e.dataTransfer.files);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="mb-4">
        <AdminSectionHeader title={title} subtitle={description} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
          <button
            onClick={onSave}
            disabled={saveState === 'saving'}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {saveState === 'saving' ? (
              <>
                <Upload className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400"
          >
            <Upload className="w-4 h-4" />
            Upload Images
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleAddImages(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>
        <div className="mt-2 text-xs text-gray-600">
          {saveState === 'saving' && 'Saving changes...'}
          {saveState === 'success' && 'Gallery saved.'}
          {saveState === 'error' && 'Save failed. Please retry.'}
          {saveState === 'idle' && images.length === 0 && 'No images saved yet.'}
        </div>
      </div>

      <div
        className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-500 cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <Upload className="w-5 h-5" />
          <p className="text-sm">Drag and drop images here, or click to browse.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
        {images.map((img, idx) => (
          <div key={img.id} className="relative group rounded-lg overflow-hidden border border-gray-200">
            <div className="aspect-square bg-gray-100">
              <img src={img.imageUrl} alt={img.alt || `Gallery image ${idx + 1}`} className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between text-white text-xs">
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(img.id)}
                  className="inline-flex items-center gap-1 bg-white/10 px-2 py-1 rounded hover:bg-white/20"
                >
                  {!img.hidden ? (
                    <>
                      <Eye className="w-3 h-3" />
                      Visible
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3" />
                      Hidden
                    </>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMove(img.id, 'up')}
                    className="bg-white/10 px-2 py-1 rounded hover:bg-white/20"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(img.id, 'down')}
                    className="bg-white/10 px-2 py-1 rounded hover:bg-white/20"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(img.id)}
                    className="inline-flex items-center gap-1 bg-red-600 px-2 py-1 rounded hover:bg-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
            <div className="absolute top-2 left-2">
              <span className="inline-flex items-center rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-800 shadow-sm">
                #{idx + 1}
              </span>
            </div>
          </div>
        ))}

        {images.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center text-gray-500 py-8 border border-dashed border-gray-300 rounded-lg">
            <Plus className="w-6 h-6 mb-2" />
            <p className="text-sm">No images uploaded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
