'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { createLogin, updateLogin } from '@/lib/api/logins';
import { listScripts, type BrowserScript } from '@/lib/api/scripts';
import {
  getAgentAccessGroups,
  setLoginAccessGroups,
  type AgentAccessGroup,
} from '@/lib/api/agent-access-groups';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Loader2, LogIn, Save } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { RunScriptModal } from '@/components/record/RunScriptModal';
import {
  Field, ScriptSlot, PendingSection, CONTROL_W,
} from '@/components/actions/login-fields';
import { cn } from '@/lib/utils';

/**
 * Create a login profile.
 *
 * Deliberately the same shape as the edit page rather than a cut-down form. The
 * reason is concrete, not cosmetic: a login cannot be saved without a verify
 * script, and the old create form could only PICK one from a list. Setting up
 * the first login of a kind therefore meant leaving the page, recording a script
 * somewhere else, and coming back — and the list it offered was empty, which
 * reads as broken rather than as "record one".
 *
 * So both script slots are here, each able to record inline (ScriptSlot falls
 * back to a single Record button when nothing exists yet).
 *
 * What genuinely cannot be here: credentials, 2FA enrolment and run history all
 * key off a login id that does not exist until the first save. Those are shown
 * as pending sections rather than hidden, so the whole shape of what is being
 * set up is visible — hiding them is what made creation feel like a lesser form
 * of editing.
 */
export default function CreateLoginPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [verifyScriptId, setVerifyScriptId] = useState<string | null>(null);
  const [loginScriptId, setLoginScriptId] = useState<string | null>(null);

  const [verifyScripts, setVerifyScripts] = useState<BrowserScript[]>([]);
  const [loginScripts, setLoginScripts] = useState<BrowserScript[]>([]);
  const [allGroups, setAllGroups] = useState<AgentAccessGroup[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const [recordVerifyOpen, setRecordVerifyOpen] = useState(false);
  const [recordLoginOpen, setRecordLoginOpen] = useState(false);
  const [editScript, setEditScript] = useState<BrowserScript | null>(null);

  const loadScripts = useCallback(async () => {
    if (!selectedOrgId) return;
    // Each slot only accepts its own kind (migration 283), so they are fetched
    // separately rather than filtered client-side.
    const [verify, login] = await Promise.all([
      listScripts(selectedOrgId, { kinds: ['login_verify'] }).catch(() => ({ scripts: [] })),
      listScripts(selectedOrgId, { kinds: ['login'] }).catch(() => ({ scripts: [] })),
    ]);
    setVerifyScripts(verify.scripts ?? []);
    setLoginScripts(login.scripts ?? []);
    return { verify: verify.scripts ?? [], login: login.scripts ?? [] };
  }, [selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId) return;
    getAgentAccessGroups(selectedOrgId).then(setAllGroups).catch(() => {});
    void loadScripts();
  }, [selectedOrgId, loadScripts]);

  /**
   * After recording, select what was just made.
   *
   * The modal reports "saved" without saying which script that was, so the
   * newest row of the right kind is the best available answer — and it is
   * reliable here because recording is the only thing that could have created
   * one in the last few seconds.
   */
  const selectNewest = async (kind: 'login_verify' | 'login') => {
    const fresh = await loadScripts();
    const list = kind === 'login_verify' ? fresh?.verify : fresh?.login;
    if (!list?.length) return;
    const newest = [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    if (kind === 'login_verify') setVerifyScriptId(newest.id);
    else setLoginScriptId(newest.id);
  };

  const handleSave = async () => {
    if (!selectedOrgId || !verifyScriptId) return;
    setSaving(true);
    try {
      const created = await createLogin(selectedOrgId, {
        name: name.trim(),
        url: url.trim(),
        verify_script_id: verifyScriptId,
      });

      // The login script is a separate PATCH: createLogin only accepts the
      // three required fields. Failing here would leave a usable login with no
      // auto-login, so it is reported rather than swallowed — but it does not
      // undo the create, since the row is otherwise fine.
      if (loginScriptId) {
        await updateLogin(selectedOrgId, created.id, { auto_login_script_id: loginScriptId })
          .catch(() => toast.error('Login created, but the login script could not be attached'));
      }
      if (groupIds.length > 0) {
        await setLoginAccessGroups(selectedOrgId, created.id, groupIds).catch(() => {});
      }

      toast.success('Login created');
      // Straight to the edit page: credentials and 2FA are the obvious next
      // step and only exist once there is a row to hang them on.
      router.push(`/actions/logins/${created.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to create login');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) return <NoPermissionContent />;

  const canSave = !!name.trim() && !!url.trim() && !!verifyScriptId && !saving;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <LogIn className="h-5 w-5 text-brand" /> New Login
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              A reusable authenticated browser profile that agents run inside
            </p>
          </div>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              : <Save className="h-3.5 w-3.5 mr-1" />}
            Create
          </Button>
        </div>

        {/* ── Basics + scripts ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <Field label="Name" required info="How this login appears wherever an agent action picks one.">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AirBnB — Scottsdale"
                className={cn(CONTROL_W)}
              />
            </Field>

            <Field
              label="Login URL"
              required
              info="Where a manual login opens in the browser. Agents never use this — they follow the login script."
            >
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://app.example.com/login"
                className={cn('font-mono text-xs', CONTROL_W)}
              />
            </Field>

            <ScriptSlot
              label="Verify script"
              required
              info={<>Proves the session is signed in. A clean run means logged in; any step failure or timeout means not. Required — without it nothing can tell whether this login still works.</>}
              scripts={verifyScripts}
              value={verifyScriptId}
              onChange={setVerifyScriptId}
              onRecord={() => setRecordVerifyOpen(true)}
              onEdit={(s) => setEditScript(s)}
              recordLabel="Record verify script"
              emptyHint="Record something that only appears once signed in."
            />

            <ScriptSlot
              label="Login script"
              info={<>Fills the sign-in form and submits. Every <code className="font-mono">{'{{variable}}'}</code> it declares becomes a credential you fill in after saving.</>}
              scripts={loginScripts}
              value={loginScriptId}
              onChange={setLoginScriptId}
              onRecord={() => setRecordLoginOpen(true)}
              onEdit={(s) => setEditScript(s)}
              recordLabel="Record login script"
              emptyHint="Record the sign-in once; agents replay it."
              allowNone
              noneLabel="— None (manual login only) —"
            />
          </CardContent>
        </Card>

        {/* ── Waiting on a saved row ───────────────────────────────────── */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <PendingSection
              title="Credentials"
              description="Rows come from the login script's declared variables, and the values are stored encrypted against this login. Available as soon as it is created."
            />
            <PendingSection
              title="Two-factor"
              description="Choose how the 2FA code is obtained — an authenticator secret, or read from a Slack channel. Configured on the login once it exists."
            />
            <PendingSection
              title="Login history"
              description="Verify runs, manual logins and auto-login tests appear here after the first save."
            />
          </CardContent>
        </Card>

        {/* ── Access groups — no row needed, applied right after create ── */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <Label>Access groups</Label>
            <p className="text-xs text-muted-foreground">
              Only members of the selected groups can complete this login when an agent
              pauses for a human. Leave empty for anyone.
            </p>
            <MultiSelectTags
              options={allGroups.map((g) => ({ value: g.id, label: `${g.name} (${g.member_count})` }))}
              selected={groupIds}
              onChange={setGroupIds}
              placeholder="Select access groups..."
            />
          </CardContent>
        </Card>

        {/* Recording — ownerLoginId is omitted because there is no login yet.
            The script is created standalone and attached by the save below. */}
        <RunScriptModal
          mode="record"
          recordKind="login_verify"
          script={null}
          orgId={selectedOrgId}
          open={recordVerifyOpen}
          onClose={() => setRecordVerifyOpen(false)}
          onSaved={() => void selectNewest('login_verify')}
        />
        <RunScriptModal
          mode="record"
          recordKind="login"
          script={null}
          orgId={selectedOrgId}
          open={recordLoginOpen}
          onClose={() => setRecordLoginOpen(false)}
          onSaved={() => void selectNewest('login')}
        />
        <RunScriptModal
          script={editScript}
          orgId={selectedOrgId}
          open={!!editScript}
          onClose={() => setEditScript(null)}
          onSaved={() => void loadScripts()}
        />
      </div>
    </TooltipProvider>
  );
}
