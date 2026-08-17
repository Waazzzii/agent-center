'use client';

import { MousePointer2, Route, Sparkles, ShieldAlert, Loader2, Check, AlertCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Shown once, immediately before a NEW recording starts.
 *
 * Recording quality is decided almost entirely by what the operator does in
 * the first thirty seconds, and the two failure modes are predictable:
 * wandering (exploring the app mid-record, which captures dozens of steps
 * the replay doesn't need) and hesitating (waiting for someone to tell them
 * when to start). Both are cheap to prevent with instructions at the moment
 * of action, and expensive to fix afterwards.
 *
 * Deliberately four points, not a tutorial. Anything longer gets dismissed
 * unread, which is worse than not showing it.
 */
export function GuidedRecordDialog({
  open, onStart, onCancel, targetUrl, kindLabel = 'script', browserStatus = 'starting',
}: {
  open: boolean;
  onStart: () => void;
  onCancel: () => void;
  /** Where the recorder will open, when known — makes step 1 concrete. */
  targetUrl?: string | null;
  /** e.g. "login script" — names the thing being recorded. */
  kindLabel?: string;
  /**
   * The browser boots WHILE this is being read, so the wait overlaps with
   * the instructions instead of following them. Surfaced so the operator
   * knows why Start is briefly unavailable rather than thinking it's stuck.
   */
  browserStatus?: 'starting' | 'ready' | 'failed';
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Recording a {kindLabel}</DialogTitle>
          <DialogDescription className="text-xs">
            A browser opens and captures what you do. Do the task once, the way you normally
            would — everything else is handled afterwards.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 py-1">
          <li className="flex gap-3">
            <Route className="h-4 w-4 text-brand shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Take the shortest path</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Go straight to the goal. Don&apos;t explore, don&apos;t check other tabs, don&apos;t
                double back — every detour becomes a step the agent has to replay.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <MousePointer2 className="h-4 w-4 text-brand shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Click deliberately, once</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                One click per action. If a page is slow, wait for it rather than clicking again —
                impatient repeats get recorded too.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <Sparkles className="h-4 w-4 text-brand shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Stop when the task is done</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Hit Stop and the recording is cleaned up automatically: duplicate and dead-end
                steps removed, selectors hardened, your typed values turned into variables, and
                anything that submits or deletes flagged for approval.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">It&apos;s a real browser</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Anything you do actually happens on the site. Avoid submitting real changes you
                don&apos;t want made.
              </p>
            </div>
          </li>
        </ol>

        {targetUrl && (
          <p className="text-[10px] text-muted-foreground truncate">
            Opening <span className="font-mono">{targetUrl}</span>
          </p>
        )}

        <DialogFooter className="sm:justify-between gap-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            {browserStatus === 'ready' ? (
              <><Check className="h-3 w-3 text-emerald-500" /> Browser ready</>
            ) : browserStatus === 'failed' ? (
              <><AlertCircle className="h-3 w-3 text-destructive" /> Browser failed to start</>
            ) : (
              <><Loader2 className="h-3 w-3 animate-spin" /> Starting browser…</>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button" size="sm" onClick={onStart}
              disabled={browserStatus !== 'ready'}
            >
              {browserStatus === 'failed' ? 'Unavailable' : 'Start recording'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
