'use client';

/**
 * "Build with AI" setup dialog — collects the start URL, goal, optional
 * login profile, and optional desired parameters, then starts a builder
 * session and navigates to the live build page.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, X } from 'lucide-react';
import { listLogins, type Login } from '@/lib/api/logins';
import { createBuilderSession } from '@/lib/api/script-builder';
import { setActiveBuilderSession } from '@/lib/hooks/use-active-builder-session';

interface BuildWithAIDialogProps {
  orgId: string;
  open: boolean;
  onClose: () => void;
}

export function BuildWithAIDialog({ orgId, open, onClose }: BuildWithAIDialogProps) {
  const router = useRouter();
  const [startUrl, setStartUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [loginId, setLoginId] = useState<string>('none');
  const [logins, setLogins] = useState<Login[]>([]);
  const [paramInput, setParamInput] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    listLogins(orgId).then(setLogins).catch(() => setLogins([]));
  }, [open, orgId]);

  const addParam = () => {
    const name = paramInput.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    if (!name) return;
    if (!params.includes(name)) setParams((p) => [...p, name]);
    setParamInput('');
  };

  const valid = /^https?:\/\/.+/i.test(startUrl.trim()) && goal.trim().length > 0;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const { sessionId } = await createBuilderSession(orgId, {
        goal: goal.trim(),
        start_url: startUrl.trim(),
        login_id: loginId === 'none' ? null : loginId,
        parameters: params.length ? params : undefined,
      });
      setActiveBuilderSession({ sessionId, orgId });
      onClose();
      router.push(`/actions/browser-scripts/build/${sessionId}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }, message?: string };
      toast.error(e.response?.data?.error || e.message || 'Failed to start the build session');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" /> Build a script with AI
          </DialogTitle>
          <DialogDescription>
            Describe what the script should do. An AI agent explores the site in a cloud browser,
            authors the steps, tests them on the real engine, and saves a working script — you can
            watch live and guide it along the way.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="builder-url">Start URL</Label>
            <Input
              id="builder-url"
              placeholder="https://example.com/login"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="builder-goal">What should the script do?</Label>
            <Textarea
              id="builder-goal"
              rows={4}
              placeholder={'e.g. "Search reservations by guest name, open the first match, and extract the confirmation number and check-in date."'}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Login profile (optional)</Label>
            <Select value={loginId} onValueChange={setLoginId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {logins.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}{l.status === 'valid' ? '' : ` (${l.status})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The agent builds inside this login&apos;s authenticated browser profile.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="builder-params">Variables (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="builder-params"
                placeholder="e.g. guest_name — press Enter to add"
                value={paramInput}
                onChange={(e) => setParamInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addParam(); }
                }}
              />
            </div>
            {params.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {params.map((p) => (
                  <Badge
                    key={p}
                    variant="default"
                    className="bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30 font-mono text-xs gap-1"
                  >
                    {`{{${p}}}`}
                    <button type="button" onClick={() => setParams((prev) => prev.filter((x) => x !== p))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Inputs that should be swappable each run. The agent also detects these on its own.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!valid || submitting}>
            {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Start building
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
