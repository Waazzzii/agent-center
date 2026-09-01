'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  updateLogin, testLoginMfaPattern, testLoginGmailMfaPattern, listSlackChannels,
  type Login, type MfaTestResult, type SlackChannelMeta,
} from '@/lib/api/logins';
import { Field, CONTROL_W } from '@/components/actions/login-fields';
import { cn } from '@/lib/utils';

/**
 * Choosing where a login's 2FA code comes from.
 *
 * Self-contained — it owns its own draft state and saves itself — because the
 * alternative was threading four more fields plus a test result through a
 * 2200-line page's form state. The TOTP enrolment UI stays where it is; this
 * sits above it and decides whether it is shown at all.
 *
 * The Test button is the reason this is usable. A code pattern that cannot be
 * tried fails silently and late: the login script reaches the 2FA field, fills
 * blank, and the site answers "bad credentials" — so the operator goes looking
 * at the password. Trying the pattern against real channel traffic turns that
 * into a visible, immediate answer.
 */
export function MfaSourceSection({
  orgId, login, requiredByScript = false, scriptName = null, onSaved,
}: {
  orgId: string | null;
  login: Login;
  /**
   * The login script fills {{_mfa}}, so a source is not optional. Derived from
   * the script's steps by the parent — the script declares what it needs, the
   * same way it declares its credentials.
   */
  requiredByScript?: boolean;
  /** For naming the script in the explanation. */
  scriptName?: string | null;
  /** Called after a successful save so the parent can refetch. */
  onSaved?: () => void;
}) {
  const [source, setSource] = useState<Login['mfa_source']>(login.mfa_source ?? 'none');
  const [channelId, setChannelId] = useState(login.mfa_slack_channel_id ?? '');
  const [mailbox, setMailbox] = useState(login.mfa_gmail_mailbox ?? '');
  const [gmailQuery, setGmailQuery] = useState(login.mfa_gmail_query ?? '');
  const [pattern, setPattern] = useState(login.mfa_code_regex ?? '');
  const [timeout, setTimeoutSecs] = useState(String(login.mfa_timeout_seconds ?? 60));

  const [channels, setChannels] = useState<{ id: string; name: string; is_private: boolean; is_member: boolean | null }[]>([]);
  const [channelState, setChannelState] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [channelError, setChannelError] = useState<string | null>(null);
  // What Slack returned before filtering — the only thing that distinguishes
  // "no channels exist" from "they exist but none are readable".
  const [channelMeta, setChannelMeta] = useState<SlackChannelMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MfaTestResult | null>(null);

  // The enable dialog's own pending choice, kept apart from `source` so
  // cancelling leaves nothing changed.
  const [enableOpen, setEnableOpen] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<'totp' | 'slack' | 'gmail'>('totp');
  const [disableOpen, setDisableOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Re-sync when the parent refetches — otherwise a save elsewhere on the page
  // leaves these inputs showing stale values.
  useEffect(() => {
    setSource(login.mfa_source ?? 'none');
    setChannelId(login.mfa_slack_channel_id ?? '');
    setMailbox(login.mfa_gmail_mailbox ?? '');
    setGmailQuery(login.mfa_gmail_query ?? '');
    setPattern(login.mfa_code_regex ?? '');
    setTimeoutSecs(String(login.mfa_timeout_seconds ?? 60));
  }, [
    login.mfa_source, login.mfa_slack_channel_id, login.mfa_gmail_mailbox,
    login.mfa_gmail_query, login.mfa_code_regex, login.mfa_timeout_seconds,
  ]);

  const loadChannels = useCallback(async () => {
    // Guard on 'loading' only, NOT on 'idle'.
    //
    // The old guard was `channelState !== 'idle'`, which made the load
    // once-per-mount: after one attempt the state was 'loaded' forever, so a
    // failed or empty fetch was PERMANENT — reopening the dialog could not
    // retry, and only a full page reload cleared it. Combined with the error
    // being swallowed, one bad response pinned the dropdown to "No channels
    // available" indefinitely, long after the underlying problem was fixed.
    if (!orgId || channelState === 'loading') return;
    setChannelState('loading');
    const { channels: list, error, meta } = await listSlackChannels(orgId);
    setChannels(list);
    setChannelError(error);
    setChannelMeta(meta);
    // A failure returns to 'idle' so the next open tries again; only a clean
    // result is 'loaded'.
    setChannelState(error ? 'idle' : 'loaded');
  }, [orgId, channelState]);

  const dirty =
    source !== (login.mfa_source ?? 'none')
    || channelId !== (login.mfa_slack_channel_id ?? '')
    || mailbox !== (login.mfa_gmail_mailbox ?? '')
    || gmailQuery !== (login.mfa_gmail_query ?? '')
    || pattern !== (login.mfa_code_regex ?? '')
    || timeout !== String(login.mfa_timeout_seconds ?? 60);

  /**
   * Slack and Gmail are the same SHAPE of source: a message arrives after the
   * credentials are submitted, a pattern pulls the code out of it, and the login
   * waits for it. So the pattern field, the timeout, the Test button and the
   * Save button are shared, and only the "where do we look" fields differ.
   *
   * Branching every one of those on the source name instead would have meant
   * two copies of the pattern guidance to keep in step — and that guidance is
   * the part operators actually get wrong.
   */
  const isMessageSource = source === 'slack' || source === 'gmail';

  const slackIncomplete = source === 'slack' && (!channelId.trim() || !pattern.trim());
  const gmailIncomplete = source === 'gmail'
    && (!mailbox.trim() || !gmailQuery.trim() || !pattern.trim());
  const incomplete = slackIncomplete || gmailIncomplete;

  const handleSave = async () => {
    if (!orgId || incomplete) return;
    setSaving(true);
    try {
      await updateLogin(orgId, login.id, {
        mfa_source: source,
        // Only the ACTIVE source's fields are kept; the other's are cleared
        // rather than left behind to look configured while being inert. That
        // also keeps the DB completeness CHECK satisfiable when switching
        // between the two message sources.
        mfa_slack_channel_id: source === 'slack' ? channelId.trim() : null,
        mfa_gmail_mailbox:    source === 'gmail' ? mailbox.trim() : null,
        mfa_gmail_query:      source === 'gmail' ? gmailQuery.trim() : null,
        mfa_code_regex:       isMessageSource ? pattern.trim() : null,
        mfa_timeout_seconds: Number(timeout) || 60,
      });
      toast.success('Two-factor method saved');
      onSaved?.();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!orgId) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Sends the DRAFT values, not the stored ones, so a pattern can be proven
      // before it is committed.
      setTestResult(
        source === 'gmail'
          ? await testLoginGmailMfaPattern(orgId, login.id, {
              mailbox: mailbox.trim() || null,
              query: gmailQuery.trim() || null,
              pattern: pattern.trim() || null,
            })
          : await testLoginMfaPattern(orgId, login.id, {
              channelId: channelId.trim() || null,
              pattern: pattern.trim() || null,
            })
      );
    } finally {
      setTesting(false);
    }
  };

  /**
   * Turning 2FA on asks WHICH method before showing any form.
   *
   * The two forms have nothing in common — an authenticator secret versus a
   * channel and a pattern — so rendering both and letting the operator work out
   * which half applies was the wrong shape. Asking once, up front, means the tab
   * only ever shows the form that is actually in use.
   *
   * Defaults to the authenticator: it is the stronger option and by far the more
   * common one, so Slack should be a deliberate choice rather than an equal one.
   */
  const handleEnable = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      // Only the METHOD is persisted here. Slack needs a channel and a pattern
      // before it can be saved at all (the API refuses a half-configured
      // source), so that selection stays local until the form below is filled
      // in and saved.
      if (pendingMethod === 'totp') {
        await updateLogin(orgId, login.id, {
          mfa_source: 'totp',
          mfa_slack_channel_id: null,
          mfa_gmail_mailbox: null,
          mfa_gmail_query: null,
          mfa_code_regex: null,
        });
        onSaved?.();
      }
      setSource(pendingMethod);
      setEnableOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to enable two-factor');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Turning it off clears the Slack config as well as the method.
   *
   * Leaving a stale channel and pattern behind would be a trap for whoever reads
   * this next: it looks configured while being inert.
   */
  const handleDisable = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      await updateLogin(orgId, login.id, {
        mfa_source: 'none',
        mfa_slack_channel_id: null,
        mfa_gmail_mailbox: null,
        mfa_gmail_query: null,
        mfa_code_regex: null,
      });
      setSource('none');
      setChannelId('');
      setMailbox('');
      setGmailQuery('');
      setPattern('');
      setDisableOpen(false);
      toast.success('Two-factor disabled');
      onSaved?.();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to disable');
    } finally {
      setSaving(false);
    }
  };

  const enabled = source !== 'none';

  return (
    <div className="space-y-4">
      {/* Enabled/disabled first. Everything else is downstream of it, so a
          single switch is the honest control — a method dropdown sitting on a
          login with no second factor implies one is in use. */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Two-factor authentication</p>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? <>Supplies <code className="font-mono">{'{{_mfa}}'}</code> to the login script from{' '}
                  {source === 'totp' ? 'an authenticator secret' : 'a Slack channel'}.</>
              : requiredByScript
                ? <>Required{scriptName ? <> by <span className="font-medium">{scriptName}</span></> : null},
                    which fills <code className="font-mono">{'{{_mfa}}'}</code>. Pick a method below.</>
                : <>Off. Enable it only if the sign-in asks for a code — the login script does
                    not reference one.</>}
          </p>
        </div>
        {/* Locked on when the script asks for a code. Turning it off would not
            disable anything — the script would still reach the 2FA field and fill
            it blank — so offering the choice would be offering a way to break the
            login quietly. */}
        <Switch
          checked={enabled || requiredByScript}
          disabled={saving || requiredByScript}
          onCheckedChange={(v) => {
            if (v) { setPendingMethod('totp'); setEnableOpen(true); }
            else setDisableOpen(true);
          }}
          aria-label="Enable two-factor authentication"
        />
      </div>

      {/* Required but unset. Loud, because the run does not error — it fills an
          empty 2FA box and the site blames the password. */}
      {requiredByScript && !enabled && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              This login has no way to get a 2FA code, but its script fills one. Sign-ins
              will fail with what looks like a wrong password.
            </p>
            <button
              type="button"
              className="font-medium underline"
              onClick={() => { setPendingMethod('totp'); setEnableOpen(true); }}
            >
              Choose a method
            </button>
          </div>
        </div>
      )}

      {/* Configured but unused — the mirror image, and worth saying rather than
          leaving someone to wonder why their secret never gets read. */}
      {enabled && !requiredByScript && (
        <p className="text-[10px] text-muted-foreground">
          The login script does not reference <code className="font-mono">{'{{_mfa}}'}</code>,
          so this is stored but never read. Harmless — but if a 2FA step was expected,
          the script is missing it.
        </p>
      )}

      {enabled && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Method:</span>
          <span className="font-medium">
            {source === 'totp'  ? 'Authenticator app (TOTP)'
             : source === 'gmail' ? 'Code emailed to a mailbox'
             : 'Code posted to a Slack channel'}
          </span>
          <button
            type="button"
            className="text-brand hover:underline"
            onClick={() => { setPendingMethod(source); setEnableOpen(true); }}
          >
            Change
          </button>
        </div>
      )}

      {isMessageSource && (
        <div className="pl-3 space-y-3">
        {source === 'slack' && (
          <>
          {/* Stated once, at the point of decision. A channel of codes is a
              shared secret store with searchable history — worth knowing before
              wiring it up, not after. */}
          <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-snug">
            Invite the Slack bot to the channel or it cannot read the codes. Anyone who can
            read this channel can complete this login, and the codes are not
            held in the secret store. Keep the channel private and its membership small.
          </p>

          {/* The channel ID is the field, always, and it never changes shape.
              What we STORE is an id — the channel's name is not persisted
              anywhere — so an id is the only thing that can be rendered
              faithfully for a saved value. A dropdown as the primary control
              would have to either show a bare id with no name, or go and fetch
              the list on every render just to label one row.

              So: a text input that is always a text input, and a Select button
              that fetches the list on demand. Loading happens inside a dialog the
              operator opened deliberately, which is the only place a spinner is
              not a surprise. */}
          <Field
            label="Channel ID"
            required
            info="Where the codes arrive. Paste the id, or use Select to look it up — the picker lists private channels the Slack bot has been added to, since a channel carrying 2FA codes should not be public. A public channel id still works if you paste it."
          >
            <div className={cn('flex items-center gap-2', CONTROL_W)}>
              <Input
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="C0123ABCDEF"
                className="font-mono text-xs flex-1 min-w-0"
              />
              <Button
                type="button" variant="outline" size="sm"
                className="shrink-0"
                onClick={() => { setPickerOpen(true); void loadChannels(); }}
              >
                Select…
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground pt-1">
              In Slack: right-click the channel → View channel details → the id is at the
              bottom.
            </p>
          </Field>

          </>
        )}

        {source === 'gmail' && (
          <>
          {/* Same warning as Slack, sharpened for the difference that matters:
              a channel is scoped to itself, a mailbox is not. The query narrows
              what is FETCHED, it is not a permission boundary — the delegation
              grants the whole inbox. */}
          <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-snug">
            This grants read access to the whole mailbox, not just the matching mail —
            the search below narrows what is fetched, it does not limit what could be.
            Point it at a dedicated alias that receives nothing else, never a person&apos;s
            inbox.
          </p>

          <Field
            label="Mailbox"
            required
            info="The address whose inbox receives the codes. Gmail signs in AS this mailbox, so it must be a real account in your Google Workspace with domain-wide delegation granted to the service account."
          >
            <Input
              value={mailbox}
              onChange={(e) => setMailbox(e.target.value)}
              placeholder="2fa-codes@yourcompany.com"
              className={cn('font-mono text-xs', CONTROL_W)}
            />
          </Field>

          <Field
            label="Search query"
            required
            info={<>Gmail search syntax, the same as the search box in Gmail. This picks the MESSAGE; the pattern below pulls the code out of it.</>}
          >
            <Input
              value={gmailQuery}
              onChange={(e) => setGmailQuery(e.target.value)}
              placeholder="from:noreply@vendor.com subject:code"
              className={cn('font-mono text-xs', CONTROL_W)}
            />
            <p className="text-[10px] text-muted-foreground pt-1">
              Narrow this to the sender that issues codes. Left broad, the newest matching
              mail wins — which on a busy mailbox may be something else entirely, and the
              site would only report a bad code.
            </p>
          </Field>
          </>
        )}

          <Field
            label="Code pattern"
            required
            info={<>Regular expression that pulls the code out of the message. Capture group 1 if you use one, otherwise the whole match.</>}
          >
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={String.raw`verification code is\s*(\d{4,8})`}
              className={cn('font-mono text-xs', CONTROL_W)}
            />
            <p className="text-[10px] text-muted-foreground pt-1">
              Anchor on the words around the code, not the digits alone. A bare
              four-digit pattern will match a phone number or a year earlier in the
              message — the first match wins, so it would submit the wrong code and
              the site would only say bad credentials.
            </p>
          </Field>

          <Field
            label="Wait up to"
            info="The code does not exist until the site sends it, so the login waits for it to arrive. Give the vendor enough time without stalling a failed login forever."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number" min={5} max={600}
                value={timeout}
                onChange={(e) => setTimeoutSecs(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
          </Field>

          {/* Test */}
          <div className="space-y-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={handleTest}
              disabled={
                testing
                || !pattern.trim()
                || (source === 'slack' ? !channelId.trim() : !mailbox.trim() || !gmailQuery.trim())
              }
            >
              {testing
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
              {source === 'gmail' ? 'Test against recent mail' : 'Test against recent messages'}
            </Button>

            {testResult && (
              <div className="rounded-md border p-3 space-y-2">
                {!testResult.ok ? (
                  <p className="flex items-start gap-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {testResult.error}
                  </p>
                ) : (
                  <>
                    <p className={cn(
                      'flex items-center gap-2 text-xs',
                      testResult.matched ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500',
                    )}>
                      {testResult.matched
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                      Matched {testResult.matched} of {testResult.scanned} recent message(s)
                    </p>
                    {testResult.matched === 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {source === 'gmail'
                          ? (testResult.scanned === 0
                              // Two different failures, and they look identical
                              // unless the counts are read separately: nothing
                              // fetched means the QUERY is wrong; fetched but
                              // unmatched means the PATTERN is.
                              ? 'The mailbox read fine but the search matched no mail — check the query, not the pattern.'
                              : 'The search found mail but the pattern matched none of it — check the pattern, not the query.')
                          : 'The channel read fine, so this is the pattern rather than the connection — or no code has been posted recently.'}
                      </p>
                    )}
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {testResult.messages?.map((m) => (
                        <li key={m.ts ?? m.id} className="flex items-center gap-2 text-[11px]">
                          <span className={cn(
                            'font-mono shrink-0 w-16',
                            m.matched ? 'text-emerald-600 dark:text-emerald-500' : 'text-muted-foreground/50',
                          )}>
                            {/* Masked on the server — enough to prove extraction
                                worked, not enough to be a code store. */}
                            {m.matched ? m.code_preview : '—'}
                          </span>
                          <span className="text-muted-foreground truncate">{m.excerpt}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* One save, and only for the Slack fields. The method itself is committed
          by the dialog, and the authenticator secret by its own enrolment
          control — so nothing here duplicates either. */}
      {isMessageSource && (dirty || incomplete) && (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={saving || incomplete}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {source === 'gmail' ? 'Save Gmail settings' : 'Save Slack settings'}
          </Button>
          {incomplete && (
            <span className="text-[10px] text-muted-foreground">
              {source === 'gmail'
                ? 'Fill the mailbox, query and pattern first — a half-configured source fills the 2FA field blank.'
                : 'Pick a channel and a pattern first — a half-configured source fills the 2FA field blank.'}
            </span>
          )}
        </div>
      )}

      {/* Channel lookup. A dialog rather than an inline reveal so the fetch and
          its spinner live somewhere the operator asked for them, instead of
          changing the shape of a field they were already reading. */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select a channel</DialogTitle>
            <DialogDescription>
              Only channels the Slack bot has been added to appear here — it cannot read
              any others.
            </DialogDescription>
          </DialogHeader>

          {channelState === 'loading' ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading the channel list from Slack…
            </div>
          ) : channelError ? (
            <div className="space-y-2 py-4">
              <p className="text-sm">Could not read the channel list.</p>
              <p className="text-xs text-muted-foreground font-mono break-all">{channelError}</p>
              <p className="text-xs text-muted-foreground">
                Paste the channel id directly instead — it is stored the same way. Closing and
                reopening this dialog retries.
              </p>
            </div>
          ) : channels.length === 0 ? (
            <div className="space-y-2 py-4">
              <p className="text-sm">No channels available.</p>
              {/* Name the actual cause instead of listing every possibility.
                  Slack answers 200 with a full list and we filter it to the
                  channels the bot can really read — so "returned 14, kept 0"
                  and "returned 0" are completely different problems that
                  produced an identical empty box. The counts decide it. */}
              {channelMeta && channelMeta.returned > 0 ? (
                channelMeta.private === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Slack returned {channelMeta.returned} channel(s), none of them private. Only
                    private channels are offered here, and Slack returns one only when the bot
                    belongs to it AND the token carries{' '}
                    <code className="font-mono">groups:read</code> — it omits them silently
                    rather than refusing, so that scope is the first thing to check.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Slack returned {channelMeta.private} private channel(s) but none could be
                    offered. That should not happen — paste the id directly and report it.
                  </p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  Slack returned no channels at all. Invite the bot to the private channel the
                  codes arrive in, and check the token carries{' '}
                  <code className="font-mono">groups:read</code>. You can paste the id directly
                  instead.
                </p>
              )}
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {channels.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors',
                      c.id === channelId && 'bg-muted',
                    )}
                    onClick={() => { setChannelId(c.id); setPickerOpen(false); }}
                  >
                    {/* Id first, name in brackets — the id is what gets stored and
                        what the field shows, so it is the thing to recognise. */}
                    <span className="font-mono text-xs">{c.id}</span>
                    <span className="text-xs text-muted-foreground"> ({c.is_private ? '🔒 ' : '#'}{c.name})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Method chooser */}
      <Dialog open={enableOpen} onOpenChange={(o) => { if (!o && !saving) setEnableOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How does this login receive its code?</DialogTitle>
            <DialogDescription>
              The login script is identical either way — it fills{' '}
              <code className="font-mono">{'{{_mfa}}'}</code> and does not know the source.
            </DialogDescription>
          </DialogHeader>

          <Select value={pendingMethod} onValueChange={(v) => setPendingMethod(v as 'totp' | 'slack' | 'gmail')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="totp">Authenticator app (TOTP)</SelectItem>
              <SelectItem value="gmail">Code emailed to a mailbox</SelectItem>
              <SelectItem value="slack">Code posted to a Slack channel</SelectItem>
            </SelectContent>
          </Select>

          {pendingMethod === 'totp' ? (
            <p className="text-xs text-muted-foreground">
              You will paste or scan the site&apos;s setup key next. Stronger than either
              message route, because the secret stays in the secret store.
            </p>
          ) : pendingMethod === 'gmail' ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              For sites that will not issue a setup key and email the code instead. Reads a
              mailbox you name — use a dedicated alias, since this grants access to
              everything in that inbox.
            </p>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              For sites that will not issue a setup key and text or email the code instead.
              Anyone who can read the channel can complete this login, so keep it private.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnableOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleEnable} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable confirm — destructive enough to ask, since it silently breaks
          every agent that signs in with this login. */}
      <Dialog open={disableOpen} onOpenChange={(o) => { if (!o && !saving) setDisableOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn off two-factor?</DialogTitle>
            <DialogDescription>
              Any login script that fills a 2FA field will start failing, and the stored
              channel, mailbox, query and pattern are cleared. An enrolled authenticator
              secret is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisable} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
