'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  getSlackNotificationStatus,
  type SlackNotificationStatus,
} from '@/lib/api/notifications';

interface Props {
  /** Current Slack channel id, or empty string for "use org default". */
  value: string;
  /** Setter — pass empty string back to clear the override. */
  onChange: (next: string) => void;
  /** Optional override of the label text. */
  label?: string;
  /** Optional extra hint that follows the standard explanation. */
  description?: string;
  /**
   * Where this input is being rendered. Drives the "what gets used if I
   * leave this blank?" explanation under the field.
   *   'approval' — falls back to program / org default for this run
   *   'login'    — falls back to program / org default for this run
   *   'program'  — falls back to org default
   */
  scope: 'approval' | 'login' | 'program';
  /** Optional: pass a pre-fetched status to skip the internal fetch. */
  status?: SlackNotificationStatus | null;
  disabled?: boolean;
}

/**
 * Reusable channel-id input with inline Slack connection status badge and
 * an expandable "Where do I find a channel ID?" help block. Used by:
 *   • Approval action dialog (agent-center)
 *   • Login profile edit page (agent-center)
 *   • Program edit modal (wazzi-frontend — mirrored component)
 *
 * Empty string = "no override; use the next level up in the resolution
 * cascade". The badge tells the operator at a glance whether Slack is
 * actually wired up at the org level — if it isn't, the field still
 * accepts a value (configuration is independent of connection), but the
 * UI makes clear that nothing will be delivered until Slack is set up.
 */
export function SlackChannelInput({
  value, onChange,
  label = 'Slack notification channel',
  description,
  scope,
  status: providedStatus = null,
  disabled = false,
}: Props) {
  const { selectedOrgId } = useAdminViewStore();
  const [status, setStatus] = useState<SlackNotificationStatus | null>(providedStatus);
  const [loadingStatus, setLoadingStatus] = useState(!providedStatus);
  const [showHelp, setShowHelp] = useState(false);

  // Fetch status on mount unless the parent already has it.
  useEffect(() => {
    if (providedStatus || !selectedOrgId) {
      setLoadingStatus(false);
      return;
    }
    let cancelled = false;
    setLoadingStatus(true);
    getSlackNotificationStatus(selectedOrgId)
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { /* badge falls back to "Unknown" */ })
      .finally(() => { if (!cancelled) setLoadingStatus(false); });
    return () => { cancelled = true; };
  }, [selectedOrgId, providedStatus]);

  // Two-state badge: Slack is either reachable for this org or it isn't.
  // The per-entity channel override is the only gate that matters for
  // these notifications, so we don't need a separate "disabled by org
  // toggle" state anymore (it was redundant with leaving the channel
  // blank).
  const renderBadge = () => {
    if (loadingStatus) {
      return <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">Checking…</Badge>;
    }
    if (!status?.connected) {
      return (
        <Badge variant="outline" className="text-[10px] gap-1 border-slate-400 text-slate-500">
          <AlertCircle className="h-3 w-3" />
          Slack: Not configured
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-green-500 text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Slack: Connected
      </Badge>
    );
  };

  // The cascade-explanation text under the input. Mirrors what the
  // backend's _resolveTargetChannel actually does — keep in sync.
  // The pre-198 org-default channel was retired in migration 200, so
  // a missing entry at every cascade level just means "silent".
  const fallbackText = (() => {
    const silentTail = 'no notification will be sent (the dashboard remains the source of truth)';
    if (scope === 'program')  return `If blank, ${silentTail}.`;
    // approval / login both inherit the program channel on submissions runs
    return `If blank, this run's program channel is used (if it's a submissions run); otherwise ${silentTail}.`;
  })();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs font-medium">{label}</Label>
        {renderBadge()}
      </div>
      <Input
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="C0123456789"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">
        {fallbackText}
        {description ? ` ${description}` : null}
      </p>

      {/* Collapsible "where do I find a channel ID" instructions.
          Slack hides the channel ID a bit — putting the steps here so
          operators don't have to Google it. */}
      <button
        type="button"
        onClick={() => setShowHelp((s) => !s)}
        className={cn(
          'mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors',
        )}
      >
        {showHelp ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Where do I find a channel ID?
      </button>
      {showHelp && (
        <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] space-y-1.5 text-muted-foreground">
          <p className="flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Channel IDs look like <code className="font-mono">C0123456789</code> (uppercase
              letter prefix + 9–10 alphanumeric characters). You can use them for public
              channels, private channels, and DM threads.
            </span>
          </p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Open Slack in your browser.</li>
            <li>Navigate to the channel you want notifications to land in.</li>
            <li>
              Click the channel name at the top of the conversation to open the channel
              details panel.
            </li>
            <li>
              Scroll to the bottom of that panel — the channel ID is shown there next to
              a small copy icon.
            </li>
            <li>Paste the value (e.g. <code className="font-mono">C0123456789</code>) into the field above.</li>
          </ol>
          <p className="pt-1">
            <strong>Important:</strong> the Slack bot must be a member of the channel before it
            can post there. In Slack, use <code className="font-mono">/invite @YourBotName</code> in the channel.
          </p>
        </div>
      )}
    </div>
  );
}
