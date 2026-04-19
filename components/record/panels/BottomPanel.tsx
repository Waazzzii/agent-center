'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import type { RecordedStep } from '@/lib/api/scripts';
import { VariablesPanel, type VariableInfo } from './VariablesPanel';
import { SelectorPanel } from './SelectorPanel';
import { JsonPanel } from './JsonPanel';

type TabId = 'variables' | 'selector' | 'json';

interface BottomPanelProps {
  // Variables
  variables: Map<string, VariableInfo>;
  params: Record<string, string>;
  onParamsChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onRenameVariable: (oldName: string, newName: string) => void;
  onDeleteVariable: (name: string) => void;
  hoveredStep: number | null;
  variableNames: string[];

  // Selector + JSON
  currentStep: RecordedStep | null;
  currentStepIndex: number;
  onUpdateStep: (updated: RecordedStep) => void;
  needsSelectorReview: (s: RecordedStep) => boolean;

  // JSON editor
  editedStep: string;
  onEditedStepChange: (value: string) => void;
  stepEditError: string;
  isExecuting: boolean;
  isRecording: boolean;

  // Extracted values
  extracted: Record<string, string>;
}

export function BottomPanel({
  variables, params, onParamsChange, onRenameVariable, onDeleteVariable, hoveredStep, variableNames,
  currentStep, currentStepIndex, onUpdateStep, needsSelectorReview,
  editedStep, onEditedStepChange, stepEditError,
  isExecuting, isRecording, extracted,
}: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('variables');
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHeight, setPanelHeight] = useState(360);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'variables', label: 'Variables' },
    { id: 'selector', label: 'Selector' },
    { id: 'json', label: 'JSON' },
  ];

  // Status dot for Selector tab
  const selectorDot = currentStep
    ? needsSelectorReview(currentStep)
      ? <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      : (currentStep.selector ?? currentStep.waitFor?.selector) && (currentStep.selector ?? currentStep.waitFor?.selector) !== 'body'
      ? <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
      : null
    : null;

  return (
    <div className="shrink-0 flex flex-col-reverse">
      {/* Tab bar */}
      <div className="flex items-center gap-2 px-3 shrink-0 bg-muted/50 border-t border-border/50">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id && panelOpen;
          return (
            <button
              key={tab.id}
              className={cn(
                'px-3 py-1.5 text-[10px] font-medium transition-all flex items-center gap-1.5 border-t-2',
                isActive
                  ? 'border-brand text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
              onClick={() => {
                if (activeTab === tab.id) setPanelOpen((o) => !o);
                else { setActiveTab(tab.id); setPanelOpen(true); }
              }}
            >
              {tab.label}
              {tab.id === 'selector' && selectorDot}
            </button>
          );
        })}

        {/* Extracted values inline */}
        {Object.keys(extracted).length > 0 && (
          <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0 ml-auto pr-1">
            {Object.entries(extracted).slice(0, 3).map(([k, v]) => (
              <span key={k} className="text-[9px] font-mono truncate">
                <span className="text-purple-400">{k}</span><span className="text-muted-foreground">={String(v).slice(0, 20)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Panel content */}
      {panelOpen && (
        <div className="flex flex-col" style={{ height: panelHeight, maxHeight: '50vh' }}>
          {/* Resize handle — fixed, never scrolls */}
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

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'variables' && (
              <VariablesPanel
                variables={variables}
                params={params}
                onParamsChange={onParamsChange}
                onRenameVariable={onRenameVariable}
                onDeleteVariable={onDeleteVariable}
                hoveredStep={hoveredStep}
              />
            )}

            {activeTab === 'selector' && currentStep && (
              <SelectorPanel
                step={currentStep}
                stepIndex={currentStepIndex}
                onUpdateStep={onUpdateStep}
              />
            )}
            {activeTab === 'selector' && !currentStep && (
              <div className="px-3 py-8 text-[10px] text-muted-foreground text-center">
                No active step to configure selectors for.
              </div>
            )}

            {activeTab === 'json' && currentStep && (
              <JsonPanel
                stepIndex={currentStepIndex}
                stepAction={currentStep.action}
                editedStep={editedStep}
                onEditedStepChange={onEditedStepChange}
                stepEditError={stepEditError}
                variableNames={variableNames}
              />
            )}
            {activeTab === 'json' && !currentStep && (
              <div className="px-3 py-8 text-[10px] text-muted-foreground text-center">
                No active step to edit.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
