'use client';

import { useState } from 'react';
import { Plus, Trash2, Lock, Copy, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isReservedParam, isLoginSecretParam, reservedParamMeta } from '@/lib/script-params';
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
  /**
   * The reserved variables the login this session runs as OFFERS — its stored
   * credentials as {{_password}} etc., plus {{_mfa}} with a 2FA source. Always
   * listed, used or not, so an operator can see what is available without
   * knowing the convention. null: no login is chosen. undefined: not known
   * (still loading, or a host that does not say) — nothing is flagged.
   */
  loginVariables?: string[] | null;
  /** That login's name, for the section heading and the warnings. */
  loginName?: string | null;
}

export function VariablesPanel({ variables, params, onParamsChange, onRenameVariable, onDeleteVariable, hoveredStep, onHoverVariable, loginVariables, loginName }: VariablesPanelProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const allVarNames = new Set([...variables.keys(), ...Object.keys(params).filter((k) => !variables.has(k))]);
  const offered = loginVariables ?? null;
  // What the login offers that no step uses yet — listed below the script's own.
  const unusedOffered = (offered ?? []).filter((n) => !allVarNames.has(n));
  const loginLabel = loginName ? `"${loginName}"` : 'this login';
  const copyTemplate = (name: string) => {
    try { void navigator.clipboard?.writeText(`{{${name}}}`); } catch { /* clipboard is best-effort */ }
  };

  const handleSubmitRename = (oldName: string) => {
    const safeName = editingValue.trim().replace(/\s+/g, '_').replace(/\W/g, '');
    // Renaming a normal variable INTO a reserved name would make the engine
    // start overwriting it at runtime. Reserved rows themselves aren't
    // renameable (they render without the rename affordance).
    // Renaming INTO a login secret is allowed — {{password}} → {{_password}} is
    // exactly how a script starts using the login's stored password.
    if (isReservedParam(oldName) || (isReservedParam(safeName) && !isLoginSecretParam(safeName))) {
      setEditingName(null);
      return;
    }
    onRenameVariable(oldName, safeName || oldName);
    setEditingName(null);
  };

  return (
    <div className="px-2 py-1.5 space-y-1">
      {allVarNames.size === 0 && unusedOffered.length === 0 && !adding && (
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
        const reserved = reservedParamMeta(name);
        if (reserved) {
          // A login secret the chosen login does not store fills BLANK at run
          // time — say so here rather than at the password prompt.
          const secret = isLoginSecretParam(name);
          const unavailable = secret && (loginVariables === null ? 'no-login' : offered && !offered.includes(name) ? 'not-stored' : null);
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
              <span className={cn(
                'flex-1 min-w-0 flex items-center gap-1.5 text-[10px] italic truncate',
                unavailable ? 'text-warning' : 'text-muted-foreground',
              )}>
                <Lock className="h-2.5 w-2.5 shrink-0" />
                {unavailable === 'not-stored'
                  ? `${loginLabel} stores no ${name.slice(1)} — fills blank`
                  : unavailable === 'no-login'
                    ? 'needs a login — pick one for this session'
                    : reserved.label}
              </span>
            </div>
          );
        }

        // A plain variable the login ALSO offers as a secret ({{password}} while
        // the login stores a password): one click switches it over, so nobody
        // types the password into an agent's inputs.
        const secretTwin = offered?.includes(`_${name}`) && isLoginSecretParam(`_${name}`) ? `_${name}` : null;

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

            {secretTwin && (
              <button
                className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-purple-400 hover:bg-purple-500/10 transition-colors"
                onClick={() => onRenameVariable(name, secretTwin)}
                title={`Fill this from the ${name} stored on ${loginLabel} — renames it to {{${secretTwin}}} in every step`}
              >
                <KeyRound className="h-3 w-3" />
                Use login&apos;s
              </button>
            )}

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

      {/* What the login offers — always listed, used or not. */}
      {unusedOffered.length > 0 && (
        <div className="pt-1.5 mt-1 border-t border-border/30 space-y-0.5">
          <p className="px-2 text-[9px] uppercase tracking-wide text-muted-foreground/70">
            Available from {loginLabel}
          </p>
          {unusedOffered.map((name) => {
            const meta = reservedParamMeta(name);
            return (
              <div
                key={name}
                className="group flex items-center gap-2 rounded px-2 py-1 border border-transparent hover:bg-muted/40"
                title={`{{${name}}}\nNot used by any step yet\n\n${meta?.description ?? ''}`}
              >
                <span className="shrink-0 max-w-[50%] font-mono text-xs text-purple-400/60 truncate">
                  {`{{${name}}}`}
                </span>
                <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[10px] text-muted-foreground/70 italic truncate">
                  <Lock className="h-2.5 w-2.5 shrink-0" />
                  {meta?.label}
                </span>
                <button
                  className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyTemplate(name)}
                  title={`Copy {{${name}}} — paste it as a fill step's value`}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

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
