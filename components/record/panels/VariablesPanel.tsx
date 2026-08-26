'use client';

import { useState } from 'react';
import { Plus, Trash2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RESERVED_PARAMS, isReservedParam } from '@/lib/script-params';
import type { RecordedStep, SelectorCandidate } from '@/lib/api/scripts';

export interface VariableRef {
  index: number;
  action: string;
}

export interface VariableInfo {
  sources: VariableRef[];
  consumers: VariableRef[];
}

interface VariablesPanelProps {
  variables: Map<string, VariableInfo>;
  params: Record<string, string>;
  onParamsChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onRenameVariable: (oldName: string, newName: string) => void;
  onDeleteVariable?: (name: string) => void;
  hoveredStep: number | null;
  /** Report the step indices a variable touches while it's hovered/edited, so
   *  the step list can highlight them (null clears the highlight). */
  onHoverVariable?: (steps: Set<number> | null) => void;
}

export function VariablesPanel({ variables, params, onParamsChange, onRenameVariable, onDeleteVariable, hoveredStep, onHoverVariable }: VariablesPanelProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const allVarNames = new Set([...variables.keys(), ...Object.keys(params).filter((k) => !variables.has(k))]);

  const handleSubmitRename = (oldName: string) => {
    const safeName = editingValue.trim().replace(/\s+/g, '_').replace(/\W/g, '');
    // Renaming a normal variable INTO a reserved name would make the engine
    // start overwriting it at runtime. Reserved rows themselves aren't
    // renameable (they render without the rename affordance).
    if (isReservedParam(safeName) || isReservedParam(oldName)) {
      setEditingName(null);
      return;
    }
    onRenameVariable(oldName, safeName || oldName);
    setEditingName(null);
  };

  return (
    <div className="px-2 py-1.5 space-y-1">
      {allVarNames.size === 0 && !adding && (
        <p className="text-[10px] text-muted-foreground/60 py-3 text-center">
          No variables yet. Use <code className="bg-muted px-0.5 rounded font-mono">{'{{name}}'}</code> in any step.
        </p>
      )}

      {Array.from(allVarNames).map((name) => {
        const info = variables.get(name);
        const isRelevant = hoveredStep != null && (
          (info?.sources.some((r) => r.index === hoveredStep) || info?.consumers.some((r) => r.index === hoveredStep))
        );
        const inUse = ((info?.sources.length ?? 0) + (info?.consumers.length ?? 0)) > 0;
        const isEditing = editingName === name;
        // Steps this variable touches (sources set it, consumers read it) —
        // reported up so the step list highlights them on hover/edit.
        const impacted = new Set<number>([
          ...(info?.sources ?? []).map((r) => r.index),
          ...(info?.consumers ?? []).map((r) => r.index),
        ]);
        const flagImpact = () => onHoverVariable?.(impacted.size ? impacted : null);
        const clearImpact = () => onHoverVariable?.(null);

        // Usage summary shown on hover. Group set/read so it reads naturally,
        // e.g. "Set in step 2 · Read in steps 5, 7".
        const setIn = (info?.sources ?? []).map((r) => r.index + 1);
        const readIn = (info?.consumers ?? []).map((r) => r.index + 1);
        const plural = (arr: number[]) => (arr.length > 1 ? 's' : '');
        const usageTitle = inUse
          ? [
              setIn.length ? `Set in step${plural(setIn)} ${setIn.join(', ')}` : null,
              readIn.length ? `Read in step${plural(readIn)} ${readIn.join(', ')}` : null,
            ].filter(Boolean).join(' · ')
          : 'Manual value — not referenced by any step';

        // Engine-supplied variables ({{_mfa}}) render as a locked row: no
        // rename, no delete, and crucially no value input. An editable box
        // here would invite an operator to paste a static 2FA code that
        // expires 30 seconds later, and a rename would silently sever the
        // engine's injection so the field fills blank at runtime.
        const reserved = isReservedParam(name) ? RESERVED_PARAMS[name] : null;
        if (reserved) {
          return (
            <div
              key={name}
              onMouseEnter={flagImpact}
              onMouseLeave={clearImpact}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1 border transition-colors',
                isRelevant ? 'border-purple-400/40 bg-purple-500/5' : 'border-transparent hover:bg-muted/40'
              )}
              title={`{{${name}}}\n${usageTitle}\n\n${reserved.description}`}
            >
              <span className="shrink-0 max-w-[50%] font-mono text-xs text-purple-400/80 truncate">
                {`{{${name}}}`}
              </span>
              <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[10px] text-muted-foreground italic truncate">
                <Lock className="h-2.5 w-2.5 shrink-0" />
                {reserved.label}
              </span>
            </div>
          );
        }

        return (
          <div
            key={name}
            onMouseEnter={flagImpact}
            onMouseLeave={clearImpact}
            className={cn(
              'group flex items-center gap-2 rounded px-2 py-1 border transition-colors',
              isRelevant ? 'border-purple-400/40 bg-purple-500/5' : 'border-transparent hover:bg-muted/40'
            )}
          >
            {/* Name — left, fixed width */}
            {isEditing ? (
              <form className="w-1/2 shrink-0" onSubmit={(e) => { e.preventDefault(); handleSubmitRename(name); }}>
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => handleSubmitRename(name)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(null); }}
                  className="w-full text-xs font-mono text-purple-400 bg-transparent border-none outline-none"
                />
              </form>
            ) : (
              <button
                className="shrink-0 max-w-[50%] text-left font-mono text-xs text-purple-400 hover:text-purple-300 transition-colors truncate"
                onClick={() => { setEditingName(name); setEditingValue(name); }}
                title={`{{${name}}}\n${usageTitle}\nClick to rename`}
              >
                {`{{${name}}}`}
              </button>
            )}

            {/* Value — right, fills the row */}
            <input
              className="flex-1 min-w-0 text-xs bg-muted/30 rounded px-2 py-1 border border-border/30 focus:border-border focus:outline-none font-mono"
              placeholder="test value"
              value={params[name] ?? ''}
              onFocus={flagImpact}
              onBlur={clearImpact}
              onChange={(e) => onParamsChange((p) => ({ ...p, [name]: e.target.value }))}
            />

            {/* Delete — far right; only when the variable isn't referenced */}
            {onDeleteVariable && (
              <button
                className={cn(
                  'shrink-0 p-0.5 rounded transition-colors',
                  inUse
                    ? 'text-muted-foreground/20 cursor-not-allowed'
                    : 'text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100'
                )}
                onClick={() => !inUse && onDeleteVariable(name)}
                disabled={inUse}
                title={inUse ? `In use: ${usageTitle}` : 'Delete variable'}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* Add row */}
      {adding ? (
        <form
          className="rounded border border-dashed border-border/60 px-2.5 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const safeName = newName.trim().replace(/\s+/g, '_').replace(/\W/g, '');
            // Reserved names are engine-supplied — declaring one as a params
            // entry would shadow the injected value with an empty string.
            if (safeName && !isReservedParam(safeName)) onParamsChange((p) => ({ ...p, [safeName]: '' }));
            setNewName('');
            setAdding(false);
          }}
        >
          <input
            autoFocus
            placeholder="variable_name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
            onBlur={() => { if (!newName.trim()) { setAdding(false); setNewName(''); } }}
            className="w-full text-xs font-mono bg-transparent border-none outline-none"
          />
          <span className="text-[8px] text-muted-foreground/60">Enter to add, Esc to cancel</span>
        </form>
      ) : (
        <button
          className="flex items-center gap-1.5 w-full rounded border border-dashed border-border/40 hover:border-border/80 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3" />
          Add variable
        </button>
      )}
    </div>
  );
}
