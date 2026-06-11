'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { BuilderWorkspace } from '@/components/script-builder/BuilderWorkspace';
import { Card, CardContent } from '@/components/ui/card';
import { AI_SCRIPT_BUILDER_ENABLED } from '@/lib/config';

export default function ScriptBuilderPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? null;
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');

  // Feature-flagged off until launch — no deep-link access either.
  useEffect(() => {
    if (!AI_SCRIPT_BUILDER_ENABLED) router.replace('/actions/browser-scripts');
  }, [router]);
  if (!AI_SCRIPT_BUILDER_ENABLED) return null;

  if (!permitted) return <NoPermissionContent />;

  if (!selectedOrgId || !sessionId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Select an organization to view this build session.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <BuilderWorkspace orgId={selectedOrgId} sessionId={sessionId} />;
}
