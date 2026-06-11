'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CircleDot, Loader2, Sparkles, Video } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { ScriptsList } from '@/components/record/ScriptsList';
import { RunScriptModal } from '@/components/record/RunScriptModal';
import { BuildWithAIDialog } from '@/components/script-builder/BuildWithAIDialog';
import { AI_SCRIPT_BUILDER_ENABLED } from '@/lib/config';
import { getBuilderSession, isBuilderTerminal } from '@/lib/api/script-builder';
import {
  getActiveBuilderSession,
  clearActiveBuilderSession,
} from '@/lib/hooks/use-active-builder-session';

export default function RecordPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');

  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [scriptsRefreshKey, setScriptsRefreshKey] = useState(0);
  const [activeBuild, setActiveBuild] = useState<{ sessionId: string; goal?: string } | null>(null);

  // Resume banner — verify the stored session is still alive before showing.
  useEffect(() => {
    if (!AI_SCRIPT_BUILDER_ENABLED || !selectedOrgId) return;
    const stored = getActiveBuilderSession();
    if (!stored || stored.orgId !== selectedOrgId) return;
    let cancelled = false;
    getBuilderSession(selectedOrgId, stored.sessionId)
      .then((session) => {
        if (cancelled) return;
        if (isBuilderTerminal(session.status)) {
          clearActiveBuilderSession();
        } else {
          setActiveBuild({ sessionId: stored.sessionId, goal: session.goal });
        }
      })
      .catch(() => {
        if (!cancelled) clearActiveBuilderSession();
      });
    return () => { cancelled = true; };
  }, [selectedOrgId]);

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">

      {/* Record modal */}
      <RunScriptModal
        mode="record"
        script={null}
        orgId={selectedOrgId}
        open={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        onSaved={() => setScriptsRefreshKey((k) => k + 1)}
      />

      {/* Build with AI dialog — feature-flagged off until launch */}
      {AI_SCRIPT_BUILDER_ENABLED && selectedOrgId && (
        <BuildWithAIDialog
          orgId={selectedOrgId}
          open={buildDialogOpen}
          onClose={() => setBuildDialogOpen(false)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Video className="h-5 w-5 text-brand" /> Browser Scripts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Record browser interactions and save them as reusable scripts</p>
      </div>

      {/* Build-in-progress resume banner */}
      {activeBuild && (
        <div className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand/5 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
            <div className="min-w-0">
              <p className="text-sm font-medium">AI build in progress</p>
              <p className="truncate text-xs text-muted-foreground">{activeBuild.goal ?? 'A script is being built'}</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => router.push(`/actions/browser-scripts/build/${activeBuild.sessionId}`)}
          >
            Resume
          </Button>
        </div>
      )}

      {/* Create actions */}
      <div className={AI_SCRIPT_BUILDER_ENABLED ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
        <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10">
              <CircleDot className="h-4 w-4 text-brand" />
            </div>
            <div>
              <p className="text-sm font-medium">Record New Script</p>
              <p className="text-xs text-muted-foreground">Capture browser interactions as a reusable script</p>
            </div>
          </div>
          <Button
            onClick={() => setRecordModalOpen(true)}
            disabled={!selectedOrgId}
            size="sm"
          >
            <CircleDot className="mr-1.5 h-3.5 w-3.5" />
            Record
          </Button>
        </div>

        {AI_SCRIPT_BUILDER_ENABLED && (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10">
                <Sparkles className="h-4 w-4 text-brand" />
              </div>
              <div>
                <p className="text-sm font-medium">Build with AI</p>
                <p className="text-xs text-muted-foreground">Describe the goal — an agent builds and tests the script</p>
              </div>
            </div>
            <Button
              onClick={() => setBuildDialogOpen(true)}
              disabled={!selectedOrgId}
              size="sm"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Build
            </Button>
          </div>
        )}
      </div>

      {/* Scripts list */}
      {selectedOrgId ? (
        <ScriptsList
          orgId={selectedOrgId}
          refreshKey={scriptsRefreshKey}
        />
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Select an organization to view scripts.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
