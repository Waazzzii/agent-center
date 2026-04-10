'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { toast } from 'sonner';
import {
  createScript,
  updateScript,
  getScript,
  type RecordedStep,
} from '@/lib/api/scripts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  CircleDot,
  Copy,
  Check,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { StepEditor } from '@/components/record/StepEditor';
import { ScriptsList } from '@/components/record/ScriptsList';
import { RunScriptModal } from '@/components/record/RunScriptModal';

export default function RecordPage() {
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const searchParams = useSearchParams();

  // Record modal
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [scriptsRefreshKey, setScriptsRefreshKey] = useState(0);

  // Review / edit state
  const [reviewSteps, setReviewSteps] = useState<RecordedStep[]>([]);
  const [scriptName, setScriptName] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // When editing an existing script, store its id so we PATCH instead of POST
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  // Sub-view: 'list' | 'edit'
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

  // ─── Helper: open a script (or blank new-script) in the edit view ───
  const openEditView = (steps: RecordedStep[], name = '', description = '', scriptId: string | null = null) => {
    const resolvedName = name || new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    setReviewSteps(steps);
    setScriptName(resolvedName);
    setScriptDescription(description);
    setEditingScriptId(scriptId);
    lastChangedBy.current = 'editor';
    setJsonText(JSON.stringify(steps, null, 2));
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

  // ─── Handlers ────────────────────────────────────────────────
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

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-4">

      {/* Record modal */}
      <RunScriptModal
        mode="record"
        script={null}
        orgId={selectedOrgId}
        open={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        onRecordingStop={(steps) => openEditView(steps)}
        onOpenScript={(s) => openEditView(s.steps, s.name, s.description ?? '', s.id)}
        onSaved={() => setScriptsRefreshKey((k) => k + 1)}
      />

      {/* ── Edit mode ── */}
      {scriptSubView === 'edit' ? (
        <>
          {/* Header */}
          <div>
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 block"
              onClick={closeEditView}
            >
              ← Browser Scripts
            </button>
            <h1 className="text-3xl font-bold">
              Edit Script {scriptName && <span className="text-muted-foreground font-normal text-2xl">[{scriptName}]</span>}
            </h1>
            <p className="text-muted-foreground">Update the script steps, name, and description.</p>
          </div>

          <Tabs
            value={editTab}
            onValueChange={(v) => setEditTab(v as 'script' | 'details')}
            className="flex flex-col"
            style={{ height: 'calc(100vh - 190px)' }}
          >
            <div className="flex items-center justify-between shrink-0">
              <TabsList className="grid w-full grid-cols-2 max-w-xs">
                <TabsTrigger value="script">Script</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>

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

            {/* Script tab: Steps + JSON */}
            <TabsContent value="script" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden">
              <div className="grid grid-cols-2 gap-4 h-full">
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center gap-2 mb-2 shrink-0">
                    <h3 className="text-sm font-semibold">Steps</h3>
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                      {reviewSteps.length}
                    </Badge>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
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

            {/* Details tab: Name + Description */}
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
        </>
      ) : (
        /* ── Normal mode: record bar + scripts list ── */
        <>
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold">Browser Scripts</h1>
            <p className="text-muted-foreground">Record browser interactions and save them as reusable scripts</p>
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
              onEdit={(script) => openEditView(script.steps, script.name, script.description ?? '', script.id)}
              refreshKey={scriptsRefreshKey}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">Select an organization to view scripts.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
