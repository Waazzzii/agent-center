'use client';

/**
 * Fields for the three file steps — download, upload, save_page.
 *
 * Shared by the "Add …" dialog in the editor's Record menu and the File tab of
 * StepEditModal, so the two cannot disagree about what a step needs. Pure: it
 * edits a step and hands it back; the caller persists.
 */

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RecordedStep } from '@/lib/api/scripts';
import { fileStepErrors, fileStepField, fileStepOutputs } from '@/lib/file-steps';

interface FileStepFieldsProps {
  step: RecordedStep;
  onChange: (next: RecordedStep) => void;
}

const MB = 1024 * 1024;

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  );
}

/** Comma-separated text ⇄ string list, without losing what the operator is mid-typing. */
function listToText(list?: string[]): string {
  return Array.isArray(list) ? list.join(', ') : '';
}
function textToList(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

export function FileStepFields({ step, onChange }: FileStepFieldsProps) {
  const set = (patch: Partial<RecordedStep>) => {
    const next = { ...step, ...patch } as RecordedStep;
    // Drop empty optionals rather than saving "" — the backend validates a
    // present-but-empty selector/filename as an error.
    for (const k of Object.keys(patch) as Array<keyof RecordedStep>) {
      const v = next[k];
      if (v === '' || v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k];
    }
    onChange(next);
  };
  const outputs = fileStepOutputs(step);
  const fileOut = `{{${fileStepField(step)}_file}}`;
  const errors = fileStepErrors(step);

  return (
    <div className="space-y-4">
      {step.action === 'upload' && (
        <>
          <Field
            label="Files"
            hint={<>Stored file ids, or the <code className="font-mono">{'{{variable}}'}</code> that holds one —
              a download or saved page earlier in this script (<code className="font-mono">{'{{evidence_file}}'}</code>),
              or a file passed in by the agent (<code className="font-mono">{'{{packet_file}}'}</code>). Comma-separated
              for several. Never a filename or a path.</>}
          >
            <Input
              className="font-mono text-xs"
              placeholder="{{packet_file}}"
              defaultValue={listToText(step.files)}
              onChange={(e) => set({ files: textToList(e.target.value) })}
            />
          </Field>
          <Field
            label={step.upload_via === 'chooser' ? "Page's upload button (selector)" : "Page's file field (selector)"}
            hint={step.upload_via === 'chooser'
              ? 'Where on the website to click to open its file picker — not your file. Your file is set in Files above.'
              : 'Where on the website the file goes: its <input type="file"> element — not your file, which is set in Files above. It can be hidden behind a styled button; that is fine.'}
          >
            <Input
              className="font-mono text-xs"
              placeholder='input[type="file"]'
              value={step.selector ?? ''}
              onChange={(e) => set({ selector: e.target.value })}
            />
          </Field>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[11px] font-medium">Use the file picker</p>
              <p className="text-[10px] text-muted-foreground">
                For a site with no reachable file input: click the button above and answer the picker it opens.
              </p>
            </div>
            <Switch
              checked={step.upload_via === 'chooser'}
              onCheckedChange={(v) => set({ upload_via: v ? 'chooser' : undefined })}
              aria-label="Use the file picker"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Allowed types" hint='Extensions or MIME types, e.g. "pdf, jpg, tif". Blank allows any.'>
              <Input
                className="font-mono text-xs"
                placeholder="pdf, jpg, tif"
                defaultValue={listToText(step.accept)}
                onChange={(e) => set({ accept: textToList(e.target.value) })}
              />
            </Field>
            <Field label="Size limit (MB, total)" hint="Across all files. A larger set fails and nothing is attached.">
              <Input
                type="number"
                min={0}
                step="0.5"
                className="text-xs"
                placeholder="25"
                defaultValue={step.max_bytes ? String(+(step.max_bytes / MB).toFixed(2)) : ''}
                onChange={(e) => {
                  const mb = parseFloat(e.target.value);
                  set({ max_bytes: Number.isFinite(mb) && mb > 0 ? Math.round(mb * MB) : undefined });
                }}
              />
            </Field>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[11px] font-medium">This step submits</p>
              <p className="text-[10px] text-muted-foreground">
                On most portals choosing the file IS the upload. A test run stops before this step and asks;
                an agent run goes through.
              </p>
            </div>
            <Switch
              checked={step.requires_approval === true}
              onCheckedChange={(v) => set({ requires_approval: v || undefined })}
              aria-label="This step submits"
            />
          </div>
        </>
      )}

      {step.action === 'download' && (
        <>
          <Field label="Download button or link" hint="What to click. The step listens for the file before clicking.">
            <Input
              className="font-mono text-xs"
              placeholder="//button[contains(., 'Export')]"
              value={step.selector ?? ''}
              onChange={(e) => set({ selector: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="File type" hint="Leave blank for CSV.">
              <Input
                className="font-mono text-xs"
                placeholder="application/pdf"
                value={step.content_type ?? ''}
                onChange={(e) => set({ content_type: e.target.value.trim() })}
              />
            </Field>
            <Field label="Extension" hint="Leave blank for csv.">
              <Input
                className="font-mono text-xs"
                placeholder="pdf"
                value={step.upload_extension ?? ''}
                onChange={(e) => set({ upload_extension: e.target.value.trim().replace(/^\./, '').toLowerCase() })}
              />
            </Field>
          </div>
        </>
      )}

      {step.action === 'save_page' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <Select
                value={step.format ?? 'pdf'}
                onValueChange={(v) => set(
                  v === 'html'
                    // html stores the DOM as rendered: no unrolling, no print styles.
                    ? { format: 'html', expand: undefined, expand_selector: undefined, media: undefined }
                    : { format: v === 'png' ? 'png' : undefined },
                )}
              >
                <SelectTrigger size="sm" className="w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="pdf">PDF — selectable text</SelectItem>
                  <SelectItem value="png">PNG — full-length screenshot</SelectItem>
                  <SelectItem value="html">HTML — the page&apos;s markup, for parsing</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="File name" hint="{{variables}} allowed. The extension is added.">
              <Input
                className="text-xs"
                placeholder="Agreement {{reservation_id}}"
                value={step.filename ?? ''}
                onChange={(e) => set({ filename: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Capture only this element" hint="Blank captures the whole page.">
            <Input
              className="font-mono text-xs"
              placeholder="#agreement-body"
              value={step.selector ?? ''}
              onChange={(e) => set({ selector: e.target.value })}
            />
          </Field>
          {step.format !== 'html' && (
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[11px] font-medium">Unroll scrolling panes</p>
              <p className="text-[10px] text-muted-foreground">
                Expands content that scrolls inside the page (an app shell with a fixed viewer) so all of it is
                captured, then puts the page back.
              </p>
            </div>
            <Switch
              checked={step.expand !== false}
              onCheckedChange={(v) => set({ expand: v ? undefined : false, ...(v ? {} : { expand_selector: undefined }) })}
              aria-label="Unroll scrolling panes"
            />
          </div>
          )}
          {step.format !== 'html' && step.expand !== false && (
            <Field label="Pane to unroll" hint="Blank auto-detects every clipped pane. Name one if it unrolls the wrong thing.">
              <Input
                className="font-mono text-xs"
                placeholder=".document-viewer"
                value={step.expand_selector ?? ''}
                onChange={(e) => set({ expand_selector: e.target.value })}
              />
            </Field>
          )}
          {(step.format ?? 'pdf') === 'pdf' && (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium">Use the site{"'"}s print styles</p>
                <p className="text-[10px] text-muted-foreground">Off captures what you see on screen.</p>
              </div>
              <Switch
                checked={step.media === 'print'}
                onCheckedChange={(v) => set({ media: v ? 'print' : undefined })}
                aria-label="Use the site's print styles"
              />
            </div>
          )}
        </>
      )}

      {(step.action === 'download' || step.action === 'save_page') && (
        <Field
          label="Keep the file"
          hint="1 day suits a file this run uses, or a caller fetches right after it. 30 days is for a file a later run or a decision will attach."
        >
          <Select
            value={step.storage ?? 'temporary'}
            onValueChange={(v) => set({ storage: v === 'persistent' ? 'persistent' : undefined })}
          >
            <SelectTrigger size="sm" className="w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="temporary">1 day — temporary</SelectItem>
              <SelectItem value="persistent">30 days — persistent</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field
        label="Output name"
        hint={<>Prefix for what this step produces: {outputs.slice(0, 4).map((o, i) => (
          <span key={o}>{i > 0 && ', '}<code className="font-mono">{`{{${o}}}`}</code></span>
        ))}. {step.action !== 'upload' && <>Pass <code className="font-mono">{fileOut}</code> to an upload step — here or in another agent.</>}</>}
      >
        <Input
          className="font-mono text-xs"
          placeholder={step.action === 'save_page' ? 'page' : step.action}
          value={step.field_name ?? ''}
          onChange={(e) => set({ field_name: e.target.value.trim() })}
        />
      </Field>

      {errors.length > 0 && (
        <ul className="space-y-0.5">
          {errors.map((e) => <li key={e} className="text-[10px] text-destructive">{e}</li>)}
        </ul>
      )}
    </div>
  );
}
