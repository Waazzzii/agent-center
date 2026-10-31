'use client';

/**
 * components/logins/ProxyCard.tsx
 *
 * Whether this login goes out through the organisation's dedicated proxy, and
 * which IP each of its browsers has.
 *
 * The account and its IPs are the organisation's — entered once in Agent
 * settings, where saving discovers the IPs. Nobody picks an IP here (migration
 * 443): each browser is given its own when it first launches with the proxy
 * on — one no other browser of its pool has, else the org's least-used — and
 * keeps it, profile and all. This card shows it read-only, with Change IP for
 * when one keeps getting challenged or failing (the failure alert names it).
 *
 * TWO MODES, BECAUSE THE TWO HALVES LIVE ON DIFFERENT TABS
 *
 *   mode="login"   (Setup tab)  — the on/off switch, always the login's. For a
 *     login of one browser, also its IP.
 *   mode="browser" (Credentials tab) — this browser's IP, in a pool. Renders
 *     nothing for a login of one browser (Setup shows it).
 *
 * A CHANGE OF ROUTE SIGNS THE BROWSER OUT. The saved session's cookies were
 * issued to the old IP, and bot protection treats a session that reappears on
 * another IP as stolen or scripted, so the backend wipes the profile of every
 * browser whose route changed, exactly like Log Out. Each change asks first.
 */

import { useEffect, useState } from 'react';
import { Globe2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Login, ProxyIpOption } from '@/lib/api/logins';
import { setLoginProxy, getProxyAccountConfigured } from '@/lib/api/logins';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { InfoBubble } from '@/components/actions/login-fields';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

function apiError(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;
}

/** "Palo Alto, California" — whatever the lookup could say. */
function where(ip: ProxyIpOption): string {
  return [ip.city, ip.region].filter(Boolean).join(', ') || ip.country || 'Location unknown';
}

/** A browser's IP, read-only, with Change IP beside it. */
function IpLine({
  ip, assigned, busy, onChange,
}: {
  ip: ProxyIpOption | null;
  /** The browser has an IP id (it may not be in the list if it was just removed). */
  assigned: boolean;
  busy: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 text-sm">
        {ip ? (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono">{ip.ip}</span>
            <span className="font-mono text-xs text-muted-foreground">:{ip.port}</span>
            <span className="text-xs text-muted-foreground">
              {where(ip)}{ip.isp ? ` · ${ip.isp}` : ''}
            </span>
            {!ip.available && (
              <span className="text-xs text-amber-600 dark:text-amber-500">
                no longer reachable — change it
              </span>
            )}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {assigned ? 'Assigned an IP that is no longer on the account — change it' : 'Gets its IP automatically at its next run'}
          </span>
        )}
      </div>
      {assigned && (
        <Button variant="outline" size="sm" disabled={busy} onClick={onChange}>
          {busy
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Change IP
        </Button>
      )}
    </div>
  );
}

/**
 * The org's proxy account as last fetched, so the card mounts already knowing
 * its IPs. Stepping between browsers remounts the page; without this the IP
 * line showed nothing for a moment on every step.
 */
const accountCache = new Map<string, { configured: boolean; ips: ProxyIpOption[] }>();

export function ProxyCard({
  mode,
  orgId,
  login,
  pooled,
  onSaved,
  className,
}: {
  mode: 'login' | 'browser';
  orgId: string;
  /** The browser whose page this is. */
  login: Login;
  pooled: boolean;
  onSaved: () => void | Promise<void>;
  className?: string;
}) {
  const [account, setAccount] = useState<{ configured: boolean; ips: ProxyIpOption[] } | null>(
    () => accountCache.get(orgId) ?? null,
  );
  // WHICH control is saving, so the spinner sits in that control's place.
  const [busy, setBusy] = useState<'toggle' | 'ip' | null>(null);
  const { confirm } = useConfirmDialog();

  const loadAccount = () =>
    getProxyAccountConfigured(orgId)
      .then((a) => { accountCache.set(orgId, a); setAccount(a); })
      .catch(() => setAccount(null));
  useEffect(() => { void loadAccount(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (
    which: 'toggle' | 'ip',
    patch: Parameters<typeof setLoginProxy>[2],
    ok: string,
  ) => {
    // Whose session goes: the on/off switch moves every browser in the pool;
    // Change IP moves only this browser.
    const wholePool = pooled && which === 'toggle';
    const confirmed = await confirm({
      title: which === 'ip' ? 'Change the IP and Sign Out?' : 'Change the Proxy and Sign Out?',
      description: (
        <div className="space-y-2">
          <p>
            {which === 'ip'
              ? 'This browser moves to another of the organisation’s IPs and is signed out of '
              : 'Changing the route signs out '}
            {wholePool ? 'every browser in ' : ''}
            <span className="font-medium text-foreground">{login.name}</span>: its saved session is wiped,
            exactly like Log Out. The cookies were issued to the old IP, and sites that check for bots
            treat a session that turns up on a new IP as suspicious.
          </p>
          <p>
            <span className="font-medium text-destructive">
              Any agent runs using {wholePool ? 'these browsers' : 'this browser'} right now will fail mid-step.
            </span>{' '}
            The next run signs in fresh on the new route.
          </p>
        </div>
      ),
      confirmText: which === 'ip' ? 'Change IP and Sign Out' : 'Change and Sign Out',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setBusy(which);
    try {
      await setLoginProxy(orgId, login.id, patch);
      // Both halves, awaited: the login row (so the switch and IP reflect the
      // save) and the IP list (so the IP's details are current).
      await Promise.all([onSaved(), loadAccount()]);
      toast.success(ok);
    } catch (err) {
      toast.error(apiError(err) || 'Failed to update the proxy for this login');
    } finally {
      setBusy(null);
    }
  };

  const ips = account?.ips ?? [];
  const selectable = ips.filter((i) => i.available);
  const myIp = ips.find((i) => i.id === login.proxy_ip_id) ?? null;
  const changeIp = () => save('ip', { change_ip: true }, 'IP changed — signed out; the next run starts fresh on the new IP');

  // ── Credentials tab: this browser's IP, in a pool ──
  if (mode === 'browser') {
    if (!pooled || !login.proxy_enabled) return null;
    return (
      <Card className={cn('py-0', className)}>
        <CardContent className="p-5 space-y-3">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            This browser&apos;s proxy IP
            <InfoBubble>
              Every browser in the pool goes out through its own IP, given to it automatically and
              kept with its saved session. Change it when this IP keeps getting challenged or
              failing — the alert for a failing browser names the IP.
            </InfoBubble>
          </span>
          <IpLine ip={myIp} assigned={!!login.proxy_ip_id} busy={busy !== null} onChange={changeIp} />
        </CardContent>
      </Card>
    );
  }

  // ── Setup tab: the switch, and the IP when the login has one browser ──
  const canEnable = account?.configured === true && selectable.length > 0;
  return (
    <Card className={cn('py-0', className)}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <label className={`flex items-center gap-3 ${canEnable || login.proxy_enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
            {busy === 'toggle' ? (
              // Same 16px box as the checkbox, so the label does not shift.
              <span className="flex size-4 shrink-0 items-center justify-center">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </span>
            ) : (
            <Checkbox
              checked={login.proxy_enabled}
              disabled={busy !== null || (!canEnable && !login.proxy_enabled)}
              onCheckedChange={(v) => save(
                'toggle',
                { enabled: v === true },
                v === true ? 'Proxy on — signed out; the next run starts fresh through it' : 'Proxy off — signed out',
              )}
            />
            )}
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
                Route through a dedicated proxy IP
              </span>
              <span className="block text-xs text-muted-foreground">
                For sites that block datacentre addresses. Each browser gets its own home-ISP IP.
              </span>
            </span>
          </label>
          <InfoBubble>
            Each browser is given its own IP automatically — one no other browser of this login has,
            else the organisation&apos;s least-used — and keeps it with its saved session. Changing the
            route signs the browser out and wipes its saved session, like Log Out.
          </InfoBubble>
        </div>

        {account && !account.configured && (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            This organisation has no proxy account yet. An admin adds it under Agent settings →
            Residential Proxy, beside the Anthropic key.
          </p>
        )}
        {account?.configured && selectable.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            The proxy account has no reachable IPs. Refresh them under Agent settings → Residential Proxy.
          </p>
        )}

        {login.proxy_enabled && (
          <div className="space-y-2 border-t pt-4">
            {pooled ? (
              <p className="text-xs text-muted-foreground">
                Each browser in this pool has its own IP — see it, or change it, on that browser&apos;s
                <strong className="font-medium text-foreground"> Credentials</strong> tab.
              </p>
            ) : (
              <IpLine ip={myIp} assigned={!!login.proxy_ip_id} busy={busy !== null} onChange={changeIp} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
