'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { VariablesPanel, type VariableInfo } from './VariablesPanel';

interface BottomPanelProps {
  // Variables only — selector and JSON moved to the step-edit modal.
  variables: Map<string, VariableInfo>;
  params: Record<string, string>;
  onParamsChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onRenameVariable: (oldName: string, newName: string) => void;
  onDeleteVariable: (name: string) => void;
  hoveredStep: number | null;

  // Extracted values — surfaced in the collapsed header so operators
  // can spot fresh captures without expanding the panel.
  extracted: Record<string, string>;
}

/**
 * Bottom-of-right-rail panel. After the step-edit modal absorbed the
 * Selector and JSON editors, this panel is dedicated to Variables —
 * always visible (collapsible), with the most recent extracted values
 * inline on the header so they don't get lost on every step run.
 */
export function BottomPanel({
  variables, params, onParamsChange, onRenameVariable, onDeleteVariable, hoveredStep,
  extracted,
}: BottomPanelProps) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHeight, setPanelHeight] = useState(360);

  return (
    <div className="shrink-0 flex flex-col-reverse">
      {/* Header — single toggle, no tabs */}
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 shrink-0 bg-muted/50 border-t border-border/50 text-left hover:bg-muted/70 transition-colors"
        onClick={() => setPanelOpen((o) => !o)}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-foreground">
          Variables
        </span>
        <span className="text-[9px] text-muted-foreground tabular-nums">
          {variables.size}
        </span>

        {/* Extracted values inline — capped at three so the header doesn't bloat */}
        {Object.keys(extracted).length > 0 && (
          <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0 ml-2">
            {Object.entries(extracted).slice(0, 3).map(([k, v]) => (
              <span key={k} className="text-[9px] font-mono truncate">
                <span className="text-purple-400">{k}</span>
                <span className="text-muted-foreground">={String(v).slice(0, 20)}</span>
              </span>
            ))}
          </div>
        )}

        <span className="ml-auto text-muted-foreground">
          {panelOpen
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronUp className="h-3 w-3" />}
        </span>
      </button>

      {panelOpen && (
        <div className="flex flex-col" style={{ height: panelHeight, maxHeight: '50vh' }}>
          {/* Resize handle */}
          <div
            className="h-1 cursor-ns-resize bg-border/30 hover:bg-brand/30 active:bg-brand/50 transition-colors shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              const startY = e.clientY;
              const startH = panelHeight;
              const onMove = (me: MouseEvent) => setPanelHeight(Math.max(60, startH + (startY - me.clientY)));
              const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />

          <div className="flex-1 overflow-y-auto min-h-0">
            <VariablesPanel
              variables={variables}
              params={params}
              onParamsChange={onParamsChange}
              onRenameVariable={onRenameVariable}
              onDeleteVariable={onDeleteVariable}
              hoveredStep={hoveredStep}
            />
          </div>
        </div>
      )}
    </div>
  );
}
