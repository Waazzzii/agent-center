'use client';

/**
 * DEPRECATED — the old System B authorization page.
 *
 * This managed a second, parallel group system (agent_access_groups + members +
 * per-agent/action/login attachments). The notify merge (migrations 407 + 409)
 * folded all of it onto the ONE Wazzi access-group system:
 *   • Group membership   → managed in Wazzi admin (one place for everyone).
 *   • Agent / login ASSIGNMENTS → the Authorization page (/authorization), split
 *     into the three grains (Execution / Decisions / Logins).
 *
 * The route stays so old links don't 404; it now just points people to the new
 * surfaces. (Backend System B tables are dropped in a later teardown migration.)
 */

import Link from 'next/link';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ArrowRight } from 'lucide-react';

export default function AccessDeprecatedPage() {
  const isManager = useRequirePermission('agent_center_manager');
  if (!isManager) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[760px] mx-auto">
      <PageHeader icon={ShieldCheck} title="Authorization moved" description="This page has been replaced." />
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Agent authorization is now one system built on your <strong>Wazzi access groups</strong>, split
          into three grains:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Execution</strong> — who may run an agent</li>
          <li><strong>Decisions</strong> — who may act on an agent&apos;s decisions</li>
          <li><strong>Logins</strong> — who handles a login&apos;s sign-in</li>
        </ul>
        <p>
          Set those assignments on the <strong>Access</strong> page. Group <em>membership</em> (who
          is in a group) is managed in <strong>Wazzi admin</strong>, so it is shared with the rest of the
          platform.
        </p>
        <div className="pt-1">
          <Button asChild>
            <Link href="/authorization">Go to Access <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
