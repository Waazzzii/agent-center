'use client';

import { useRef, useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface JsonPanelProps {
  stepIndex: number;
  stepAction: string;
  editedStep: string;
  onEditedStepChange: (value: string) => void;
  stepEditError: string;
  variableNames: string[];
}

export function JsonPanel({
  stepIndex,
  stepAction,
  editedStep,
  onEditedStepChange,
  stepEditError,
  variableNames,
}: JsonPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [autocomplete, setAutocomplete] = useState<{ show: boolean; filter: string; cursorStart: number }>({ show: false, filter: '', cursorStart: 0 });

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const close = () => setShowPicker(false);
    const timer = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', close); };
  }, [showPicker]);

  const insertAtCursor = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) { onEditedStepChange(editedStep + token); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    onEditedStepChange(editedStep.slice(0, start) + token + editedStep.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + token.length;
    });
  };

  return (
    <div className="px-3 py-2 space-y-1.5 flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 shrink-0">
        <h4 className="text-xs font-medium text-foreground">
          JSON <span className="font-normal text-muted-foreground">— Step {stepIndex + 1} ({stepAction})</span>
        </h4>
        <div className="flex items-center gap-2">
          {stepEditError && <p className="text-[10px] text-destructive">{stepEditError}</p>}
          {/* Variable insert button */}
          <div className="relative">
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-muted"
              onClick={() => setShowPicker((v) => !v)}
              title="Insert variable"
            >
              {`{{ }}`}
            </button>
            {showPicker && (
              <div className="absolute right-0 top-5 z-[100] bg-popover border rounded-md shadow-lg py-1 min-w-[140px] max-h-40 overflow-y-auto">
                {variableNames.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground px-3 py-2">No variables</p>
                ) : variableNames.map((name) => (
                  <button
                    key={name}
                    className="w-full text-left px-3 py-1 text-[10px] font-mono hover:bg-muted transition-colors"
                    onClick={() => { insertAtCursor(`{{${name}}}`); setShowPicker(false); }}
                  >
                    {`{{${name}}}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="relative flex-1 min-h-0">
        <Textarea
          ref={textareaRef}
          className="font-mono text-[10px] resize-none w-full h-full"
          value={editedStep}
          onChange={(e) => {
            const val = e.target.value;
            onEditedStepChange(val);
            // Detect {{ trigger for inline autocomplete
            const pos = e.target.selectionStart;
            const before = val.slice(0, pos);
            const match = before.match(/\{\{(\w*)$/);
            if (match) {
              setAutocomplete({ show: true, filter: match[1], cursorStart: pos - match[0].length });
            } else {
              setAutocomplete({ show: false, filter: '', cursorStart: 0 });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && autocomplete.show) {
              setAutocomplete({ show: false, filter: '', cursorStart: 0 });
            }
          }}
          onBlur={() => {
            setTimeout(() => setAutocomplete({ show: false, filter: '', cursorStart: 0 }), 150);
          }}
          spellCheck={false}
        />
        {/* Inline autocomplete */}
        {autocomplete.show && (() => {
          const filtered = variableNames.filter((n) => n.toLowerCase().startsWith(autocomplete.filter.toLowerCase()));
          if (filtered.length === 0) return null;
          return (
            <div className="absolute left-0 right-0 z-[100] bg-popover border rounded-md shadow-lg py-1 max-h-32 overflow-y-auto" style={{ top: '2rem' }}>
              {filtered.map((name) => (
                <button
                  key={name}
                  className="w-full text-left px-3 py-1 text-[10px] font-mono hover:bg-muted transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const ta = textareaRef.current;
                    if (!ta) return;
                    const token = `{{${name}}}`;
                    const start = autocomplete.cursorStart;
                    const end = ta.selectionStart;
                    onEditedStepChange(editedStep.slice(0, start) + token + editedStep.slice(end));
                    setAutocomplete({ show: false, filter: '', cursorStart: 0 });
                    requestAnimationFrame(() => {
                      ta.focus();
                      ta.selectionStart = ta.selectionEnd = start + token.length;
                    });
                  }}
                >
                  {`{{${name}}}`}
                </button>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
