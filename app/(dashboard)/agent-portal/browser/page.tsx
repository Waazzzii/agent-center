'use client';

import { useEffect, useState } from 'react';
import { getNoVNCInfo, type NoVNCInfo } from '@/lib/api/agents';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Monitor, Loader2, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BrowserPage() {
  const permitted = useRequirePermission('agent_center_user');
  const [novnc, setNovnc] = useState<NoVNCInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const agentBackendUrl =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://localhost:8080'
      : '';

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const info = await getNoVNCInfo('shared');
      setNovnc(info);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (!permitted) return <NoPermissionContent />;

  const iframeUrl = novnc ? `${agentBackendUrl}${novnc.viewerUrl}` : null;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Live Browser</h1>
          <p className="text-muted-foreground">Real-time view of the agent&apos;s browser session</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 min-h-0 rounded-lg border bg-black overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-white/60">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
            <WifiOff className="h-10 w-10 opacity-40" />
            <p className="text-sm">Cannot reach agent-backend</p>
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </div>
        ) : iframeUrl ? (
          <iframe
            src={iframeUrl}
            className="w-full h-full border-0"
            title="Live agent browser"
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
            <Monitor className="h-10 w-10 opacity-30" />
            <p className="text-sm">No browser view available</p>
          </div>
        )}
      </div>
    </div>
  );
}
