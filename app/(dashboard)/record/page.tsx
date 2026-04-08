'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { toast } from 'sonner';
import {
  startRecording,
  stopRecording,
  getRecordingSteps,
  createScript,
  updateScript,
  getScript,
  listBrowserSessions,
  createBrowserSession,
  touchBrowserSession,
  destroyBrowserSession,
  type RecordedStep,
  type BrowserSession,
} from '@/lib/api/scripts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Globe,
  MousePointer2,
  Type,
  ChevronDown,
  CornerDownLeft,
  Scissors,
  CircleDot,
  Square,
  Copy,
  Check,
  Monitor,
  Loader2,
  Layers,
  X,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { StepEditor } from '@/components/record/StepEditor';
import { ScriptsList } from '@/components/record/ScriptsList';
import { cn } from '@/lib/utils';

const agentApiUrl = process.env.NEXT_PUBLIC_AGENT_API_URL ?? '';

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function maskValue(value: string, selector?: string): string {
  const sel = (selector ?? '').toLowerCase();
  if (sel.includes('password') || sel.includes('pwd') || sel.includes('secret')) {
    return '••••••••';
  }
  return value;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'less than a minute';
  return `${mins} min${mins !== 1 ? 's' : ''}`;
}

function LiveStepRow({ step }: { step: RecordedStep }) {
  const renderContent = () => {
    switch (step.action) {
      case 'navigate':
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Navigate to</span>
            <span className="font-mono truncate max-w-[160px]">{truncate(step.url ?? '', 40)}</span>
          </span>
        );
      case 'click':
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <MousePointer2 className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Click</span>
            <span className="font-mono truncate max-w-[160px]">
              {step.text ? truncate(step.text, 40) : truncate(step.selector ?? '', 40)}
            </span>
          </span>
        );
      case 'fill': {
        const val = step.value ?? '';
        const isPlaceholder = val.startsWith('{{');
        return (
          <span className="flex items-center gap-1.5 text-xs flex-wrap">
            <Type className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Fill</span>
            <span className="font-mono truncate max-w-[100px]">{truncate(step.selector ?? '', 30)}</span>
            <span className="text-muted-foreground">=</span>
            <span className={cn('font-mono', isPlaceholder ? 'text-purple-400' : 'text-foreground')}>
              {isPlaceholder ? val : maskValue(val, step.selector)}
            </span>
          </span>
        );
      }
      case 'select':
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Select</span>
            <span className="font-mono">{step.value}</span>
            <span className="text-muted-foreground">in</span>
            <span className="font-mono truncate max-w-[100px]">{truncate(step.selector ?? '', 30)}</span>
          </span>
        );
      case 'press_key':
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <CornerDownLeft className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Press</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4 font-mono">{step.key}</Badge>
          </span>
        );
      case 'extract':
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <Scissors className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Extract</span>
            <span className="font-mono truncate max-w-[100px]">{truncate(step.selector ?? '', 30)}</span>
            <span className="text-muted-foreground">→</span>
            <Badge className="text-xs px-1.5 py-0 h-4 font-mono bg-purple-500/20 text-purple-400 border-purple-500/30">
              {step.field_name}
            </Badge>
          </span>
        );
      case 'switch_tab':
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Switch to tab</span>
            {step.tab_index !== undefined && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4 font-mono">
                {step.tab_index}
              </Badge>
            )}
          </span>
        );
      case 'close_tab':
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <X className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Close tab</span>
          </span>
        );
      default:
        return <span className="text-xs text-muted-foreground">{step.action}</span>;
    }
  };

  return (
    <div className="px-2 py-1.5 border-b last:border-0 hover:bg-muted/20 transition-colors">
      {renderContent()}
    </div>
  );
}

export default function RecordPage() {
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const searchParams = useSearchParams();

  // Tab state
  const [tab, setTab] = useState('record');

  // Recording state
  const [startUrl, setStartUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<RecordedStep[]>([]);

  // Review / edit state
  const [reviewSteps, setReviewSteps] = useState<RecordedStep[]>([]);
  const [scriptName, setScriptName] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // When editing an existing script, store its id so we PATCH instead of POST
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  // Sub-view within the Scripts tab: 'list' | 'edit'
  const [scriptSubView, setScriptSubView] = useState<'list' | 'edit'>('list');
  // Internal tabs within the edit view
  const [editTab, setEditTab] = useState<'script' | 'details'>('script');
  // Original script state for change detection
  const [originalScript, setOriginalScript] = useState<{ name: string; description: string; steps: RecordedStep[] } | null>(null);
  // Which step is selected in the editor (drives JSON panel content)
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);

  // JSON editor state
  const [jsonError, setJsonError] = useState('');
  const [jsonCopied, setJsonCopied] = useState(false);
  // Track who last changed to prevent infinite loops
  const lastChangedBy = useRef<'editor' | 'json' | null>(null);
  const [jsonText, setJsonText] = useState('[]');
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sessions state
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [viewingSession, setViewingSession] = useState<BrowserSession | null>(null);

  // Polling refs
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Helper: open a script (or blank new-script) in the edit view ───
  const openEditView = (steps: RecordedStep[], name = '', description = '', scriptId: string | null = null) => {
    setReviewSteps(steps);
    setScriptName(name);
    setScriptDescription(description);
    setEditingScriptId(scriptId);
    lastChangedBy.current = 'editor';
    setJsonText(JSON.stringify(steps, null, 2));
    setTab('scripts');
    setScriptSubView('edit');
    setEditTab('script');
    // Snapshot original so we can detect changes
    if (scriptId) {
      setOriginalScript({ name, description, steps: JSON.parse(JSON.stringify(steps)) });
    } else {
      setOriginalScript(null);
    }
  };

  const closeEditView = () => {
    setReviewSteps([]);
    setJsonText('[]');
    setScriptName('');
    setScriptDescription('');
    setEditingScriptId(null);
    setSelectedStepIndex(null);
    setOriginalScript(null);
    setEditTab('script');
    setScriptSubView('list');
  };

  // Has anything changed from the original snapshot?
  const hasChanges = useMemo(() => {
    if (!originalScript) return true; // new script — always saveable
    if (scriptName !== originalScript.name) return true;
    if (scriptDescription !== originalScript.description) return true;
    if (JSON.stringify(reviewSteps) !== JSON.stringify(originalScript.steps)) return true;
    return false;
  }, [scriptName, scriptDescription, reviewSteps, originalScript]);

  // ─── Load script from ?edit=<id> URL param ───────────────────
  useEffect(() => {
    const editId = searchParams?.get('edit');
    if (!editId || !selectedOrgId) return;
    getScript(selectedOrgId, editId)
      .then((script) => {
        openEditView(script.steps, script.name, script.description ?? '', script.id);
      })
      .catch(() => {
        toast.error('Failed to load script for editing');
      });
    // Only run when the edit param or org changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, selectedOrgId]);


  // ─── Sync reviewSteps / selectedStepIndex → jsonText ────────────
  useEffect(() => {
    if (lastChangedBy.current === 'json') {
      lastChangedBy.current = null;
      return;
    }
    lastChangedBy.current = 'editor';
    if (selectedStepIndex !== null && reviewSteps[selectedStepIndex]) {
      setJsonText(JSON.stringify(reviewSteps[selectedStepIndex], null, 2));
    } else {
      setJsonText(JSON.stringify(reviewSteps, null, 2));
    }
    setJsonError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewSteps, selectedStepIndex]);

  // ─── Load sessions ───────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      const data = await listBrowserSessions(selectedOrgId);
      setSessions(data.sessions ?? []);
    } catch {
      // Non-fatal
    }
  }, [selectedOrgId]);

  useEffect(() => {
    if (selectedOrgId) loadSessions();
  }, [selectedOrgId, loadSessions]);

  // Poll sessions every 30s while on record tab
  useEffect(() => {
    if (tab === 'record' && selectedOrgId) {
      sessionPollRef.current = setInterval(loadSessions, 30000);
    } else {
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current);
        sessionPollRef.current = null;
      }
    }
    return () => {
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current);
        sessionPollRef.current = null;
      }
    };
  }, [tab, selectedOrgId, loadSessions]);

  // ─── Poll live steps while recording ────────────────────────
  useEffect(() => {
    if (isRecording && recordingId && selectedOrgId) {
      pollRef.current = setInterval(async () => {
        try {
          const data = await getRecordingSteps(selectedOrgId, recordingId);
          setLiveSteps(data.steps ?? []);
        } catch {
          // Non-fatal polling error
        }
      }, 1500);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isRecording, recordingId, selectedOrgId]);

  // ─── Handlers ────────────────────────────────────────────────
  const handleStartRecording = async () => {
    if (!selectedOrgId) return;
    try {
      const res = await startRecording(
        selectedOrgId,
        startUrl || undefined,
      );
      setRecordingId(res.recordingId);
      setViewerUrl(res.viewerUrl);
      setLiveSteps([]);
      setIsRecording(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    if (!selectedOrgId || !recordingId) return;
    try {
      const res = await stopRecording(selectedOrgId, recordingId);
      const captured = res.steps ?? liveSteps;
      setIsRecording(false);
      setRecordingId(null);
      setViewerUrl(null);
      setLiveSteps([]);
      openEditView(captured);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to stop recording');
    }
  };

  const handleSaveScript = async () => {
    if (!selectedOrgId || !scriptName.trim()) return;
    setIsSaving(true);
    try {
      const parameters = Array.from(
        new Set(
          reviewSteps.flatMap((s) => {
            const sources = [s.value ?? '', s.field_name ?? '', s.url ?? ''];
            return sources.flatMap((src) => {
              const matches = src.match(/\{\{(\w+)\}\}/g);
              return matches ? matches.map((m) => m.replace(/\{\{|\}\}/g, '')) : [];
            });
          })
        )
      );

      if (editingScriptId) {
        await updateScript(selectedOrgId, editingScriptId, {
          name: scriptName.trim(),
          description: scriptDescription.trim() || undefined,
          steps: reviewSteps,
          parameters,
        });
        toast.success('Script updated!');
      } else {
        await createScript(selectedOrgId, {
          name: scriptName.trim(),
          description: scriptDescription.trim() || undefined,
          steps: reviewSteps,
          parameters,
        });
        toast.success('Script saved!');
      }

      closeEditView();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save script');
    } finally {
      setIsSaving(false);
    }
  };

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      if (selectedStepIndex !== null) {
        // Single-step mode
        if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed?.action) {
          lastChangedBy.current = 'json';
          setReviewSteps((prev) => {
            const next = [...prev];
            next[selectedStepIndex] = parsed as RecordedStep;
            return next;
          });
          setJsonError('');
        } else {
          setJsonError('Must be a single step object with an "action" field');
        }
      } else {
        // Full array mode
        if (Array.isArray(parsed)) {
          lastChangedBy.current = 'json';
          setReviewSteps(parsed as RecordedStep[]);
          setJsonError('');
        } else {
          setJsonError('JSON must be an array');
        }
      }
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  // Wrapper so deleting a step clears the selection if it becomes out of range
  const handleStepsChange = (newSteps: RecordedStep[]) => {
    setReviewSteps(newSteps);
    if (selectedStepIndex !== null && selectedStepIndex >= newSteps.length) {
      setSelectedStepIndex(null);
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleCreateSession = async () => {
    if (!selectedOrgId) return;
    setIsCreatingSession(true);
    try {
      await createBrowserSession(selectedOrgId);
      await loadSessions();
      toast.success('Browser session started');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to start session');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleExtendSession = async (sessionId: string) => {
    if (!selectedOrgId) return;
    try {
      await touchBrowserSession(selectedOrgId, sessionId);
      await loadSessions();
      toast.success('Session extended by 1 hour');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to extend session');
    }
  };

  const handleDestroySession = async (sessionId: string) => {
    if (!selectedOrgId) return;
    try {
      await destroyBrowserSession(selectedOrgId, sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      if (viewingSession?.sessionId === sessionId) setViewingSession(null);
      toast.success('Session destroyed');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to destroy session');
    }
  };

  if (!permitted) return <NoPermissionContent />;

  // ─── Session bar ─────────────────────────────────────────────
  const SessionBar = () => {
    if (!selectedOrgId) return null;

    return (
      <div className="mb-4">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 bg-muted/20">
            <span className="text-xs text-muted-foreground">No active browser session</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCreateSession}
              disabled={isCreatingSession}
            >
              {isCreatingSession ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <Monitor className="h-3 w-3 mr-1.5" />
              )}
              Start Session
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sessions.map((session) => (
              <div
                key={session.sessionId}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-muted/10"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs font-medium">Active session</span>
                <span className="text-xs text-muted-foreground">
                  · idle expires in {timeUntil(session.idleExpiresAt)}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => handleExtendSession(session.sessionId)}
                    title="Reset idle timer to 1 hour"
                  >
                    Extend
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => setViewingSession(session)}
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDestroySession(session.sessionId)}
                  >
                    Destroy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Full-screen session viewer — just the browser, no chrome */}
      {viewingSession && (
        <div className="fixed z-50 inset-0 md:left-64 bg-black">
          <iframe
            src={`${agentApiUrl}${viewingSession.viewerUrl}`}
            className="w-full h-full"
            scrolling="no"
            title="Browser session"
          />
          <button
            className="absolute z-50 flex items-center justify-center bg-red-500 hover:bg-red-600 transition-colors text-white"
            style={{ top: 16, right: 16, width: 36, height: 36, borderRadius: 8 }}
            onClick={() => setViewingSession(null)}
            title="Close"
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
      )}

      {/* Fixed full-screen recording overlay — escapes max-w-6xl and all layout padding */}
      {isRecording && (
        <div className="fixed z-40 inset-0 md:left-64 bg-background flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-sm font-medium text-red-500">Recording…</span>
              <span className="text-xs text-muted-foreground">· {liveSteps.length} step{liveSteps.length !== 1 ? 's' : ''} captured</span>
            </div>
            <Button variant="destructive" size="sm" onClick={handleStopRecording}>
              <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
              Stop Recording
            </Button>
          </div>

          {/* VNC + steps sidebar */}
          <div className="flex-1 min-h-0 flex">
            {/* Browser — takes all remaining width */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {viewerUrl && (
                <iframe
                  src={`${agentApiUrl}${viewerUrl}`}
                  className="w-full h-full"
                  scrolling="no"
                  title="Live browser recording"
                />
              )}
            </div>

            {/* Steps sidebar — fixed narrow strip */}
            <div className="w-56 shrink-0 border-l flex flex-col overflow-hidden bg-background">
              <div className="px-3 py-2 border-b shrink-0">
                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                  Steps ({liveSteps.length})
                </p>
              </div>
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                {liveSteps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-2 px-4 text-center">
                    <CircleDot className="h-5 w-5 opacity-30" />
                    Interact with the browser to capture steps
                  </div>
                ) : (
                  liveSteps.map((step, i) => <LiveStepRow key={i} step={step} />)
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        {scriptSubView === 'edit' && tab === 'scripts' && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 block"
            onClick={closeEditView}
          >
            ← Scripts
          </button>
        )}
        <h1 className="text-3xl font-bold">
          {scriptSubView === 'edit' && tab === 'scripts' ? 'Edit Script' : 'Record'}
        </h1>
        <p className="text-muted-foreground">
          {scriptSubView === 'edit' && tab === 'scripts'
            ? 'Update the script steps, name, and description.'
            : 'Record browser interactions and save them as reusable scripts'}
        </p>
      </div>

      {scriptSubView === 'edit' ? (
        /* ── Edit mode: Script/Details tabs replace Record/Scripts tabs ── */
        <Tabs
          value={editTab}
          onValueChange={(v) => setEditTab(v as 'script' | 'details')}
          className="flex flex-col"
          style={{ height: 'calc(100vh - 190px)' }}
        >
          {/* Tab bar — same position/size as the Record/Scripts bar would be */}
          <div className="flex items-center justify-between shrink-0">
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            {/* Save/Update — only visible when there are changes (or new script) */}
            {(!editingScriptId || hasChanges) && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSaveScript}
                  disabled={isSaving || !scriptName.trim()}
                  size="sm"
                  className="h-8"
                >
                  {isSaving ? (
                    <>
                      <span className="mr-1.5 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {editingScriptId ? 'Updating…' : 'Saving…'}
                    </>
                  ) : (
                    editingScriptId ? 'Update Script' : 'Save Script'
                  )}
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={closeEditView}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* ── Script tab: Steps + JSON ── */}
          <TabsContent value="script" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden">
            <div className="grid grid-cols-2 gap-4 h-full">

              {/* Left col: Steps */}
              <div className="flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-2 shrink-0">
                  <h3 className="text-sm font-semibold">Steps</h3>
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {reviewSteps.length}
                  </Badge>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <div
                    className="h-full overflow-y-auto"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    <StepEditor
                      steps={reviewSteps}
                      onChange={handleStepsChange}
                      selectedIndex={selectedStepIndex}
                      onSelect={setSelectedStepIndex}
                      className="min-h-full"
                    />
                  </div>
                </div>
              </div>

              {/* Right col: JSON */}
              <div className="flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-2 shrink-0">
                  <h3 className="text-sm font-semibold">JSON</h3>
                  {selectedStepIndex !== null && (
                    <span className="text-xs text-muted-foreground">
                      · step {selectedStepIndex + 1} — click again to deselect
                    </span>
                  )}
                </div>
                <div className="relative flex-1 min-h-0">
                  <div className="border rounded-lg h-full overflow-hidden bg-muted/50">
                    <textarea
                      ref={jsonTextareaRef}
                      className="font-mono text-xs p-3 w-full h-full resize-none focus:outline-none bg-transparent overflow-y-auto"
                      style={{ scrollbarWidth: 'none' }}
                      value={jsonText}
                      onChange={(e) => handleJsonChange(e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                  <button
                    className="absolute top-2 right-2 z-10 rounded p-1 bg-muted/80 hover:bg-muted transition-colors"
                    onClick={handleCopyJson}
                    title="Copy JSON"
                  >
                    {jsonCopied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                </div>
                {jsonError && (
                  <p className="text-xs text-destructive mt-1 shrink-0">{jsonError}</p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Details tab: Name + Description ── */}
          <TabsContent value="details" className="mt-4 data-[state=inactive]:hidden">
            <div className="space-y-4 max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="script-name" className="text-sm">Name</Label>
                <Input
                  id="script-name"
                  placeholder="Script name *"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="script-desc" className="text-sm">Description</Label>
                <Input
                  id="script-desc"
                  placeholder="Description (optional)"
                  value={scriptDescription}
                  onChange={(e) => setScriptDescription(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        /* ── Normal mode: Record / Scripts tabs ── */
        <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v !== 'scripts') setScriptSubView('list'); }}>
          <TabsList className="grid w-full grid-cols-2 max-w-xs">
            <TabsTrigger value="record">Record</TabsTrigger>
            <TabsTrigger value="scripts">Scripts</TabsTrigger>
          </TabsList>

          {/* Record tab */}
          <TabsContent value="record" className="mt-4">
            {!isRecording && (
              <>
                <SessionBar />
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4 max-w-lg">
                      <div className="space-y-1.5">
                        <Label htmlFor="start-url">Start URL (optional)</Label>
                        <Input
                          id="start-url"
                          placeholder="https://..."
                          value={startUrl}
                          onChange={(e) => setStartUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && selectedOrgId) handleStartRecording();
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          If provided, the browser will navigate here before recording starts.
                        </p>
                      </div>
                      <Button
                        size="lg"
                        disabled={!selectedOrgId}
                        onClick={handleStartRecording}
                        className="w-full sm:w-auto"
                      >
                        <CircleDot className="mr-2 h-4 w-4" />
                        Start Recording
                      </Button>
                      {!selectedOrgId && (
                        <p className="text-xs text-muted-foreground">
                          Select an organization to start recording.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Scripts tab */}
          <TabsContent value="scripts" className="mt-4">
            {!selectedOrgId ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Select an organization to view scripts.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScriptsList
                orgId={selectedOrgId}
                onEdit={(script) => openEditView(script.steps, script.name, script.description ?? '', script.id)}
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
