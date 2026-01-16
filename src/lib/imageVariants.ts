type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, targetWidth: number, targetHeight: number) => void;
  cleanup?: () => void;
};

const decodeImage = async (file: File): Promise<DecodedImage> => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, targetWidth, targetHeight) => {
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      },
      cleanup: () => {
        bitmap.close();
      },
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = objectUrl;
  try {
    if ('decode' in img) {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to decode image'));
      });
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: (ctx, targetWidth, targetHeight) => {
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    },
  };
};

const canvasToWebp = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create WebP blob'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality
    );
  });

export async function createWebpVariant(
  file: File,
  maxWidth: number,
  quality: number
): Promise<File> {
  const decoded = await decodeImage(file);
  try {
    const sourceWidth = decoded.width;
    const sourceHeight = decoded.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('Invalid source image dimensions');
    }

    const targetWidth = Math.min(maxWidth, sourceWidth);
    const scale = targetWidth / sourceWidth;
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    decoded.draw(ctx, targetWidth, targetHeight);
    const blob = await canvasToWebp(canvas, quality);
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image';
    return new File([blob], `${baseName}-${targetWidth}.webp`, { type: 'image/webp' });
  } finally {
    decoded.cleanup?.();
  }
}
