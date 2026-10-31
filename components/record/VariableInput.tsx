'use client';

/**
 * A text input with a {{variable}} insert menu beside it — the editor's one way
 * to put a variable into a step field, so nobody has to type braces or open the
 * JSON. Inserts at the cursor (or replaces the selection); "New variable…" names
 * one the script does not have yet, which then becomes an input.
 */

import { useRef, useState } from 'react';
import { Braces } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

interface VariableInputProps {
  value: string;
  onChange: (next: string) => void;
  variableNames: string[];
  placeholder?: string;
  mono?: boolean;
  id?: string;
  autoFocus?: boolean;
  /** Called with the selected text when a variable is chosen, before inserting — see SelectorEditor. */
  onPickVariable?: (variable: string, selected: string) => boolean | void;
  'aria-label'?: string;
}

export function VariableInput({
  value, onChange, variableNames, placeholder, mono, id, autoFocus, onPickVariable, ...rest
}: VariableInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // Where the cursor was when the menu opened: focus moves to the menu, and
  // the input's selection is gone by the time an item is chosen.
  const [sel, setSel] = useState<[number, number]>([value.length, value.length]);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  // Controlled, so choosing a NEW variable (typed in the menu, not a menu
  // item) closes it like picking an existing one does.
  const [open, setOpen] = useState(false);

  const insert = (name: string) => {
    setOpen(false);
    const [a, b] = sel;
    const selected = value.slice(a, b);
    // The caller may take over (e.g. replace this value in every locator).
    if (onPickVariable?.(name, selected) === true) return;
    const token = `{{${name}}}`;
    onChange(value.slice(0, a) + token + value.slice(b));
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  const names = [...new Set(variableNames)].filter((n) => !n.startsWith('_')).sort();

  return (
    <div className="flex items-center gap-1.5">
      <Input
        ref={ref}
        id={id}
        autoFocus={autoFocus}
        className={cn('text-xs', mono && 'font-mono')}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={rest['aria-label']}
      />
      <DropdownMenu open={open} onOpenChange={(o) => {
        setOpen(o);
        if (o) {

          const el = ref.current;
          setSel([el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length]);
        } else { setNaming(false); setNewName(''); }
      }}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-[34px] w-[34px] shrink-0" title="Insert a variable" aria-label="Insert a variable">
            <Braces className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">
            {sel[0] !== sel[1] ? 'Replace the selected text with' : 'Insert at the cursor'}
          </DropdownMenuLabel>
          {names.map((n) => (
            <DropdownMenuItem key={n} className="font-mono text-xs" onSelect={() => insert(n)}>{`{{${n}}}`}</DropdownMenuItem>
          ))}
          {names.length > 0 && <DropdownMenuSeparator />}
          {naming ? (
            <div className="flex items-center gap-1 p-1" onKeyDown={(e) => e.stopPropagation()}>
              <Input
                autoFocus
                className="h-7 font-mono text-xs"
                placeholder="new_variable"
                value={newName}
                onChange={(e) => setNewName(e.target.value.trim())}
                onKeyDown={(e) => { if (e.key === 'Enter' && NAME_RE.test(newName)) { insert(newName); setNaming(false); } }}
              />
              <Button size="sm" className="h-7 px-2 text-xs" disabled={!NAME_RE.test(newName)} onClick={() => { insert(newName); setNaming(false); }}>
                Add
              </Button>
            </div>
          ) : (
            <DropdownMenuItem className="text-xs" onSelect={(e) => { e.preventDefault(); setNaming(true); }}>
              New variable…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
