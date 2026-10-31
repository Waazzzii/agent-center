'use client';

/**
 * Jobs as a list: the same table on the Jobs page (every crew) and a crew's
 * Jobs tab (one crew — the Crew column hidden). Rows open the job page.
 * Stat tiles above filter by where jobs stand. With `range`, a time-range
 * picker (when the job STARTED) sits in the toolbar; the caller owns the
 * bounds and reloads, since the window is applied server-side.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, CirclePause, Eye, Loader2, Play } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { StatTile } from '@/components/ui/stat-tile';
import { Badge } from '@/components/ui/badge';
import { ColumnSelectFilter } from '@/components/ui/column-select-filter';
import { TimeRangePicker } from '@/components/execution/TimeRangePicker';
import { cn } from '@/lib/utils';
import type { FactoryJob } from '@/lib/api/factory';
import { JOB_STATUS, TaskPills, ago, jobNow, needsReview, noTicket } from './job-state';

type Bucket = 'active' | 'review' | 'stopped' | 'done';

const IN_BUCKET: Record<Bucket, (j: FactoryJob) => boolean> = {
  active: (j) => j.status === 'active',
  review: needsReview,
  stopped: (j) => j.status === 'stopped',
  done: (j) => j.status === 'done',
};

export function JobsTable({ jobs, loading, showCrew = true, emptyMessage, toolbarRight, range }: {
  jobs: FactoryJob[];
  loading?: boolean;
  showCrew?: boolean;
  emptyMessage: string;
  toolbarRight?: React.ReactNode;
  range?: { from: string; to: string; onApply: (from: string, to: string) => void };
}) {
  const ranged = !!range && !!(range.from || range.to);
  const router = useRouter();
  const [bucket, setBucket] = React.useState<Bucket | null>(null);
  const [crew, setCrew] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');

  const crews = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jobs) m.set(j.crew_id, j.crew_name);
    return [...m].map(([value, label]) => ({ value, label }));
  }, [jobs]);

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) =>
      (!bucket || IN_BUCKET[bucket](j))
      && (!crew || j.crew_id === crew)
      && (!q || `${j.title ?? ''} ${j.tracker_identifier ?? ''} ${j.crew_name} ${j.branch ?? ''}`.toLowerCase().includes(q)));
  }, [jobs, bucket, crew, search]);

  const count = (b: Bucket) => jobs.filter(IN_BUCKET[b]).length;
  const tile = (b: Bucket) => ({ selected: bucket === b, onClick: () => setBucket(bucket === b ? null : b) });

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {jobs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Active" value={count('active')} icon={Play} tone="brand" {...tile('active')} />
          <StatTile label="Awaiting review" value={count('review')} icon={Eye} tone="warning" {...tile('review')} />
          <StatTile label="Stopped" value={count('stopped')} icon={CirclePause} tone="danger" {...tile('stopped')} />
          <StatTile label="Done" value={count('done')} icon={CircleCheck} tone="success" {...tile('done')} />
        </div>
      )}
      <DataTable
        search={{ value: search, onChange: setSearch, placeholder: 'Search jobs…' }}
        toolbarRight={(range || toolbarRight) && (
          <div className="flex items-center gap-1.5">
            {range && <TimeRangePicker from={range.from} to={range.to} onApply={range.onApply} />}
            {toolbarRight}
          </div>
        )}
        data={rows}
        isFiltered={!!(search || bucket || crew)}
        getRowKey={(j) => j.id}
        onRowClick={(j) => router.push(`/factory/jobs/${j.id}`)}
        emptyMessage={jobs.length > 0 ? 'No jobs match.' : ranged ? 'No jobs started in this time range.' : emptyMessage}
        columns={[
          {
            key: 'job', label: 'Job',
            render: (j) => (
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{j.title ?? '—'}</div>
                <div className="truncate text-xs text-muted-foreground">{j.tracker_identifier ?? noTicket(j)}</div>
              </div>
            ),
          },
          ...(showCrew ? [{
            key: 'crew', label: 'Crew', hideOnMobile: true, thClassName: 'w-40', tdClassName: 'text-sm text-muted-foreground',
            filter: crews.length > 1
              ? <ColumnSelectFilter title="Crew" value={crew} onChange={(v) => setCrew(v || null)} options={crews} searchable={false} />
              : undefined,
            render: (j: FactoryJob) => <span className="truncate">{j.crew_name}</span>,
          }] : []),
          {
            key: 'progress', label: 'Progress', hideOnMobile: true, thClassName: 'w-44',
            render: (j) => <TaskPills job={j} tasks={j.tasks} />,
          },
          {
            key: 'now', label: 'Now', thClassName: 'w-56', tdClassName: 'text-sm',
            render: (j) => {
              const n = jobNow(j);
              return <span className={cn('line-clamp-2', n.tone === 'warning' ? 'text-warning' : 'text-muted-foreground')} title={n.text}>{n.text}</span>;
            },
          },
          {
            key: 'status', label: 'Status', thClassName: 'w-24',
            render: (j) => <Badge variant={JOB_STATUS[j.status].variant}>{JOB_STATUS[j.status].label}</Badge>,
          },
          {
            key: 'updated', label: 'Updated', hideOnMobile: true, thClassName: 'w-24', tdClassName: 'text-sm text-muted-foreground',
            render: (j) => ago(j.updated_at),
          },
        ]}
      />
    </div>
  );
}
