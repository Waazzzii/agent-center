'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, AlertCircle, SwitchCamera } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { decodeQrFromVideo } from '@/lib/qr-decode';

/**
 * Camera QR scanner for 2FA enrollment.
 *
 * Scans continuously and fires `onResult` with the decoded string the moment
 * a code resolves — for TOTP that string is the `otpauth://` URI, which the
 * caller hands straight to the enrollment endpoint.
 *
 * Deliberately dumb about content: it does not parse or validate what it
 * decoded. The caller owns that, so a wrong QR (a WiFi code, a URL) produces
 * one clear parser error instead of two competing ones.
 *
 * SECURITY: the decoded value is a long-lived 2FA seed. It is passed to the
 * callback and never stored here — no state, no logging.
 */
export function QrScannerDialog({
  open, onClose, onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number | null>(null);
  // Guards against firing onResult twice: decoding is async, so a second
  // frame can resolve while the first result is still being handled.
  const doneRef   = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // 'environment' = rear camera on phones/tablets; desktops ignore it.
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  /** Stop the stream and the scan loop. Safe to call repeatedly. */
  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Releasing every track is what turns the camera light off. Miss this
    // and the indicator stays on after the dialog closes, which users
    // reasonably read as "it's still watching me".
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      teardown();
      return;
    }

    let cancelled = false;
    doneRef.current = false;

    (async () => {
      // Reset inside the start routine rather than in the effect body:
      // these describe "the camera is starting", i.e. the state of the
      // external system this effect drives, not a render-time derivation.
      // Setting them synchronously in the body triggers a cascading render.
      setError(null);
      setStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // iOS Safari refuses to play inline without both of these.
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        await video.play().catch(() => {});
        setStarting(false);

        const tick = async () => {
          if (cancelled || doneRef.current || !videoRef.current) return;
          try {
            const text = await decodeQrFromVideo(videoRef.current);
            if (text && !doneRef.current) {
              doneRef.current = true;
              teardown();
              onResult(text);
              return;
            }
          } catch {
            // A single bad frame is not worth surfacing — keep scanning.
          }
          rafRef.current = requestAnimationFrame(() => { void tick(); });
        };
        rafRef.current = requestAnimationFrame(() => { void tick(); });
      } catch (err: unknown) {
        if (cancelled) return;
        setStarting(false);
        // Distinguish the fixable cases: a denied permission needs a browser
        // setting changed, a missing device needs different hardware.
        const name = (err as { name?: string })?.name ?? '';
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera found on this device.'
              : name === 'NotReadableError'
                ? 'The camera is in use by another application.'
                : 'Could not start the camera.',
        );
      }
    })();

    return () => { cancelled = true; teardown(); };
  }, [open, facing, teardown, onResult]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-brand" /> Scan 2FA QR code
          </DialogTitle>
          <DialogDescription className="text-xs">
            Point the camera at the QR code on the site&apos;s two-factor setup screen. It
            captures automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

          {/* Framing guide — purely visual; decoding uses the whole frame. */}
          {!error && !starting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-2/3 w-2/3 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}

          {starting && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white">
              <Loader2 className="h-4 w-4 animate-spin" /> Starting camera…
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-xs text-white/90 leading-snug">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button" variant="ghost" size="sm" className="text-xs"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            disabled={!!error}
            title="Switch between front and rear camera"
          >
            <SwitchCamera className="h-3.5 w-3.5 mr-1" /> Switch camera
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
