'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CircleDot, KeyRound, ArrowLeft } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { ScriptsList } from '@/components/record/ScriptsList';
import { RunScriptModal } from '@/components/record/RunScriptModal';

/**
 * Login scripts — the same page as Browser Skills, pointed at a different pool.
 *
 * Deliberately the same table, search, sort and delete guard rather than a
 * bespoke manager: a login script is a browser script, and the only thing that
 * differs is which kind is listed and the wording around it. The one column
 * that does not apply (Login Required?) already renders "—" for any non-regular
 * kind, because a script that performs the sign-in cannot itself require one.
 *
 * Not in the nav. It is reached from a login, which is where the question
 * "which script signs this in?" actually comes up — and it is a pool, not a
 * per-login list, so it does not live under /logins/[id].
 *
 * Deleting is guarded the same way it is for business scripts: the API refuses
 * while a login still points at the script (the FK is ON DELETE RESTRICT), and
 * the confirm dialog says which logins are in the way.
 */
export default function LoginScriptsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');

  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [scriptsRefreshKey, setScriptsRefreshKey] = useState(0);

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">

      {/* recordKind='login' — without it the recording saves as 'regular' and
          never appears in this list or in a login's picker. */}
      <RunScriptModal
        mode="record"
        recordKind="login"
        script={null}
        orgId={selectedOrgId}
        open={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        onSaved={() => setScriptsRefreshKey((k) => k + 1)}
      />

      {/* Header */}
      <div>
        <Link
          href="/actions/logins"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-3 w-3" /> Logins
        </Link>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand" /> Login Scripts
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          The scripts that sign a login in. Each one fills the sign-in form and submits it;
          every <code className="text-[11px]">{'{{variable}}'}</code> it declares becomes a
          credential stored against the login that uses it.
        </p>
      </div>

      {/* Create */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10">
              <CircleDot className="h-4 w-4 text-brand" />
            </div>
            <div>
              <p className="text-sm font-medium">Record New Login Script</p>
              <p className="text-xs text-muted-foreground">
                Capture a sign-in once; agents replay it whenever a session expires
              </p>
            </div>
          </div>
          <Button onClick={() => setRecordModalOpen(true)} disabled={!selectedOrgId} size="sm">
            <CircleDot className="mr-1.5 h-3.5 w-3.5" />
            Record
          </Button>
        </div>
      </div>

      {/* List */}
      {selectedOrgId ? (
        <ScriptsList
          orgId={selectedOrgId}
          refreshKey={scriptsRefreshKey}
          kinds={['login']}
        />
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Select an organization to view login scripts.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
