'use client';

import { type Login } from '@/lib/api/logins';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { LoginFormBody } from './LoginFormBody';

function StatusPill({ status }: { status: Login['status'] }) {
  if (status === 'valid') return <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="h-3 w-3" />Logged In</Badge>;
  if (status === 'needs_login') return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400"><AlertCircle className="h-3 w-3" />Not Logged In</Badge>;
  return <Badge variant="outline" className="gap-1 border-slate-400 text-slate-500"><HelpCircle className="h-3 w-3" />Not Yet Checked</Badge>;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/**
 * Read-only login preview for the workflow action config.  Renders the same
 * LoginFormBody as the edit dialog, plus a status pill at top and timestamps
 * at the bottom.
 */
export function LoginPreview({
  login,
  availableVars,
}: {
  login: Login;
  availableVars?: string[];
}) {
  const form = {
    name: login.name,
    url: login.url,
    verify_text: login.verify_text,
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
      <div>
        <StatusPill status={login.status} />
      </div>

      <LoginFormBody
        form={form}
        setForm={() => {}}
        readOnly
        availableVars={availableVars}
        footer={
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t">
            <span>Last logged in <strong className="font-medium">{formatRelative(login.last_logged_in_at)}</strong></span>
            <span className="opacity-40">·</span>
            <span>Last checked <strong className="font-medium">{formatRelative(login.last_checked_at)}</strong></span>
          </div>
        }
      />
    </div>
  );
}
