'use client';

/**
 * The Extract tab of the step editor: what an extract step reads and how.
 *
 * Writes the step's `extract` object (agent-backend
 * services/extraction/extract-engine.js is the one implementation, shared by
 * replays and the authoring preview). Choosing "Single value / Auto" with
 * nothing else set REMOVES `extract`, so an untouched step stays exactly the
 * original extract.
 *
 * The row / table selector itself stays on the Selector tab — this tab says
 * what that selector means in each mode.
 */

import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ExtractColumn, ExtractConfig, ExtractRead, ExtractTransform, RecordedStep } from '@/lib/api/scripts';

type Mode = NonNullable<ExtractConfig['mode']>;
type PageMode = 'none' | NonNullable<ExtractConfig['paginate']>['mode'];

const MODES: Array<{ value: Mode; label: string; hint: string }> = [
  { value: 'single', label: 'Single value', hint: 'One element. The selector is the element to read.' },
  { value: 'list', label: 'List of rows', hint: 'Every row the selector matches, with the columns below read from each — in one pass. The selector is the REPEATING row.' },
  { value: 'table', label: 'Table', hint: 'A table or grid, keyed by its own headers. The selector is the table. Leave columns empty to take every column.' },
  { value: 'json', label: 'Page data (JSON)', hint: 'Data the page already carries — a JSON <script> or a window variable. No selector needed.' },
  { value: 'network', label: 'Network response', hint: 'A JSON response the page fetched during the run. No selector needed.' },
];
const READS: Array<{ value: ExtractRead; label: string }> = [
  { value: 'auto', label: 'Auto (value, else text)' },
  { value: 'text', label: 'Text' },
  { value: 'value', label: 'Field value' },
  { value: 'attribute', label: 'Attribute…' },
  { value: 'html', label: 'Inner HTML' },
  { value: 'outer_html', label: 'Outer HTML' },
  { value: 'count', label: 'Count of matches' },
  { value: 'exists', label: 'Exists (true/false)' },
];
const TRANSFORMS: Array<{ value: ExtractTransform; label: string }> = [
  { value: 'trim', label: 'Trim' },
  { value: 'none', label: 'As is' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Whole number' },
  { value: 'lower', label: 'lowercase' },
  { value: 'upper', label: 'UPPERCASE' },
];

const label = 'text-[11px] font-medium text-muted-foreground';
const hint = 'text-[10px] text-muted-foreground';

/** Drop empty values so the saved step carries only what was set. */
function clean(cfg: ExtractConfig): ExtractConfig | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v === undefined || v === '' || v === null) continue;
    if (k === 'columns' && (!v || Object.keys(v as object).length === 0)) continue;
    if ((k === 'json' || k === 'network' || k === 'paginate') && typeof v === 'object') {
      const inner = Object.fromEntries(Object.entries(v as object).filter(([, x]) => x !== undefined && x !== ''));
      if (Object.keys(inner).length) out[k] = inner;
      continue;
    }
    out[k] = v;
  }
  const mode = (out.mode as Mode | undefined) ?? 'single';
  if (mode === 'single') delete out.mode;
  if (out.read === 'auto') delete out.read;
  if (out.transform === 'trim') delete out.transform;
  return Object.keys(out).length ? (out as ExtractConfig) : undefined;
}

function ReadPicker({ read, attribute, onChange }: {
  read?: ExtractRead; attribute?: string;
  onChange: (next: { read?: ExtractRead; attribute?: string }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select value={read ?? 'auto'} onValueChange={(v) => onChange({ read: v as ExtractRead, attribute: v === 'attribute' ? attribute : undefined })}>
        <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{READS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
      </Select>
      {read === 'attribute' && (
        <Input className="h-8 w-[140px] text-xs font-mono" placeholder="href, id, data-id" value={attribute ?? ''}
          onChange={(e) => onChange({ read, attribute: e.target.value })} />
      )}
    </div>
  );
}

function ColumnsEditor({ columns, mode, onChange }: {
  columns: Record<string, ExtractColumn>; mode: Mode;
  onChange: (next: Record<string, ExtractColumn>) => void;
}) {
  const entries = Object.entries(columns);
  const set = (i: number, name: string, col: ExtractColumn) => {
    const next = entries.map(([n, c], k) => (k === i ? [name, col] : [n, c])) as Array<[string, ExtractColumn]>;
    onChange(Object.fromEntries(next));
  };
  const remove = (i: number) => onChange(Object.fromEntries(entries.filter((_, k) => k !== i)));
  const add = () => {
    let n = entries.length + 1;
    while (columns[`column_${n}`]) n++;
    onChange({ ...columns, [`column_${n}`]: {} });
  };
  const where = mode === 'list' ? 'selector' : mode === 'table' ? 'header' : 'path';
  const wherePlaceholder = mode === 'list' ? 'a, td:nth-child(2) (blank = the row)' : mode === 'table' ? 'Status' : 'listing.id';
  return (
    <div className="space-y-1.5">
      {entries.length > 0 && (
        <div className="grid grid-cols-[110px_1fr_auto_1fr_auto] gap-1.5 text-[10px] text-muted-foreground px-0.5">
          <span>Name</span><span>{mode === 'list' ? 'Selector in the row' : mode === 'table' ? 'Header' : 'Path'}</span>
          <span>{mode === 'list' ? 'Read' : ''}</span><span>Pattern</span><span />
        </div>
      )}
      {entries.map(([name, col], i) => (
        <div key={i} className="grid grid-cols-[110px_1fr_auto_1fr_auto] items-center gap-1.5">
          <Input className="h-8 text-xs font-mono" value={name}
            onChange={(e) => set(i, e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'), col)} />
          <Input className="h-8 text-xs font-mono" placeholder={wherePlaceholder} value={(col as Record<string, string | undefined>)[where] ?? ''}
            onChange={(e) => set(i, name, { ...col, [where]: e.target.value || undefined })} />
          {mode === 'list'
            ? <ReadPicker read={col.read} attribute={col.attribute}
                onChange={(r) => set(i, name, { ...col, read: r.read === 'auto' ? undefined : r.read, attribute: r.attribute })} />
            : <span />}
          <Input className="h-8 text-xs font-mono" placeholder="(\d+)" value={col.pattern ?? ''}
            onChange={(e) => set(i, name, { ...col, pattern: e.target.value || undefined })} />
          <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive p-1" aria-label={`Remove ${name}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
        <Plus className="h-3 w-3" /> Add column
      </button>
    </div>
  );
}

export function ExtractOptionsPanel({ step, onChange }: { step: RecordedStep; onChange: (updated: RecordedStep) => void }) {
  const cfg: ExtractConfig = step.extract ?? {};
  const mode: Mode = cfg.mode ?? 'single';
  const update = (patch: Partial<ExtractConfig>) => {
    const next = clean({ ...cfg, ...patch });
    const { extract: _old, ...rest } = step;
    onChange(next ? { ...rest, extract: next } : rest);
  };
  const multi = mode !== 'single';
  const pageMode: PageMode = cfg.paginate?.mode ?? 'none';
  const columns = cfg.columns ?? {};

  return (
    <div className="px-6 py-3 space-y-4">
      {/* What kind of extract */}
      <div className="space-y-1.5">
        <p className={label}>What to extract</p>
        <Select value={mode} onValueChange={(v) => update({
          mode: v as Mode,
          // Options that belong to one mode are cleared when leaving it.
          ...(v === 'single' ? { columns: undefined, limit: undefined, dedupe_by: undefined, as_items: undefined, paginate: undefined } : {}),
          ...(v !== 'json' ? { json: undefined } : {}),
          ...(v !== 'network' ? { network: undefined } : {}),
          ...(!['list', 'table'].includes(v) ? { paginate: undefined } : {}),
        })}>
          <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className={hint}>{MODES.find((m) => m.value === mode)?.hint}</p>
        {(mode === 'list' || mode === 'table' || mode === 'single') && (
          <p className={hint}>
            Selector: <code className="font-mono">{step.selector ? String(step.selector).slice(0, 70) : '— set it on the Selector tab'}</code>
          </p>
        )}
      </div>

      {/* Single value: read + pattern + transform */}
      {mode === 'single' && (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <p className={label}>Read</p>
            <ReadPicker read={cfg.read} attribute={cfg.attribute} onChange={(r) => update(r)} />
            {(cfg.read === 'count' || cfg.read === 'exists') && (
              <p className={hint}>Never fails when nothing matches — 0 / false is the answer. Good for deciding what a later step does.</p>
            )}
          </div>
          {cfg.read !== 'count' && cfg.read !== 'exists' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className={label}>Pattern (optional)</p>
                <Input className="h-8 text-xs font-mono" placeholder="/editor/(\d+)" value={cfg.pattern ?? ''}
                  onChange={(e) => update({ pattern: e.target.value || undefined })} />
                <p className={hint}>A regex. Keeps capture group 1, else the whole match.</p>
              </div>
              <div className="space-y-1.5">
                <p className={label}>Clean up</p>
                <Select value={cfg.transform ?? 'trim'} onValueChange={(v) => update({ transform: v as ExtractTransform })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{TRANSFORMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Page data / network source */}
      {mode === 'json' && (
        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div className="space-y-1.5">
            <p className={label}>Script element, or window variable</p>
            <Input className="h-8 text-xs font-mono" placeholder="script#__NEXT_DATA__"
              value={cfg.json?.selector ?? (cfg.json?.global ? `window.${cfg.json.global}` : '')}
              onChange={(e) => {
                const v = e.target.value.trim();
                update({ json: v.startsWith('window.')
                  ? { ...cfg.json, global: v.slice(7) || undefined, selector: undefined }
                  : { ...cfg.json, selector: v || undefined, global: undefined } });
              }} />
            <p className={hint}>A &lt;script&gt; holding JSON, or <code className="font-mono">window.name</code>.</p>
          </div>
          <div className="space-y-1.5">
            <p className={label}>Path</p>
            <Input className="h-8 text-xs font-mono" placeholder="props.pageProps.listings[*]" value={cfg.json?.path ?? ''}
              onChange={(e) => update({ json: { ...cfg.json, path: e.target.value || undefined } })} />
            <p className={hint}>Dots, <code className="font-mono">[0]</code> and <code className="font-mono">[*]</code> for every entry.</p>
          </div>
        </div>
      )}
      {mode === 'network' && (
        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div className="space-y-1.5">
            <p className={label}>Response URL contains</p>
            <Input className="h-8 text-xs font-mono" placeholder="/api/v3/Listings" value={cfg.network?.url_contains ?? ''}
              onChange={(e) => update({ network: { ...cfg.network, url_contains: e.target.value } })} />
            <p className={hint}>Capture starts with the run, so the page must fetch it after the script begins.</p>
          </div>
          <div className="space-y-1.5">
            <p className={label}>Path</p>
            <Input className="h-8 text-xs font-mono" placeholder="data.items[*]" value={cfg.network?.path ?? ''}
              onChange={(e) => update({ network: { url_contains: cfg.network?.url_contains ?? '', path: e.target.value || undefined } })} />
          </div>
        </div>
      )}

      {/* Columns, rows, output */}
      {multi && (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <p className={label}>Columns{mode === 'table' ? ' (optional — leave empty for every column)' : ''}</p>
            {mode === 'list' && Object.keys(columns).length === 0 && (
              <p className={hint}>No columns: each row's own value. Add columns to read several things from each row.</p>
            )}
            <ColumnsEditor columns={columns} mode={mode} onChange={(c) => update({ columns: c })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className={label}>Max rows</p>
              <Input className="h-8 text-xs" type="number" min={1} max={5000} placeholder="1000" value={cfg.limit ?? ''}
                onChange={(e) => update({ limit: e.target.value ? Math.min(5000, Math.max(1, Number(e.target.value))) : undefined })} />
            </div>
            <div className="space-y-1.5">
              <p className={label}>Unique by</p>
              <Select value={cfg.dedupe_by ?? '__none__'} onValueChange={(v) => update({ dedupe_by: v === '__none__' ? undefined : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Whole row</SelectItem>
                  {Object.keys(columns).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[11px] font-medium">One item per row</p>
              <p className={hint}>
                The rows become this step's output items, so the next agent step runs once per row.
                Off: one value, <code className="font-mono">{`{{${step.field_name ?? 'field'}}}`}</code>, holding the whole list.
              </p>
            </div>
            <Switch checked={cfg.as_items === true} onCheckedChange={(v) => update({ as_items: v || undefined })} aria-label="One item per row" />
          </div>
        </div>
      )}

      {/* Pagination */}
      {(mode === 'list' || mode === 'table') && (
        <div className="space-y-2 border-t pt-3">
          <p className={label}>More pages</p>
          <Select value={pageMode} onValueChange={(v) => update({
            paginate: v === 'none' ? undefined : { ...(cfg.paginate ?? {}), mode: v as NonNullable<ExtractConfig['paginate']>['mode'] },
          })}>
            <SelectTrigger className="h-8 w-[260px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Just this page</SelectItem>
              <SelectItem value="url">Change the URL (?page=…)</SelectItem>
              <SelectItem value="next">Click a Next button</SelectItem>
              <SelectItem value="load_more">Click Load more</SelectItem>
              <SelectItem value="scroll">Scroll for more</SelectItem>
            </SelectContent>
          </Select>
          {pageMode === 'url' && (
            <div className="grid grid-cols-[1fr_80px_80px] gap-2">
              <div className="space-y-1">
                <Input className="h-8 text-xs font-mono" placeholder="https://site/listings?page={n}" value={cfg.paginate?.url ?? ''}
                  onChange={(e) => update({ paginate: { ...cfg.paginate!, url: e.target.value } })} />
                <p className={hint}><code className="font-mono">{'{n}'}</code> is the page number.</p>
              </div>
              <Input className="h-8 text-xs" type="number" placeholder="start 1" value={cfg.paginate?.start ?? ''}
                onChange={(e) => update({ paginate: { ...cfg.paginate!, start: e.target.value ? Number(e.target.value) : undefined } })} />
              <Input className="h-8 text-xs" type="number" placeholder="step 1" value={cfg.paginate?.step ?? ''}
                onChange={(e) => update({ paginate: { ...cfg.paginate!, step: e.target.value ? Number(e.target.value) : undefined } })} />
            </div>
          )}
          {(pageMode === 'next' || pageMode === 'load_more') && (
            <Input className="h-8 text-xs font-mono" placeholder={pageMode === 'next' ? 'a[aria-label="Next"]' : '//button[contains(., "Load more")]'}
              value={cfg.paginate?.next ?? ''} onChange={(e) => update({ paginate: { ...cfg.paginate!, next: e.target.value } })} />
          )}
          {pageMode !== 'none' && (
            <div className="flex items-center gap-2">
              <span className={hint}>Stop after</span>
              <Input className="h-8 w-[80px] text-xs" type="number" min={1} max={200} placeholder="20" value={cfg.paginate?.max_pages ?? ''}
                onChange={(e) => update({ paginate: { ...cfg.paginate!, max_pages: e.target.value ? Number(e.target.value) : undefined } })} />
              <span className={hint}>pages. Also stops when the control is gone or disabled, a page comes back short, or a page adds no new rows.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
