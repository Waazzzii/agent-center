'use client';

/**
 * Jobs — every job across every crew, newest activity first. The place to
 * answer "what's waiting on me?": the Awaiting review and Stopped tiles filter
 * straight to them.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Briefcase, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getJobs, type FactoryJob } from '@/lib/api/factory';
import { JobsTable } from '@/components/factory/JobsTable';
import { rangeParams } from '@/lib/time-range';

export default function JobsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const canView = useRequirePermission(['agent_center_user', 'agent_center_manager']);
  const [jobs, setJobs] = useState<FactoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // When the jobs started. Any time by default — jobs are few, and an old job
  // that is still active or stopped is exactly the one that needs attention.
  const [range, setRange] = useState({ from: '', to: '' });

  const load = useCallback(async (initial = false) => {
    if (!selectedOrgId) return;
    if (initial) setLoading(true); else setRefreshing(true);
    try { setJobs(await getJobs(selectedOrgId, rangeParams(range.from, range.to))); } catch { /* keep the last list */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedOrgId, range]);

  // Only the first load blanks the table; a new time range refreshes in place.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!canView) return;
    load(!loadedOnce.current);
    loadedOnce.current = true;
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
  }, [canView, load]);

  if (!canView) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={Briefcase}
        title="Jobs"
        description="Every job your crews have taken on. A job is one ticket worked through its crew's tasks."
      />
      <JobsTable
        jobs={jobs}
        loading={loading}
        range={{ ...range, onApply: (from, to) => setRange({ from, to }) }}
        toolbarRight={(
          <Button variant="ghost" size="sm" onClick={() => load()} disabled={refreshing}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />Refresh
          </Button>
        )}
        emptyMessage="No jobs yet. When a crew picks up a ticket, it shows here."
      />
    </div>
  );
}
