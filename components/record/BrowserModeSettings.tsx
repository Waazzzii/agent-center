'use client';

/**
 * How a browser script's browser runs — the script's two browser settings.
 *
 *   Headless          no display, no live view. Only for scripts without a
 *                     login: a login's browser may need a person to take it
 *                     over, and a headless browser has no screen.
 *   First-party only  other sites' scripts, data calls and frames are refused.
 *                     Most of what a listing page costs is third-party
 *                     JavaScript; measured across 22 sites, the listing came
 *                     through intact at about half the CPU.
 *
 * They follow the script everywhere it runs — agent runs, the Agents API, and
 * the editor's Auto run. Recording and single steps in the editor stay headed
 * (a person is watching) but honour first-party only, so what is recorded is
 * what the agent sees.
 *
 * One control, used by the Scripts list and the editor toolbar, so the two
 * places say the same thing in the same words.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Monitor, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { updateScript, setStepRunFirstPartyOnly, type BrowserScript } from '@/lib/api/scripts';

type ScriptBrowserFields = Pick<BrowserScript, 'id' | 'name' | 'kind' | 'requires_login' | 'headless' | 'first_party_only'>;

export function browserModeSummary(s: Pick<BrowserScript, 'headless' | 'first_party_only'>): string {
  return `${s.headless ? 'Headless' : 'Headed'} · ${s.first_party_only ? '1st-party' : 'All scripts'}`;
}

interface BrowserModeSettingsProps {
  orgId: string;
  /** null for a draft that has not been saved yet — nothing to store the settings on. */
  script: ScriptBrowserFields | null;
  /** Called with the saved values after a change. */
  onChange: (fields: Pick<BrowserScript, 'headless' | 'first_party_only'>) => void;
  /** The editor's live session, so a first-party change applies to the open browser too. */
  liveRunId?: string | null;
  /** "toolbar" is the editor's compact button; "cell" fits a table row. */
  variant?: 'toolbar' | 'cell';
}

export function BrowserModeSettings({ orgId, script, onChange, liveRunId = null, variant = 'cell' }: BrowserModeSettingsProps) {
  const [pending, setPending] = useState<'headless' | 'first_party_only' | null>(null);

  if (script && script.kind !== 'regular') {
    // A login script performs the authentication; it runs as its login does.
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const headlessBlocked = script?.requires_login === true;

  async function change(field: 'headless' | 'first_party_only', next: boolean) {
    if (!script) return;
    setPending(field);
    try {
      const saved = await updateScript(orgId, script.id, { [field]: next });
      onChange({ headless: saved.headless === true, first_party_only: saved.first_party_only === true });
      if (field === 'first_party_only' && liveRunId) {
        // The setting is saved either way; this only brings the open window in
        // line. A failure here is not a failed save — say what to do instead.
        await setStepRunFirstPartyOnly(orgId, liveRunId, next)
          .then(() => toast.success(
            next
              ? 'First-party only is on in this browser — reload the page to see it as agent runs will'
              : 'This browser loads other sites\' scripts again — reload the page to see the difference',
          ))
          .catch(() => toast.warning('Saved. Reopen the script to apply it to this browser.'));
      } else {
        toast.success(
          field === 'headless'
            ? (next ? `"${script.name}" now runs headless — check a run's results` : `"${script.name}" runs with a screen again`)
            : (next ? `"${script.name}" now blocks other sites' scripts — check a run's results` : `"${script.name}" loads every site's scripts again`),
        );
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to update the script');
    } finally {
      setPending(null);
    }
  }

  const summary = script ? browserModeSummary(script) : 'Headed · All scripts';
  const custom = !!script && (script.headless || script.first_party_only);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md text-xs',
            variant === 'toolbar'
              ? 'h-7 border px-2 text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'px-1 py-0.5 hover:bg-muted',
            custom ? 'text-foreground' : 'text-muted-foreground',
          )}
          aria-label={`Browser settings: ${summary}`}
          title="How this script's browser runs"
        >
          <Monitor className="h-3.5 w-3.5 shrink-0" />
          {summary}
        </button>
      </PopoverTrigger>
      <PopoverContent align={variant === 'toolbar' ? 'end' : 'start'} className="w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-sm font-medium">Browser settings</p>
          <p className="text-xs text-muted-foreground">
            Agent runs and the editor&apos;s Auto run use these. Recording and single steps stay headed.
          </p>
        </div>

        {!script ? (
          <p className="text-xs text-muted-foreground">Save the script first — the settings are stored on it.</p>
        ) : (
          <>
            <SettingRow
              label="Headless"
              checked={script.headless}
              disabled={headlessBlocked || pending !== null}
              busy={pending === 'headless'}
              onCheckedChange={(v) => change('headless', v)}
              description={headlessBlocked
                ? 'Not for a script that needs a login — its browser may need a person to take it over, and a headless browser has no screen.'
                : 'No screen and no live view, which costs the worker a little less. Auto runs the whole script in a separate headless browser; follow it in the step list.'}
            />
            <SettingRow
              label="First-party scripts only"
              checked={script.first_party_only}
              disabled={pending !== null}
              busy={pending === 'first_party_only'}
              onCheckedChange={(v) => change('first_party_only', v)}
              description="Blocks other sites' scripts, data calls and frames (analytics, chat, ads), which is most of what a page costs. Turn it off if the site needs one — a bot check or listings served from another domain."
            />
            <p className="text-[11px] text-muted-foreground">
              Some sites behave differently with these on. After changing one, run the script with Auto and check what it extracts.
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SettingRow({
  label, description, checked, disabled, busy, onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-1.5 pt-0.5">
        {/* Beside the switch, never in place of it — the row does not move. */}
        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
      </div>
    </div>
  );
}
