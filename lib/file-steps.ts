/**
 * File steps — download, upload, save_page — and the rules the editor shares
 * with the backend's step-schema.js / finalize.js. Kept in one place here
 * because four editor surfaces used to carry their own copy of the
 * "cannot be a login indicator" list, and they drifted.
 */
import type { RecordedStep } from '@/lib/api/scripts';

export type FileStepAction = 'download' | 'upload' | 'save_page';

export function isFileStep(step: Pick<RecordedStep, 'action'> | null | undefined): boolean {
  return step?.action === 'download' || step?.action === 'upload' || step?.action === 'save_page';
}

/**
 * Steps that cannot prove a signed-in session. Mirrors LOGIN_INDICATOR_BLOCKED
 * in step-schema.js: the indicator must FAIL when signed out, and a failed
 * indicator re-runs the script from step 0 — so nothing that succeeds on an
 * empty page, and nothing that creates or submits a file (a re-run would do it
 * twice: two downloads, two captures, two attachments).
 */
export const LOGIN_INDICATOR_BLOCKED: string[] = [
  'navigate', 'press_key', 'pause', 'group', 'download', 'upload', 'save_page',
  'wait_for_tab', 'switch_tab', 'close_tab',
];

/** Default output prefix per action — same defaults as the worker. */
const DEFAULT_FIELD: Record<FileStepAction, string> = {
  download: 'download',
  upload: 'upload',
  save_page: 'page',
};

/** Suffixes each file step writes, after `<field_name>_`. */
const OUTPUT_SUFFIXES: Record<FileStepAction, string[]> = {
  download: ['file', 'filename', 'bytes', 'sha256', 'object', 'uploaded', 'ms'],
  upload: ['file', 'filename', 'bytes', 'sha256', 'count'],
  save_page: ['file', 'filename', 'bytes', 'sha256', 'object'],
};

export function fileStepField(step: RecordedStep): string {
  const a = step.action as FileStepAction;
  return step.field_name?.trim() || DEFAULT_FIELD[a] || 'file';
}

/** Every variable a file step produces, e.g. evidence_file, evidence_filename… */
export function fileStepOutputs(step: RecordedStep): string[] {
  if (!isFileStep(step)) return [];
  const base = fileStepField(step);
  return OUTPUT_SUFFIXES[step.action as FileStepAction].map((s) => `${base}_${s}`);
}

/** The {{var}} names an upload step's `files` list references. */
export function uploadFileRefs(step: RecordedStep): string[] {
  if (step.action !== 'upload' || !Array.isArray(step.files)) return [];
  const out: string[] = [];
  for (const f of step.files) {
    for (const m of String(f).matchAll(/\{\{\s*(\w+)\s*\}\}/g)) out.push(m[1]);
  }
  return out;
}

/** Short label for the step list. */
export function fileStepLabel(step: RecordedStep): string {
  const f = fileStepField(step);
  switch (step.action) {
    // Names without braces, matching the Inputs / Outputs panel.
    case 'download':
      return `Download → ${f}`;
    case 'save_page':
      return `Save ${step.selector ? 'element' : 'page'} as ${(step.format ?? 'pdf').toUpperCase()} → ${f}`;
    case 'upload': {
      const files = Array.isArray(step.files) ? step.files.map((x) => String(x).replace(/\{+\s*|\s*\}+/g, '')).join(', ') : '';
      return `Upload ${files || '(no file)'}${step.selector ? ` → ${step.selector}` : ''}`;
    }
    default:
      return step.action;
  }
}

/**
 * Problems the backend would refuse on save, caught while editing so the
 * operator sees them next to the field rather than as a save error.
 */
export function fileStepErrors(step: RecordedStep): string[] {
  const errs: string[] = [];
  if (step.field_name && !/^[a-zA-Z0-9_]+$/.test(step.field_name)) {
    errs.push('Output name: letters, digits and underscores only.');
  }
  if (step.action === 'upload') {
    if (!step.selector?.trim()) errs.push("Page's file field: where on the website the file goes (or, with the file picker on, the button that opens it).");
    const files = Array.isArray(step.files) ? step.files.filter((f) => String(f).trim()) : [];
    if (files.length === 0) errs.push('Files: at least one file id or {{variable}}.');
    if (files.length > 10) errs.push('Files: at most 10.');
    const outputs = new Set(fileStepOutputs(step));
    const clash = uploadFileRefs(step).find((r) => outputs.has(r));
    if (clash) {
      errs.push(`The step reads {{${clash}}} and also writes ${clash}. Pick a different output name.`);
    }
    if (step.max_bytes != null && (!Number.isInteger(step.max_bytes) || step.max_bytes < 1 || step.max_bytes > 25 * 1024 * 1024)) {
      errs.push('Size limit: a whole number of bytes, up to 25 MB.');
    }
  }
  if (step.action === 'download' && !step.selector?.trim() && !step.text?.trim()) {
    errs.push('Selector: the button or link that starts the download.');
  }
  return errs;
}
