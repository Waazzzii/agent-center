'use client';

import { useState } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CircleDot, Video } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { ScriptsList } from '@/components/record/ScriptsList';
import { RunScriptModal } from '@/components/record/RunScriptModal';

export default function RecordPage() {
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');

  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [scriptsRefreshKey, setScriptsRefreshKey] = useState(0);

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

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Video className="h-5 w-5 text-primary" /> Browser Scripts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Record browser interactions and save them as reusable scripts</p>
      </div>

      {/* Record New Script bar */}
      <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <CircleDot className="h-4 w-4 text-primary" />
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
