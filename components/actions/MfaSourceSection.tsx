'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, FlaskConical, ShieldCheck, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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
  orgId, login, requiredByScript = false, scriptName = null, onSaved, onSourceChange,
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
  /**
   * The source currently SELECTED, saved or not.
   *
   * The parent renders the authenticator-enrolment form beside this section
   * and used to gate it on the persisted login.mfa_source — so picking
   * "Authenticator" appeared to do nothing until the source was saved, and the
   * form only showed up after a round trip nobody knew to make. It read as a
   * missing form rather than an unsaved one.
   */
  onSourceChange?: (source: Login['mfa_source']) => void;
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

  useEffect(() => { onSourceChange?.(source); }, [source, onSourceChange]);

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
      const saved = await updateLogin(orgId, login.id, {
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
      // The save landed either way. When the script still fills {{_mfa}} the
      // backend says so, and that is worth more than a success tick — it is
      // the only place the resulting failure mode gets named before it happens.
      if (saved?.warning) {
        toast.warning('Two-factor removed', { description: saved.warning, duration: 12_000 });
      } else {
        toast.success('Two-factor disabled');
      }
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
      {/* One dropdown, "None" included.
          There was a switch here as well, on the reasoning that a method
          dropdown on a login with no second factor implies one is in use. But
          "None" IS a method — it is the answer for most logins — and a switch
          plus a method row meant two controls for one decision, with the second
          only appearing after the first was flipped.

          The icon matches the Login section above so the two read as siblings
          rather than as a subsection of credentials. */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-brand" />
          Two-factor authentication
        </Label>

        <Select
          value={source ?? 'none'}
          disabled={saving}
          onValueChange={(v) => {
            const next = v as Login['mfa_source'];
            if (next === source) return;
            // Both paths keep their confirmation. Turning it off clears stored
            // fields, and turning it on has setup to do — neither is a thing to
            // apply silently on a dropdown change.
            //
            // Deferred by a tick. Both Select and Dialog are Radix dismissable
            // layers, and both set `pointer-events: none` on <body> while open,
            // restoring it on teardown (see react-dismissable-layer). Opening
            // one from inside the other's close handler interleaves those two
            // lifecycles in the same commit, which is a long-standing source of
            // a dead page or an unclickable dialog. These dialogs were opened
            // by a Switch and a button until this control became a Select, so
            // the interleaving is new. A macrotask keeps them sequential — it
            // costs nothing and removes the class of problem rather than
            // relying on the ordering happening to work out.
            setTimeout(() => {
              if (next === 'none') setDisableOpen(true);
              else { setPendingMethod(next as 'totp' | 'slack' | 'gmail'); setEnableOpen(true); }
            }, 0);
          }}
        >
          <SelectTrigger className="max-w-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            {/* Selectable even when the script fills {{_mfa}}.
                It was disabled, on the reasoning that removing the source
                cannot stop the script reaching the 2FA field. True — but every
                login that HAS a second factor also has a script that fills one,
                so the option was greyed out on exactly the logins where someone
                would reach for it, with nothing to say why. That reads as a
                broken control, not as a guard rail.
                The warning belongs in the confirmation, where it can explain
                itself, so that is where it went. */}
            <SelectItem value="none">No two-factor</SelectItem>
            <SelectItem value="totp">Authenticator app (TOTP)</SelectItem>
            <SelectItem value="gmail">Code emailed to a mailbox</SelectItem>
            <SelectItem value="slack">Code posted to a Slack channel</SelectItem>
          </SelectContent>
        </Select>

        {/* Only when the setting and the script AGREE, and only then because
            the warnings below already cover every case where they do not.
            This used to render in all four combinations, so the two mismatch
            states said the same thing twice — once here in grey and again in
            the warning underneath.
            Of the agreeing states only one is worth a remark: "2FA on and the
            script uses it" is the state you want and nothing else confirms it.
            "No 2FA and the script never asks" is the default for most logins —
            the dropdown already reads "No two-factor". */}
        {enabled && requiredByScript && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <KeyRound className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>
              Supplies <code className="font-mono">{'{{_mfa}}'}</code> to{' '}
              {scriptName ? <span className="font-medium">{scriptName}</span> : 'the login script'}
              {' '}from {source === 'totp' ? 'an authenticator secret'
                       : source === 'gmail' ? 'a mailbox' : 'a Slack channel'}.
            </span>
          </p>
        )}
      </div>

      {/* The two ways the setting and the script can disagree. Both are
          WARNINGS, not blocks — the script is editable and so is this, and
          which one is wrong depends on what the site actually does. Guessing
          on the operator's behalf is what made "No two-factor" unselectable
          on every login that had 2FA. */}

      {/* Script asks, nothing supplies. Loud, because the run does not report a
          2FA error: the field fills blank and the site blames the password. */}
      {requiredByScript && !enabled && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              <strong>Sign-ins will fail.</strong> The script fills{' '}
              <code className="font-mono">{'{{_mfa}}'}</code> but no source is set, so it will
              fill blank and the site will answer &ldquo;wrong password&rdquo;. Either pick a
              source, or remove the 2FA step from the script if the site no longer asks.
            </p>
          </div>
        </div>
      )}

      {/* Supplied, nothing asks. The mirror image and much milder — stored and
          never read costs nothing, but it usually means a script that was
          expected to have a 2FA step does not. */}
      {enabled && !requiredByScript && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/40 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>Configured but unused.</strong> The script never references{' '}
            <code className="font-mono">{'{{_mfa}}'}</code>, so this is stored and never read.
            Harmless — but if the sign-in does ask for a code, the script is missing that step.
          </span>
        </div>
      )}

      {isMessageSource && (
        <div className="pl-3 space-y-3">
        {source === 'slack' && (
          <>
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
            info="Where the codes arrive. The Slack bot must be invited to the channel or it cannot read them. Paste the id, or use Select to look it up — the picker lists private channels the bot has been added to, since a channel carrying 2FA codes should not be public. A public channel id still works if you paste it. To find an id in Slack: right-click the channel, View channel details, and it is at the bottom."
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
          </Field>

          </>
        )}

        {source === 'gmail' && (
          <>
          {/* Same warning as Slack, sharpened for the difference that matters:
              a channel is scoped to itself, a mailbox is not. The query narrows
              what is FETCHED, it is not a permission boundary — the delegation
              grants the whole inbox. */}
          <Field
            label="Mailbox"
            required
            info="The address whose inbox receives the codes. Gmail signs in AS this mailbox, so it must be a real account in your Google Workspace with domain-wide delegation granted to the service account. This grants read access to the WHOLE mailbox — the search query narrows what is fetched, not what could be — so use a dedicated alias rather than a person’s inbox."
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
            info={<>Gmail search syntax, the same as the search box in Gmail. This picks the MESSAGE; the pattern below pulls the code out of it. Narrow it to the sender that issues codes — the newest match wins.</>}
          >
            <Input
              value={gmailQuery}
              onChange={(e) => setGmailQuery(e.target.value)}
              placeholder="from:noreply@vendor.com subject:code"
              className={cn('font-mono text-xs', CONTROL_W)}
            />
          </Field>
          </>
        )}

          <Field
            label="Code pattern"
            required
            info={<>Regular expression that pulls the code out of the message. Capture group 1 if you use one, otherwise the whole match. Anchor it on the words around the code rather than the digits alone — the first match wins.</>}
          >
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={String.raw`verification code is\s*(\d{4,8})`}
              className={cn('font-mono text-xs', CONTROL_W)}
            />
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
          {/* No sentence beside the button. It restated which fields were
              empty, next to required fields that are already marked, under a
              Save that is already disabled — three signals for one fact. */}
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

      {/* Confirmation, not a second chooser.
          The method has already been picked in the dropdown above; this says
          what that choice means and gives a way back out. It used to repeat the
          Select, which meant two dropdowns for one decision. */}
      <Dialog open={enableOpen} onOpenChange={(o) => { if (!o && !saving) setEnableOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingMethod === 'totp' ? 'Use an authenticator app?'
               : pendingMethod === 'gmail' ? 'Read the code from a mailbox?'
               : 'Read the code from a Slack channel?'}
            </DialogTitle>
            <DialogDescription>
              The login script is identical either way — it fills{' '}
              <code className="font-mono">{'{{_mfa}}'}</code> and does not know the source.
            </DialogDescription>
          </DialogHeader>

          {/* One line each. The dialog is a confirmation, not a comparison —
              the trade-offs between the three belong wherever someone is
              choosing, and they have already chosen by the time this opens. */}
          {pendingMethod === 'totp' ? (
            <p className="text-xs text-muted-foreground">
              You will paste or scan the site&apos;s setup key next.
            </p>
          ) : pendingMethod === 'gmail' ? (
            <p className="text-xs text-muted-foreground">
              You will name a mailbox and a search that finds the code email.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              You will name the Slack channel the codes arrive in.
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
            <DialogTitle>Remove two-factor from this login?</DialogTitle>
            <DialogDescription>
              The stored channel, mailbox, query and pattern are cleared. An enrolled
              authenticator secret is kept, so re-enabling does not mean re-enrolling.
            </DialogDescription>
          </DialogHeader>

          {/* The specific consequence, when we know the script asks for a code.
              Not a generic "any script that fills 2FA" — this names the script
              and says what the failure will look like, because it does NOT look
              like a 2FA error: the field fills blank and the site blames the
              password. */}
          {requiredByScript ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Sign-ins will break.</strong>{' '}
                {scriptName ? <><span className="font-medium">{scriptName}</span> fills</> : 'This login’s script fills'}{' '}
                <code className="font-mono">{'{{_mfa}}'}</code>, and with no source it will fill
                blank — the site answers &ldquo;wrong password&rdquo; and the real cause is
                invisible. Remove the 2FA step from the script too, or pick another source.
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              This login&apos;s script does not fill <code className="font-mono">{'{{_mfa}}'}</code>,
              so nothing depends on it.
            </p>
          )}
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
