'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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
}

export function VariablesPanel({ variables, params, onParamsChange, onRenameVariable, onDeleteVariable, hoveredStep }: VariablesPanelProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const allVarNames = new Set([...variables.keys(), ...Object.keys(params).filter((k) => !variables.has(k))]);

  const handleSubmitRename = (oldName: string) => {
    const safeName = editingValue.trim().replace(/\s+/g, '_').replace(/\W/g, '');
    onRenameVariable(oldName, safeName || oldName);
    setEditingName(null);
  };

  return (
    <div className="px-3 py-2 space-y-1.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <h4 className="text-xs font-medium text-foreground">Variables</h4>
        <span className="text-[9px] text-muted-foreground">{allVarNames.size} total</span>
      </div>

      {/* Rows */}
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

        return (
          <div key={name} className={cn(
            'rounded border transition-colors',
            isRelevant ? 'border-purple-400/40 bg-purple-500/5' : 'border-border/40 hover:border-border/80'
          )}>
            {/* Name row */}
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              {isEditing ? (
                <form className="flex-1" onSubmit={(e) => { e.preventDefault(); handleSubmitRename(name); }}>
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
                  className="flex-1 text-left font-mono text-xs text-purple-400 hover:text-purple-300 transition-colors truncate"
                  onClick={() => { setEditingName(name); setEditingValue(name); }}
                  title="Click to rename"
                >
                  {`{{${name}}}`}
                </button>
              )}
              <div className="flex items-center gap-1 shrink-0">
                {info?.sources.length ? (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-medium"
                    title={info.sources.map((r) => `Step ${r.index + 1} — ${r.action} (outputs this variable)`).join('\n')}
                  >
                    O{info.sources.map((r) => r.index + 1).join(',')}
                  </span>
                ) : null}
                {info?.consumers.length ? (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                    title={info.consumers.map((r) => `Step ${r.index + 1} — ${r.action} (inputs this variable)`).join('\n')}
                  >
                    I{info.consumers.map((r) => r.index + 1).join(',')}
                  </span>
                ) : null}
                {!info && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">manual</span>
                )}
                {/* Delete — only when not referenced by any step */}
                {onDeleteVariable && (
                  <button
                    className={cn(
                      'p-0.5 rounded transition-colors',
                      inUse
                        ? 'text-muted-foreground/20 cursor-not-allowed'
                        : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                    )}
                    onClick={() => !inUse && onDeleteVariable(name)}
                    disabled={inUse}
                    title={inUse
                      ? `In use: ${[...(info?.sources ?? []).map((r) => `step ${r.index + 1} (${r.action} — sets)`), ...(info?.consumers ?? []).map((r) => `step ${r.index + 1} (${r.action} — reads)`)].join(', ')}`
                      : 'Delete variable'
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            {/* Value row */}
            <div className="px-2.5 pb-1.5">
              <input
                className="w-full text-xs bg-muted/30 rounded px-2 py-1 border border-border/30 focus:border-border focus:outline-none font-mono"
                placeholder="test value"
                value={params[name] ?? ''}
                onChange={(e) => onParamsChange((p) => ({ ...p, [name]: e.target.value }))}
              />
            </div>
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
            if (safeName) onParamsChange((p) => ({ ...p, [safeName]: '' }));
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
