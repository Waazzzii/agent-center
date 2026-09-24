'use client';

/**
 * components/logins/ProxyCard.tsx
 *
 * Whether this login goes out through the organisation's dedicated proxy, and
 * which of its IPs.
 *
 * The account and its IPs are the organisation's — entered once in Agent
 * settings, where saving discovers the IPs and where each one is. Here a login
 * just picks one. There is no one-IP-per-login rule: a company legitimately
 * runs its AirBnB, Booking.com and VRBO logins from the same connection, so the
 * picker shows how many logins already use each IP rather than hiding it.
 *
 * TWO MODES, BECAUSE THE TWO HALVES LIVE ON DIFFERENT TABS
 *
 *   mode="login"   (Setup tab)  — the on/off switch, which is always the
 *     login's. Plus the IP whenever the IP is ALSO the login's: an unpooled
 *     login, or a pool sharing one set of credentials (one account, one home).
 *     Editable from any browser's page — it is saved to the login.
 *
 *   mode="browser" (Credentials tab) — only this browser's IP, and only in a pool
 *     with SEPARATE credentials, where each browser is a different account and
 *     picks its own. Renders nothing otherwise.
 *
 * This mirrors the data exactly: proxy_enabled always follows the parent;
 * proxy_ip_id follows the credential mode.
 */

import { useEffect, useState } from 'react';
import { Globe2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Login, ProxyIpOption } from '@/lib/api/logins';
import { setLoginProxy, getProxyAccountConfigured } from '@/lib/api/logins';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoBubble } from '@/components/actions/login-fields';

function apiError(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;
}

/** "Palo Alto, California" — whatever the lookup could say. */
function where(ip: ProxyIpOption): string {
  return [ip.city, ip.region].filter(Boolean).join(', ') || ip.country || 'Location unknown';
}

function IpPicker({
  ips, value, disabled, saving, onChange,
}: {
  ips: ProxyIpOption[];
  value: string | null;
  disabled: boolean;
  /** Shows a spinner BESIDE the select — inline, so nothing below it moves. */
  saving: boolean;
  onChange: (id: string) => void;
}) {
  const current = ips.find((i) => i.id === value) ?? null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
      <Select value={value ?? ''} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger className="w-full max-w-md">
          <SelectValue placeholder="Choose an IP">
            {current && (
              <span className="flex items-center gap-2">
                <span className="font-mono">{current.ip}</span>
                <span className="text-muted-foreground">· {where(current)}</span>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {ips.map((ip) => (
            <SelectItem key={ip.id} value={ip.id} disabled={!ip.available}>
              <span className="font-mono">{ip.ip}</span>
              <span className="ml-3 text-xs text-muted-foreground">
                {where(ip)}{ip.isp ? ` · ${ip.isp}` : ''}
                {!ip.available ? ' · not reachable'
                  : ip.logins_using > 0 ? ` · ${ip.logins_using} login${ip.logins_using === 1 ? '' : 's'}` : ''}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {!value && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          No IP chosen — this cannot launch through the proxy until it has one.
        </p>
      )}
      {current && !current.available && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {current.ip} is no longer reachable on the proxy account. Choose another IP.
        </p>
      )}
    </div>
  );
}

/**
 * The org's proxy account as last fetched, so the card mounts already knowing
 * its IPs. Stepping between browsers remounts the page; without this the IP
 * picker showed "Choose an IP" for a moment on every step, then snapped to
 * the saved one.
 */
const accountCache = new Map<string, { configured: boolean; ips: ProxyIpOption[] }>();

export function ProxyCard({
  mode,
  orgId,
  login,
  pooled,
  sharedCredentials,
  onSaved,
  className,
}: {
  mode: 'login' | 'browser';
  orgId: string;
  /** The browser whose page this is. */
  login: Login;
  pooled: boolean;
  sharedCredentials: boolean;
  onSaved: () => void | Promise<void>;
  className?: string;
}) {
  const [account, setAccount] = useState<{ configured: boolean; ips: ProxyIpOption[] } | null>(
    () => accountCache.get(orgId) ?? null,
  );
  // WHICH control is saving, so the spinner sits in that control's place:
  // the switch's spinner replaces the checkbox, the IP's sits beside the
  // select. A spinner on a line of its own grew the card by a row while it
  // spun and shrank it again after — the bounce this replaced.
  const [busy, setBusy] = useState<'toggle' | 'ip' | null>(null);

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
    setBusy(which);
    try {
      await setLoginProxy(orgId, login.id, patch);
      // Both halves, awaited: the login row (so the switch and picker reflect
      // the save) and the IP list (so "N logins" counts move with it).
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
  const perBrowserIp = pooled && !sharedCredentials;

  // ── Credentials tab: this browser's own IP, separate-credentials pools only ──
  if (mode === 'browser') {
    if (!perBrowserIp || !login.proxy_enabled) return null;
    return (
      <Card className={className}>
        <CardContent className="p-5 space-y-3">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            This browser&apos;s proxy IP
            <InfoBubble>
              Each browser in this pool signs in with its own account, so each goes out through
              its own IP. The proxy is switched on for the whole login under Setup.
            </InfoBubble>
          </span>
          <IpPicker
            ips={ips}
            value={login.proxy_ip_id}
            disabled={busy !== null}
            saving={busy === 'ip'}
            onChange={(v) => save('ip', { ip_id: v }, 'IP changed — takes effect on the next run')}
          />
        </CardContent>
      </Card>
    );
  }

  // ── Setup tab: the switch, and the IP when it is the login's ──
  const canEnable = account?.configured === true && selectable.length > 0;
  return (
    <Card className={className}>
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
                // Switching on with no IP yet: give it the first one, so the
                // login is never left enabled-but-unroutable.
                v === true
                  ? { enabled: true, ...(login.proxy_ip_id || perBrowserIp ? {} : { ip_id: selectable[0]?.id ?? null }) }
                  : { enabled: false },
                v === true ? 'Proxy on — takes effect on the next run' : 'Proxy off',
              )}
            />
            )}
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
                Route through a dedicated proxy IP
              </span>
              <span className="block text-xs text-muted-foreground">
                For sites that block datacentre addresses. Traffic comes from one fixed home-ISP IP.
              </span>
            </span>
          </label>
          <InfoBubble>
            Changes take effect on the next run — a browser already open on the old route is
            restarted rather than reused. Several logins can share one IP.
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
            {perBrowserIp ? (
              <p className="text-xs text-muted-foreground">
                Each browser in this pool has its own account, so each picks its own IP on the
                <strong className="font-medium text-foreground"> Credentials</strong> tab.
              </p>
            ) : (
              <>
                <span className="text-[11px] font-medium text-muted-foreground">
                  IP{pooled ? ' — shared by every browser in this pool' : ''}
                </span>
                <IpPicker
                  ips={ips}
                  value={login.proxy_ip_id}
                  disabled={busy !== null}
                  saving={busy === 'ip'}
                  onChange={(v) => save('ip', { ip_id: v }, 'IP changed — takes effect on the next run')}
                />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
