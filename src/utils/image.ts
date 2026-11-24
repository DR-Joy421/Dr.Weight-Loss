const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.82;

function scaleDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { width, height };
  }
  if (width >= height) {
    return {
      width: MAX_DIMENSION,
      height: Math.round((height * MAX_DIMENSION) / width),
    };
  }
  return {
    width: Math.round((width * MAX_DIMENSION) / height),
    height: MAX_DIMENSION,
  };
}

export async function compressImageFile(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not read the selected image file.'));
      image.src = objectUrl;
    });

    const { width, height } = scaleDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context unavailable for image processing.');
    }
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return { dataUrl, mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function captureVideoFrame(video: HTMLVideoElement): { dataUrl: string; mimeType: string } {
  const rawW = video.videoWidth || 1280;
  const rawH = video.videoHeight || 720;
  const { width, height } = scaleDimensions(rawW, rawH);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to capture frame from camera.');
  }
  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { dataUrl, mimeType: 'image/jpeg' };
}
