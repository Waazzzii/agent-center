'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Globe,
  MousePointer2,
  Type,
  ChevronDown,
  CornerDownLeft,
  Scissors,
  Trash2,
  Pencil,
  Check,
  Layers,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecordedStep } from '@/lib/api/scripts';

interface StepEditorProps {
  steps: RecordedStep[];
  onChange: (steps: RecordedStep[]) => void;
  selectedIndex?: number | null;
  onSelect?: (index: number | null) => void;
  className?: string;
}

function maskValue(value: string, selector?: string): string {
  const sel = (selector ?? '').toLowerCase();
  if (sel.includes('password') || sel.includes('pwd') || sel.includes('secret')) {
    return '••••••••';
  }
  return value;
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

type ActionType = RecordedStep['action'];

const ACTION_ICONS: Record<ActionType, React.ReactNode> = {
  navigate:   <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  click:      <MousePointer2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  fill:       <Type className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  select:     <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  press_key:  <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  extract:    <Scissors className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  switch_tab: <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  close_tab:  <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
};

function StepDescription({ step }: { step: RecordedStep }) {
  switch (step.action) {
    case 'navigate':
      return (
        <span className="flex items-center gap-1.5 text-sm flex-wrap">
          {ACTION_ICONS.navigate}
          <span className="text-muted-foreground">Navigate to</span>
          <span className="font-mono text-xs truncate max-w-[260px]">
            {truncate(step.url ?? '', 50)}
          </span>
        </span>
      );
    case 'click':
      return (
        <span className="flex items-center gap-1.5 text-sm flex-wrap">
          {ACTION_ICONS.click}
          <span className="text-muted-foreground">Click</span>
          <span className="font-mono text-xs">
            {step.text ? truncate(step.text, 40) : truncate(step.selector ?? '', 40)}
          </span>
        </span>
      );
    case 'fill': {
      const rawValue = step.value ?? '';
      const isPlaceholderVal = rawValue.startsWith('{{');
      const displayValue = isPlaceholderVal ? rawValue : maskValue(rawValue, step.selector);
      return (
        <span className="flex items-center gap-1.5 text-sm flex-wrap">
          {ACTION_ICONS.fill}
          <span className="text-muted-foreground">Fill</span>
          <span className="font-mono text-xs">{truncate(step.selector ?? '', 30)}</span>
          <span className="text-muted-foreground">=</span>
          <Badge
            variant={isPlaceholderVal ? 'default' : 'secondary'}
            className={cn(
              'text-xs px-1.5 py-0 h-5 font-mono',
              isPlaceholderVal &&
                'bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30'
            )}
          >
            {displayValue}
          </Badge>
        </span>
      );
    }
    case 'select': {
      const rawValue = step.value ?? '';
      const isPlaceholderVal = rawValue.startsWith('{{');
      return (
        <span className="flex items-center gap-1.5 text-sm flex-wrap">
          {ACTION_ICONS.select}
          <span className="text-muted-foreground">Select</span>
          <Badge
            variant={isPlaceholderVal ? 'default' : 'secondary'}
            className={cn(
              'text-xs px-1.5 py-0 h-5 font-mono',
              isPlaceholderVal &&
                'bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30'
            )}
          >
            {rawValue}
          </Badge>
          <span className="text-muted-foreground">in</span>
          <span className="font-mono text-xs">{truncate(step.selector ?? '', 30)}</span>
        </span>
      );
    }
    case 'press_key':
      return (
        <span className="flex items-center gap-1.5 text-sm">
          {ACTION_ICONS.press_key}
          <span className="text-muted-foreground">Press</span>
          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 font-mono">
            {step.key}
          </Badge>
        </span>
      );
    case 'extract':
      return (
        <span className="flex items-center gap-1.5 text-sm flex-wrap">
          {ACTION_ICONS.extract}
          <span className="text-muted-foreground">Extract text from</span>
          <span className="font-mono text-xs">{truncate(step.selector ?? '', 30)}</span>
          <span className="text-muted-foreground">→ save as</span>
          <Badge className="text-xs px-1.5 py-0 h-5 font-mono bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30">
            {step.field_name ?? '(unnamed)'}
          </Badge>
        </span>
      );
    case 'switch_tab':
      return (
        <span className="flex items-center gap-1.5 text-sm">
          {ACTION_ICONS.switch_tab}
          <span className="text-muted-foreground">Switch to tab</span>
          {step.tab_index !== undefined && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 font-mono">
              {step.tab_index}
            </Badge>
          )}
        </span>
      );
    case 'close_tab':
      return (
        <span className="flex items-center gap-1.5 text-sm">
          {ACTION_ICONS.close_tab}
          <span className="text-muted-foreground">Close tab</span>
        </span>
      );
    default:
      return <span className="text-sm text-muted-foreground">{step.action}</span>;
  }
}

interface StepRowProps {
  step: RecordedStep;
  index: number;
  isSelected?: boolean;
  onSelect?: () => void;
  onDelete: () => void;
  onUpdate: (step: RecordedStep) => void;
}

function StepRow({ step, index, isSelected, onSelect, onDelete, onUpdate }: StepRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<RecordedStep>(step);

  // Placeholder inline state
  const [editingPlaceholder, setEditingPlaceholder] = useState(false);
  const [placeholderInput, setPlaceholderInput] = useState('');

  const canHavePlaceholder =
    step.action === 'fill' || step.action === 'select' || step.action === 'extract';
  const hasPlaceholder = step.value?.startsWith('{{') || step.field_name?.startsWith('{{');

  const commitPlaceholder = () => {
    const name = placeholderInput.trim();
    if (name) {
      if (step.action === 'extract') {
        onUpdate({ ...step, field_name: `{{${name}}}` });
      } else {
        onUpdate({ ...step, value: `{{${name}}}` });
      }
    }
    setEditingPlaceholder(false);
    setPlaceholderInput('');
  };

  const openEdit = () => {
    setEditDraft({ ...step });
    setIsEditing(true);
  };

  const saveEdit = () => {
    onUpdate(editDraft);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditDraft(step);
  };

  if (isEditing) {
    return (
      <div className="border-b px-3 py-2.5 bg-muted/20">
        <div className="flex items-start gap-2">
          <span className="w-5 text-xs text-center text-muted-foreground mt-2 shrink-0 tabular-nums">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0 space-y-2">
            {/* Selector / URL / Key */}
            {step.action === 'navigate' ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">URL</Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={editDraft.url ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, url: e.target.value })}
                  autoFocus
                />
              </div>
            ) : step.action === 'press_key' ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Key</Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={editDraft.key ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, key: e.target.value })}
                  autoFocus
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Selector</Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={editDraft.selector ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, selector: e.target.value })}
                  autoFocus
                />
              </div>
            )}

            {/* Value field for fill/select */}
            {(step.action === 'fill' || step.action === 'select') && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Value{' '}
                  <span className="text-muted-foreground/60">
                    (use {`{{placeholder}}`} for dynamic values)
                  </span>
                </Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={editDraft.value ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, value: e.target.value })}
                />
              </div>
            )}

            {/* Text field for click */}
            {step.action === 'click' && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Button text (optional)</Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={editDraft.text ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, text: e.target.value })}
                />
              </div>
            )}

            {/* Field name for extract */}
            {step.action === 'extract' && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Field name — variable to store extracted text in
                </Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={editDraft.field_name ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, field_name: e.target.value })}
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-0.5">
              <Button size="sm" className="h-6 text-xs px-3" onClick={saveEdit}>
                <Check className="h-3 w-3 mr-1" />
                Done
              </Button>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-b last:border-b-0 px-3 py-2.5 flex items-center gap-2 group transition-colors cursor-pointer',
        isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/30'
      )}
      onClick={onSelect}
    >
      {/* Step number */}
      <span className={cn(
        'w-5 text-xs text-center shrink-0 tabular-nums',
        isSelected ? 'text-primary font-medium' : 'text-muted-foreground'
      )}>
        {index + 1}
      </span>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <StepDescription step={step} />
      </div>

      {/* Placeholder button (for fill/select/extract without existing placeholder) */}
      {canHavePlaceholder && !hasPlaceholder && (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {editingPlaceholder ? (
            <Input
              autoFocus
              className="h-6 text-xs w-32 px-2"
              placeholder="param name…"
              value={placeholderInput}
              onChange={(e) => setPlaceholderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPlaceholder();
                if (e.key === 'Escape') {
                  setEditingPlaceholder(false);
                  setPlaceholderInput('');
                }
              }}
              onBlur={() => {
                if (placeholderInput.trim()) commitPlaceholder();
                else {
                  setEditingPlaceholder(false);
                  setPlaceholderInput('');
                }
              }}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setEditingPlaceholder(true)}
            >
              {`{ }`}
            </Button>
          )}
        </div>
      )}

      {/* Edit button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); openEdit(); }}
        aria-label="Edit step"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="Remove step"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

const ACTION_LABELS: Record<ActionType, string> = {
  navigate:   'Navigate',
  click:      'Click',
  fill:       'Fill',
  select:     'Select',
  press_key:  'Press Key',
  extract:    'Extract',
  switch_tab: 'Switch Tab',
  close_tab:  'Close Tab',
};

function AddStepForm({ onAdd, onCancel }: { onAdd: (step: RecordedStep) => void; onCancel: () => void }) {
  const [action, setAction] = useState<ActionType>('click');
  const [selector, setSelector] = useState('');
  const [url, setUrl] = useState('');
  const [value, setValue] = useState('');
  const [text, setText] = useState('');
  const [key, setKey] = useState('');
  const [fieldName, setFieldName] = useState('');

  const handleAdd = () => {
    let step: RecordedStep;
    switch (action) {
      case 'navigate':
        step = { action: 'navigate', url };
        break;
      case 'click':
        step = { action: 'click', selector, ...(text ? { text } : {}) };
        break;
      case 'fill':
        step = { action: 'fill', selector, value };
        break;
      case 'select':
        step = { action: 'select', selector, value };
        break;
      case 'press_key':
        step = { action: 'press_key', key, selector };
        break;
      case 'extract':
        step = { action: 'extract', selector, field_name: fieldName };
        break;
      case 'switch_tab':
        step = { action: 'switch_tab' };
        break;
      case 'close_tab':
        step = { action: 'close_tab' };
        break;
      default:
        return;
    }
    onAdd(step);
  };

  const isValid = () => {
    if (action === 'navigate') return url.trim().length > 0;
    if (action === 'press_key') return key.trim().length > 0;
    if (action === 'extract') return selector.trim().length > 0 && fieldName.trim().length > 0;
    return selector.trim().length > 0;
  };

  return (
    <div className="px-3 py-3 border-t bg-muted/10 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Action type */}
        <div className="w-36">
          <Select value={action} onValueChange={(v) => setAction(v as ActionType)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ACTION_LABELS) as ActionType[]).map((a) => (
                <SelectItem key={a} value={a} className="text-xs">
                  {ACTION_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* URL for navigate */}
        {action === 'navigate' && (
          <Input
            className="h-7 text-xs font-mono flex-1 min-w-[180px]"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
        )}

        {/* Selector for non-navigate, non-press_key */}
        {action !== 'navigate' && action !== 'press_key' && (
          <Input
            className="h-7 text-xs font-mono flex-1 min-w-[180px]"
            placeholder="Selector (e.g. #submit, input[name=email])"
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            autoFocus
          />
        )}

        {/* Value for fill/select */}
        {(action === 'fill' || action === 'select') && (
          <Input
            className="h-7 text-xs font-mono w-40"
            placeholder="Value or {{param}}"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}

        {/* Text for click */}
        {action === 'click' && (
          <Input
            className="h-7 text-xs w-40"
            placeholder="Button text (optional)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        {/* Key for press_key */}
        {action === 'press_key' && (
          <Input
            className="h-7 text-xs font-mono w-32"
            placeholder="e.g. Enter, Tab"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoFocus
          />
        )}

        {/* Field name for extract */}
        {action === 'extract' && (
          <Input
            className="h-7 text-xs font-mono w-40"
            placeholder="field_name"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 text-xs" disabled={!isValid()} onClick={handleAdd}>
          Add
        </Button>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function StepEditor({ steps, onChange, selectedIndex, onSelect, className }: StepEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const handleDelete = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, updated: RecordedStep) => {
    onChange(steps.map((s, i) => (i === index ? updated : s)));
  };

  const handleAdd = (step: RecordedStep) => {
    onChange([...steps, step]);
    setShowAddForm(false);
  };

  // Collect unique parameter names from all steps
  const allParams = Array.from(
    new Set(
      steps.flatMap((s) => {
        const sources = [s.value ?? '', s.field_name ?? ''];
        return sources.flatMap((src) => {
          const matches = src.match(/\{\{(\w+)\}\}/g);
          return matches ? matches.map((m) => m.replace(/\{\{|\}\}/g, '')) : [];
        });
      })
    )
  );

  return (
    <Card className={className}>
      <CardContent className="p-0">
        {steps.length === 0 && !showAddForm ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No steps yet. Record a session or add steps manually.
          </div>
        ) : (
          <>
            {steps.map((step, i) => (
              <StepRow
                key={i}
                step={step}
                index={i}
                isSelected={selectedIndex === i}
                onSelect={() => onSelect?.(selectedIndex === i ? null : i)}
                onDelete={() => handleDelete(i)}
                onUpdate={(updated) => handleUpdate(i, updated)}
              />
            ))}

            {allParams.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t bg-muted/20">
                <span className="text-xs text-muted-foreground font-medium">
                  Detected parameters:
                </span>
                {allParams.map((param) => (
                  <Badge
                    key={param}
                    variant="default"
                    className="text-xs px-1.5 py-0 h-5 font-mono bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30"
                  >
                    {`{{${param}}}`}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}

        {showAddForm ? (
          <AddStepForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
        ) : (
          <div className="px-3 py-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowAddForm(true)}
            >
              + Add Step
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
