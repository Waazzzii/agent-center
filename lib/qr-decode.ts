/**
 * QR decoding for 2FA enrollment.
 *
 * A TOTP enrollment QR encodes exactly one thing: the
 * `otpauth://totp/...?secret=...` URI. Decoding one therefore produces the
 * same string an operator would paste by hand, and it feeds the existing
 * parser unchanged — there is no separate "QR format" to handle.
 *
 * TWO DECODERS, ON PURPOSE:
 *   1. BarcodeDetector — native, no bundle cost, hardware-accelerated.
 *      Chrome/Edge/Android only; absent in Firefox and desktop Safari.
 *   2. jsQR — pure JS fallback so every browser works.
 * Everything funnels through ImageData, so one code path serves clipboard
 * images, file uploads, drag-drop, and live camera frames alike.
 *
 * SECURITY: what comes back here is the long-lived 2FA SEED, decoded in the
 * browser. Hand it straight to the enrollment request and let it fall out of
 * scope — never log it, never put it in component state that outlives the
 * submit, never stash it in localStorage.
 */

import jsQR from 'jsqr';

/** Minimal shape of the native BarcodeDetector we rely on. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource | ImageBitmap | Blob): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getNativeDetector(): BarcodeDetectorLike | null {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ['qr_code'] });
  } catch {
    // Constructor exists but qr_code isn't a supported format on this device.
    return null;
  }
}

/** Cached because constructing a detector per video frame is wasteful. */
let nativeDetector: BarcodeDetectorLike | null | undefined;
function nativeDetectorOnce(): BarcodeDetectorLike | null {
  if (nativeDetector === undefined) nativeDetector = getNativeDetector();
  return nativeDetector;
}

/**
 * Decode a QR from raw pixels. Returns the encoded string, or null when no
 * code is present (the common case for a camera frame — callers poll).
 */
export async function decodeQrFromImageData(image: ImageData): Promise<string | null> {
  const native = nativeDetectorOnce();
  if (native) {
    try {
      // ImageData isn't a valid BarcodeDetector source; wrap it first.
      const bitmap = await createImageBitmap(image);
      try {
        const [first] = await native.detect(bitmap);
        if (first?.rawValue) return first.rawValue;
      } finally {
        bitmap.close?.();
      }
    } catch {
      // Fall through to jsQR rather than failing — a native decoder that
      // throws on one frame shouldn't take the whole feature down.
    }
  }
  // `attemptBoth` tries normal and inverted; some sites render white-on-dark.
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  return result?.data ?? null;
}

/** Draw any image source to a canvas and pull its pixels back out. */
function toImageData(source: CanvasImageSource, width: number, height: number): ImageData | null {
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // willReadFrequently: we call getImageData every frame while scanning.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Decode a QR from an image file or blob — a pasted screenshot, a dropped
 * PNG, or a file-picker selection.
 *
 * Upscales small images before decoding: a QR cropped tight out of a
 * screenshot can land under jsQR's detection threshold, and the retry costs
 * nothing on the failure path.
 */
export async function decodeQrFromFile(file: Blob): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image'));
      el.src = url;
    });

    const first = toImageData(img, img.naturalWidth, img.naturalHeight);
    if (first) {
      const hit = await decodeQrFromImageData(first);
      if (hit) return hit;
    }

    // Retry at 2x for small/tight crops.
    const MIN_FOR_UPSCALE = 600;
    if (img.naturalWidth && img.naturalWidth < MIN_FOR_UPSCALE) {
      const scaled = toImageData(img, img.naturalWidth * 2, img.naturalHeight * 2);
      if (scaled) return decodeQrFromImageData(scaled);
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decode a QR from the current frame of a playing <video>. */
export async function decodeQrFromVideo(video: HTMLVideoElement): Promise<string | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;           // stream hasn't produced a frame yet
  const data = toImageData(video, w, h);
  return data ? decodeQrFromImageData(data) : null;
}

/**
 * Pull the first image out of a paste or drop event. Returns null when the
 * payload is text (the caller should treat that as a normal paste).
 */
export function imageFromTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(dt.files ?? [])) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}

/**
 * True when a camera can even be requested. getUserMedia is gated on a
 * secure context (HTTPS or localhost), so on a plain-HTTP deployment the
 * button should be hidden rather than offered and then failing.
 */
export function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && (typeof window === 'undefined' || window.isSecureContext)
  );
}
