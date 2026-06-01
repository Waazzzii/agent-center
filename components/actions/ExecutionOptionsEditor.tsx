'use client';

/**
 * components/actions/ExecutionOptionsEditor.tsx
 *
 * Inline editor for the two per-action cross-cutting attachments stored on
 * agent_actions.execution_options (migration 212):
 *
 *   conditional_execution  Per-item predicate. Items where the predicate
 *                          is TRUE run the step; items where it's FALSE
 *                          passthrough to the next step unchanged.
 *
 *   continue_on_failure    Treat a step failure as a tolerated warning —
 *                          items passthrough, agent continues.
 *
 * Rendered inline inside the agent editor step list (NOT a modal). Operator
 * toggles "Apply Conditional Execution" / "Allow Failure" via buttons; once
 * applied, the predicate/flag becomes editable inline with a small
 * borderless form. The agents page re-fetches actions on save so the
 * step card's visual indicators (top stripe + summary line) refresh.
 *
 * Builder-only by design — no raw expression mode. Operators pick a field
 * from the previous step's declared_outputs (when available), an operator
 * from the dropdown, and a value typed to match.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ConditionalExecution,
  ConditionalOperator,
  ExecutionOptions,
} from '@/lib/api/agents';

interface Props {
  value: ExecutionOptions | null | undefined;
  /** Fires on every change — caller debounces or saves on Apply/Save. */
  onChange: (next: ExecutionOptions) => void;
  /** Optional list of field name suggestions (typically from the previous
   *  step's declared_outputs schema). Free-form text fallback if empty. */
  fieldSuggestions?: string[];
  className?: string;
}

const NULLARY_OPERATORS: ReadonlySet<ConditionalOperator> = new Set([
  'empty', 'not_empty', 'exists', 'not_exists',
]);

const OPERATOR_LABELS: Record<ConditionalOperator, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  // exists/not_exists are the operator-facing labels for the same
  // semantics as not_empty/empty respectively. We surface BOTH names
  // in the dropdown so operators who think in "exists" terms find the
  // option immediately, and operators who think in "empty" terms find
  // it too. Either selection persists to the equivalent operator in
  // the executor (both forms evaluated identically there).
  exists: 'exists',
  not_exists: 'does not exist',
  empty: 'is empty',
  not_empty: 'is not empty',
  contains: 'contains',
};

export function ExecutionOptionsEditor({ value, onChange, fieldSuggestions, className }: Props) {
  const opts: ExecutionOptions = value ?? {};
  const hasConditional = !!opts.conditional_execution;
  const hasContinueOnFailure = opts.continue_on_failure === true;

  const applyConditional = () => {
    // Default to a sane starting point: empty field name + 'eq' so the
    // operator dropdown lands somewhere predictable. The form below will
    // nudge the user to fill in the field.
    onChange({
      ...opts,
      conditional_execution: { field: '', operator: 'eq', value: '' },
    });
  };

  const removeConditional = () => {
    const { conditional_execution: _ignored, ...rest } = opts;
    onChange(rest);
  };

  const updateConditional = (patch: Partial<ConditionalExecution>) => {
    const next: ConditionalExecution = {
      ...(opts.conditional_execution ?? { field: '', operator: 'eq', value: '' }),
      ...patch,
    };
    // Drop `value` when the operator becomes nullary; restore an empty
    // string when transitioning back so the input doesn't render undefined.
    if (NULLARY_OPERATORS.has(next.operator)) {
      delete (next as ConditionalExecution & { value?: unknown }).value;
    } else if (next.value === undefined) {
      next.value = '';
    }
    onChange({ ...opts, conditional_execution: next });
  };

  const toggleContinueOnFailure = () => {
    if (hasContinueOnFailure) {
      const { continue_on_failure: _ignored, ...rest } = opts;
      onChange(rest);
    } else {
      onChange({ ...opts, continue_on_failure: true });
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* ── Conditional Execution ──────────────────────────────────── */}
      {!hasConditional ? (
        <Button
          variant="outline"
          size="sm"
          onClick={applyConditional}
          className="h-7 text-xs gap-1.5 border-dashed"
          type="button"
        >
          <Filter className="h-3 w-3" />
          Apply Conditional Execution
        </Button>
      ) : (
        <ConditionalEditor
          predicate={opts.conditional_execution!}
          onUpdate={updateConditional}
          onRemove={removeConditional}
          fieldSuggestions={fieldSuggestions}
        />
      )}

      {/* ── Continue on Failure ────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={toggleContinueOnFailure}
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs transition-colors',
            hasContinueOnFailure
              ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 hover:bg-amber-100'
              : 'border-dashed border-input hover:bg-muted/40',
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          {hasContinueOnFailure ? 'Failures allowed (click to disable)' : 'Allow Failure'}
        </button>
      </div>
    </div>
  );
}

/** Sub-editor for the conditional_execution predicate. Field + operator
 *  + value, with a remove button to clear the attachment entirely. */
function ConditionalEditor({
  predicate,
  onUpdate,
  onRemove,
  fieldSuggestions,
}: {
  predicate: ConditionalExecution;
  onUpdate: (patch: Partial<ConditionalExecution>) => void;
  onRemove: () => void;
  fieldSuggestions?: string[];
}) {
  const isNullary = NULLARY_OPERATORS.has(predicate.operator);
  const hasSuggestions = (fieldSuggestions?.length ?? 0) > 0;
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <Filter className="h-3 w-3" />
          Run only if
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove conditional execution"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-[2fr_1.4fr_2fr] gap-1.5 items-start">
        {/* Field — text input with optional datalist of suggestions */}
        <div className="space-y-1">
          <Input
            type="text"
            value={predicate.field}
            onChange={(e) => onUpdate({ field: e.target.value })}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="field"
            className="h-7 text-xs"
            list={hasSuggestions ? 'execution-options-field-suggestions' : undefined}
          />
          {hasSuggestions && showSuggestions && (
            <datalist id="execution-options-field-suggestions">
              {fieldSuggestions!.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          )}
        </div>

        {/* Operator */}
        <Select
          value={predicate.operator}
          onValueChange={(v) => onUpdate({ operator: v as ConditionalOperator })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(OPERATOR_LABELS) as ConditionalOperator[]).map((op) => (
              <SelectItem key={op} value={op} className="text-xs">
                {OPERATOR_LABELS[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value (suppressed for nullary operators) */}
        {isNullary ? (
          <div className="h-7 px-2 flex items-center text-[11px] text-muted-foreground italic">
            (no value)
          </div>
        ) : (
          <Input
            type="text"
            value={predicate.value == null ? '' : String(predicate.value)}
            onChange={(e) => {
              // Light type coercion: numeric strings → number, "true"/"false"
              // → boolean, anything else stays a string. The backend
              // validator accepts these forms and the executor compares
              // with === (so type matters for `eq`/`neq`).
              const raw = e.target.value;
              let parsed: ConditionalExecution['value'] = raw;
              if (raw === 'true') parsed = true;
              else if (raw === 'false') parsed = false;
              else if (raw !== '' && !isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw)) parsed = Number(raw);
              onUpdate({ value: parsed });
            }}
            placeholder="value"
            className="h-7 text-xs"
          />
        )}
      </div>

      <p className="text-[10px] text-muted-foreground leading-tight">
        Items where this is true run the step. Items where it&apos;s false skip just this step
        and continue to the next one with their input unchanged.
      </p>
    </div>
  );
}

/** Compact one-line summary of a step's execution_options, for rendering
 *  on the step card body. Returns null if there's nothing to summarize. */
export function ExecutionOptionsSummary({ options }: { options: ExecutionOptions | null | undefined }) {
  if (!options) return null;
  const bits: React.ReactNode[] = [];
  if (options.conditional_execution) {
    const { field, operator, value } = options.conditional_execution;
    const opLabel = OPERATOR_LABELS[operator] ?? operator;
    const summary = NULLARY_OPERATORS.has(operator)
      ? `${field || '<field>'} ${opLabel}`
      : `${field || '<field>'} ${opLabel} ${JSON.stringify(value)}`;
    bits.push(
      <span key="cond" className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
        <Filter className="h-2.5 w-2.5" />
        Only if {summary}
      </span>,
    );
  }
  if (options.continue_on_failure) {
    bits.push(
      <span key="fail" className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-2.5 w-2.5" />
        Failures allowed
      </span>,
    );
  }
  if (bits.length === 0) return null;
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">{bits}</div>;
}
