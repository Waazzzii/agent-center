'use client';

import { useEffect, useState } from 'react';
import {
  ConnectorConfiguration,
  ConnectorConfigSchema,
  ConnectorSchemaField,
  FieldType,
} from '@/types/api.types';
import { getFieldLibrary, createFieldLibraryEntry } from '@/lib/api/connectors-base';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Eye, Lock, Search, Sparkles, Pencil,
} from 'lucide-react';
import { DynamicConnectorForm } from './dynamic-connector-form';
import { toast } from 'sonner';

interface SchemaBuilderProps {
  initialSchema?: ConnectorConfigSchema;
  onChange: (schema: ConnectorConfigSchema) => void;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean (Switch)' },
  { value: 'select', label: 'Select (Dropdown)' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'password', label: 'Password' },
  { value: 'oauth', label: 'OAuth Login' },
];

function libraryToSchemaField(entry: ConnectorConfiguration): ConnectorSchemaField {
  return {
    key: entry.key,
    label: entry.label,
    type: entry.type as FieldType,
    required: entry.is_required,
    secret: entry.is_secret,
    placeholder: entry.placeholder ?? undefined,
    helpText: entry.help_text ?? undefined,
    default: entry.default_value ?? undefined,
    options: entry.options ?? undefined,
    validation: entry.validation ?? undefined,
  };
}

// ── Add Field Dialog ──────────────────────────────────────────────────────────
// Two modes: pick from library | create new custom field

interface AddFieldDialogProps {
  open: boolean;
  onClose: () => void;
  library: ConnectorConfiguration[];
  existingKeys: Set<string>;
  onAdd: (field: ConnectorSchemaField) => void;
  onCreated: (entry: ConnectorConfiguration) => void;
}

function AddFieldDialog({ open, onClose, library, existingKeys, onAdd, onCreated }: AddFieldDialogProps) {
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    key: '', label: '', type: 'text' as FieldType,
    is_secret: false, is_required: false, placeholder: '', help_text: '',
  });

  const labelToKey = (l: string) =>
    l.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const filtered = library.filter(
    (f) => f.label.toLowerCase().includes(search.toLowerCase()) ||
           f.key.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!draft.key || !draft.label) { toast.error('Key and label are required'); return; }
    setSaving(true);
    try {
      const created = await createFieldLibraryEntry({
        key: draft.key,
        label: draft.label,
        type: draft.type,
        is_secret: draft.is_secret,
        is_required: draft.is_required,
        placeholder: draft.placeholder || null,
        help_text: draft.help_text || null,
        default_value: null,
        validation: null,
        options: null,
      });
      onCreated(created);
      onAdd(libraryToSchemaField(created));
      toast.success(`"${created.label}" added to library`);
      close();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create field');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setMode('pick');
    setSearch('');
    setDraft({ key: '', label: '', type: 'text', is_secret: false, is_required: false, placeholder: '', help_text: '' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-lg">
        {mode === 'pick' ? (
          <>
            <DialogHeader>
              <DialogTitle>Add Field</DialogTitle>
              <DialogDescription>Select from the shared field library or create a custom field.</DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Search fields…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-0.5 pr-1 -mx-1 px-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No matching fields.</p>
              ) : filtered.map((f) => {
                const added = existingKeys.has(f.key);
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={added}
                    onClick={() => { onAdd(libraryToSchemaField(f)); close(); }}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                      added
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-muted/70 cursor-pointer'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">{f.label}</span>
                        {f.is_secret && <Lock className="h-3 w-3 text-amber-500 shrink-0" />}
                        {f.is_required && <Badge variant="secondary" className="text-[10px] px-1 py-0">Required</Badge>}
                        {added && <Badge variant="outline" className="text-[10px] px-1 py-0">Added</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <code className="font-mono">{f.key}</code>
                        <span className="mx-1">·</span>
                        {f.type}
                        {f.help_text && <span className="ml-1">· {f.help_text.slice(0, 60)}{f.help_text.length > 60 ? '…' : ''}</span>}
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMode('create')}>
                <Sparkles className="h-4 w-4 mr-2" />
                Create custom field
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create Custom Field</DialogTitle>
              <DialogDescription>
                This field will be saved to the shared library and added to this schema.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Label *</Label>
                  <Input
                    value={draft.label}
                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value, key: labelToKey(e.target.value) }))}
                    placeholder="API Key"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Key *</Label>
                  <Input
                    value={draft.key}
                    onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
                    placeholder="api_key"
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v as FieldType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Placeholder</Label>
                <Input
                  value={draft.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, placeholder: e.target.value }))}
                  placeholder="Optional placeholder text"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Help Text</Label>
                <Textarea
                  value={draft.help_text}
                  onChange={(e) => setDraft((d) => ({ ...d, help_text: e.target.value }))}
                  placeholder="Description shown below the field"
                  rows={2}
                />
              </div>

              <div className="flex gap-5 pt-1">
                <div className="flex items-center gap-2">
                  <Switch id="df-req" checked={draft.is_required} onCheckedChange={(v) => setDraft((d) => ({ ...d, is_required: v }))} />
                  <Label htmlFor="df-req" className="cursor-pointer">Required</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="df-sec" checked={draft.is_secret} onCheckedChange={(v) => setDraft((d) => ({ ...d, is_secret: v }))} />
                  <Label htmlFor="df-sec" className="cursor-pointer">Secret</Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMode('pick')}>Back</Button>
              <Button type="button" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating…' : 'Create & Add'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Field Dialog ─────────────────────────────────────────────────────────
// Edit a field's properties within this schema (does not modify the library)

interface EditFieldDialogProps {
  field: ConnectorSchemaField | null;
  onClose: () => void;
  onSave: (updated: ConnectorSchemaField) => void;
}

function EditFieldDialog({ field, onClose, onSave }: EditFieldDialogProps) {
  const [draft, setDraft] = useState<ConnectorSchemaField | null>(null);

  // Sync draft when field changes
  useEffect(() => {
    setDraft(field ? { ...field } : null);
  }, [field]);

  if (!draft) return null;

  const set = (updates: Partial<ConnectorSchemaField>) => setDraft((d) => d ? { ...d, ...updates } : d);

  const addOption = () =>
    set({ options: [...(draft.options || []), { value: `option_${Date.now()}`, label: 'New Option' }] });

  const updateOption = (i: number, updates: { value?: string; label?: string }) => {
    const opts = [...(draft.options || [])];
    opts[i] = { ...opts[i], ...updates };
    set({ options: opts });
  };

  const removeOption = (i: number) =>
    set({ options: (draft.options || []).filter((_, idx) => idx !== i) });

  return (
    <Dialog open={!!field} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Field</DialogTitle>
          <DialogDescription>
            Customise how <code className="font-mono text-xs">{draft.key}</code> appears in this connector's schema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Key — read-only */}
          <div className="space-y-1.5">
            <Label>Field Key</Label>
            <div className="px-3 py-2 rounded-md bg-muted text-sm font-mono text-muted-foreground border select-all">
              {draft.key}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label htmlFor="ef-label">Label</Label>
            <Input id="ef-label" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={draft.type} onValueChange={(v) => set({ type: v as FieldType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* OAuth provider */}
          {draft.type === 'oauth' && (
            <div className="space-y-1.5">
              <Label>OAuth Provider</Label>
              <Select value={draft.provider ?? 'google'} onValueChange={(v) => set({ provider: v as 'google' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Toggles */}
          {draft.type !== 'oauth' && (
            <div className="flex gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch id="ef-req" checked={draft.required ?? false} onCheckedChange={(v) => set({ required: v })} />
                <Label htmlFor="ef-req" className="cursor-pointer">Required</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ef-sec" checked={draft.secret ?? false} onCheckedChange={(v) => set({ secret: v })} />
                <Label htmlFor="ef-sec" className="cursor-pointer">Secret</Label>
              </div>
            </div>
          )}

          {/* Placeholder */}
          {draft.type !== 'oauth' && (
            <div className="space-y-1.5">
              <Label htmlFor="ef-ph">Placeholder</Label>
              <Input id="ef-ph" value={draft.placeholder ?? ''} onChange={(e) => set({ placeholder: e.target.value })} />
            </div>
          )}

          {/* Help text */}
          <div className="space-y-1.5">
            <Label htmlFor="ef-help">Help Text</Label>
            <Textarea id="ef-help" value={draft.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value })} rows={2} />
          </div>

          {/* Default value */}
          {draft.type !== 'boolean' && draft.type !== 'oauth' && (
            <div className="space-y-1.5">
              <Label htmlFor="ef-default">Default Value</Label>
              <Input
                id="ef-default"
                type={draft.type === 'number' ? 'number' : 'text'}
                value={draft.default?.toString() ?? ''}
                onChange={(e) => set({ default: draft.type === 'number' ? Number(e.target.value) : e.target.value })}
                placeholder="Optional"
              />
            </div>
          )}

          {draft.type === 'boolean' && (
            <div className="flex items-center gap-2">
              <Switch
                id="ef-default-bool"
                checked={(draft.default as boolean) ?? false}
                onCheckedChange={(v) => set({ default: v })}
              />
              <Label htmlFor="ef-default-bool" className="cursor-pointer">Default to enabled</Label>
            </div>
          )}

          {/* Select options */}
          {draft.type === 'select' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <Button type="button" size="sm" variant="outline" onClick={addOption}>
                  <Plus className="h-3 w-3 mr-1" />Add Option
                </Button>
              </div>
              <div className="space-y-2">
                {(draft.options || []).map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={opt.value} onChange={(e) => updateOption(i, { value: e.target.value })} placeholder="Value" className="flex-1 font-mono text-sm" />
                    <Input value={opt.label} onChange={(e) => updateOption(i, { label: e.target.value })} placeholder="Label" className="flex-1" />
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeOption(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation */}
          {(draft.type === 'text' || draft.type === 'textarea' || draft.type === 'number') && (
            <div className="space-y-3 pt-3 border-t">
              <Label className="text-sm font-semibold">Validation</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{draft.type === 'number' ? 'Min Value' : 'Min Length'}</Label>
                  <Input
                    type="number"
                    value={draft.validation?.min ?? ''}
                    onChange={(e) => set({ validation: { ...draft.validation, min: e.target.value ? Number(e.target.value) : undefined } })}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{draft.type === 'number' ? 'Max Value' : 'Max Length'}</Label>
                  <Input
                    type="number"
                    value={draft.validation?.max ?? ''}
                    onChange={(e) => set({ validation: { ...draft.validation, max: e.target.value ? Number(e.target.value) : undefined } })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              {draft.type !== 'number' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Regex Pattern</Label>
                    <Input
                      value={draft.validation?.pattern ?? ''}
                      onChange={(e) => set({ validation: { ...draft.validation, pattern: e.target.value } })}
                      placeholder="e.g. ^[A-Z0-9]+$"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Custom Error Message</Label>
                    <Input
                      value={draft.validation?.customMessage ?? ''}
                      onChange={(e) => set({ validation: { ...draft.validation, customMessage: e.target.value } })}
                      placeholder="Optional"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => { onSave(draft); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ConnectorSchemaBuilder({ initialSchema, onChange }: SchemaBuilderProps) {
  const [schema, setSchema] = useState<ConnectorConfigSchema>(initialSchema ?? { fields: [] });
  const [library, setLibrary] = useState<ConnectorConfiguration[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingField, setEditingField] = useState<ConnectorSchemaField | null>(null);

  useEffect(() => {
    getFieldLibrary().then(setLibrary).catch(() => {});
  }, []);

  const update = (s: ConnectorConfigSchema) => { setSchema(s); onChange(s); };

  const addField = (field: ConnectorSchemaField) => {
    const next = { ...schema, fields: [...schema.fields, field] };
    update(next);
  };

  const saveEdit = (updated: ConnectorSchemaField) => {
    const idx = schema.fields.findIndex((f) => f.key === updated.key);
    if (idx === -1) return;
    const fields = [...schema.fields];
    fields[idx] = updated;
    update({ ...schema, fields });
  };

  const removeField = (key: string) =>
    update({ ...schema, fields: schema.fields.filter((f) => f.key !== key) });

  const moveField = (index: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= schema.fields.length) return;
    const fields = [...schema.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    update({ ...schema, fields });
  };

  const existingKeys = new Set(schema.fields.map((f) => f.key));

  return (
    <div className="space-y-6">
      <Tabs defaultValue="builder">
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="h-4 w-4 mr-1.5" />Preview
          </TabsTrigger>
        </TabsList>

        {/* ── Builder ── */}
        <TabsContent value="builder" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Configuration Fields</CardTitle>
                  <CardDescription>
                    {schema.fields.length === 0
                      ? 'No fields yet — add from the library below'
                      : `${schema.fields.length} field${schema.fields.length !== 1 ? 's' : ''} configured`}
                  </CardDescription>
                </div>
                <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {schema.fields.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Pick fields from the shared library or create a custom one.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add your first field
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {schema.fields.map((field, i) => (
                    <div
                      key={`${field.key}-${i}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
                    >
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{field.label}</span>
                          {field.secret && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              <Lock className="h-3 w-3" />Secret
                            </span>
                          )}
                          {field.required && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Required</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <code className="font-mono">{field.key}</code>
                          <span className="mx-1.5">·</span>
                          {field.type}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setEditingField(field)}
                          title="Edit field"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => moveField(i, 'up')}
                          disabled={i === 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => moveField(i, 'down')}
                          disabled={i === schema.fields.length - 1}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => removeField(field.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Preview ── */}
        <TabsContent value="preview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Form Preview</CardTitle>
              <CardDescription>How this form appears to org admins</CardDescription>
            </CardHeader>
            <CardContent>
              {schema.fields.length > 0 ? (
                <DynamicConnectorForm
                  schema={schema}
                  initialValues={{}}
                  existingSecrets={[]}
                  onSubmit={async () => {}}
                  loading={false}
                  previewOnly
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Add fields to see the form preview.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Add Field Dialog */}
      <AddFieldDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        library={library}
        existingKeys={existingKeys}
        onAdd={addField}
        onCreated={(entry) => setLibrary((prev) => [...prev, entry])}
      />

      {/* Edit Field Dialog */}
      <EditFieldDialog
        field={editingField}
        onClose={() => setEditingField(null)}
        onSave={saveEdit}
      />
    </div>
  );
}
