/**
 * File steps — download, upload, save_page, analyze_image — and the rules the editor shares
 * with the backend's step-schema.js / finalize.js. Kept in one place here
 * because four editor surfaces used to carry their own copy of the
 * "cannot be a login indicator" list, and they drifted.
 */
import type { RecordedStep } from '@/lib/api/scripts';

export type FileStepAction = 'download' | 'upload' | 'save_page' | 'analyze_image';

export function isFileStep(step: Pick<RecordedStep, 'action'> | null | undefined): boolean {
  return step?.action === 'download' || step?.action === 'upload' || step?.action === 'save_page'
    || step?.action === 'analyze_image';
}

/** The default analyze_image model — config/models.js VISION_DEFAULT_MODEL in agent-backend. */
export const DEFAULT_VISION_MODEL = 'gemini-3.5-flash-lite';

/**
 * Steps that cannot prove a signed-in session. Mirrors LOGIN_INDICATOR_BLOCKED
 * in step-schema.js: the indicator must FAIL when signed out, and a failed
 * indicator re-runs the script from step 0 — so nothing that succeeds on an
 * empty page, and nothing that creates or submits a file (a re-run would do it
 * twice: two downloads, two captures, two attachments).
 */
export const LOGIN_INDICATOR_BLOCKED: string[] = [
  'navigate', 'press_key', 'pause', 'group', 'download', 'upload', 'save_page',
  'analyze_image', 'wait_for_tab', 'switch_tab', 'close_tab',
];

/** Default output prefix per action — same defaults as the worker. */
const DEFAULT_FIELD: Record<FileStepAction, string> = {
  download: 'download',
  upload: 'upload',
  save_page: 'page',
  analyze_image: 'analysis',
};

/** Suffixes each file step writes, after `<field_name>_`. */
const OUTPUT_SUFFIXES: Record<FileStepAction, string[]> = {
  download: ['file', 'filename', 'bytes', 'sha256', 'object', 'uploaded', 'ms'],
  upload: ['file', 'filename', 'bytes', 'sha256', 'count'],
  save_page: ['file', 'filename', 'bytes', 'sha256', 'object'],
  // analyze_image writes its prefix itself plus one per declared output —
  // see fileStepOutputs.
  analyze_image: ['model'],
};

export function fileStepField(step: RecordedStep): string {
  const a = step.action as FileStepAction;
  return step.field_name?.trim() || DEFAULT_FIELD[a] || 'file';
}

/** Every variable a file step produces, e.g. evidence_file, evidence_filename… */
export function fileStepOutputs(step: RecordedStep): string[] {
  if (!isFileStep(step)) return [];
  const base = fileStepField(step);
  const fixed = OUTPUT_SUFFIXES[step.action as FileStepAction].map((s) => `${base}_${s}`);
  if (step.action !== 'analyze_image') return fixed;
  // Same list as analyzeOutputVars in the backend's step-schema.js.
  const keys = (step.outputs ?? []).map((o) => o.key).filter(Boolean);
  return [base, ...fixed, ...keys.map((k) => `${base}_${k}`)];
}

/** The {{var}} names an upload / analyze_image step's `files` list references. */
export function uploadFileRefs(step: RecordedStep): string[] {
  if ((step.action !== 'upload' && step.action !== 'analyze_image') || !Array.isArray(step.files)) return [];
  const out: string[] = [];
  for (const f of step.files) {
    for (const m of String(f).matchAll(/\{\{\s*(\w+)\s*\}\}/g)) out.push(m[1]);
  }
  return out;
}

/** A file an Analyze step can read, as offered by its picker. */
export interface FileRefOption {
  /** What goes in `files`, e.g. "{{region_file}}". */
  ref: string;
  /** Where it comes from, e.g. "Step 3 · Save the screen region". */
  source: string;
}

/**
 * Every file the steps BEFORE this one produce, most recent first, then the
 * script's own *_file inputs. What an Analyze step's file picker offers; the
 * first entry is its default.
 */
export function fileRefOptions(prior: RecordedStep[], variableNames: string[] = []): FileRefOption[] {
  const out: FileRefOption[] = [];
  const seen = new Set<string>();
  for (let i = prior.length - 1; i >= 0; i--) {
    const s = prior[i];
    if (s?.action !== 'save_page' && s?.action !== 'download' && s?.action !== 'upload') continue;
    const ref = `{{${fileStepField(s)}_file}}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push({ ref, source: `Step ${i + 1} · ${s.name?.trim() || fileStepLabel(s)}` });
  }
  for (const n of variableNames) {
    const ref = `{{${n}}}`;
    if (!n.endsWith('_file') || n.startsWith('_') || seen.has(ref)) continue;
    seen.add(ref);
    out.push({ ref, source: 'Script input' });
  }
  return out;
}

/** The {{…_file}} of the most recent capture before `index`, as a files list — the Analyze default. */
export function latestCaptureRef(steps: RecordedStep[], index: number): string[] {
  const first = fileRefOptions(steps.slice(0, index + 1))[0];
  return first ? [first.ref] : [];
}

/**
 * The output name an Analyze step gets by default, from the file it reads:
 * {{region_file}} → "region_analysis", {{page_file}} → "page_analysis", a raw
 * id → "analysis". Numbered when an earlier Analyze step already has it, so two
 * analyses of one capture do not overwrite each other. Same rule as
 * add_analyze_image in the MCP.
 */
export function analysisFieldFor(files: string[] | undefined, prior: RecordedStep[] = []): string {
  const m = /^\{\{\s*([a-zA-Z0-9_]+?)(?:_file)?\s*\}\}$/.exec(String(files?.[0] ?? '').trim());
  const base = m ? `${m[1]}_analysis` : 'analysis';
  const taken = new Set(prior.filter((s) => s?.action === 'analyze_image').map((s) => fileStepField(s)));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** Short label for the step list. */
export function fileStepLabel(step: RecordedStep): string {
  const f = fileStepField(step);
  switch (step.action) {
    // Names without braces, matching the Inputs / Outputs panel.
    case 'download':
      return `Download → ${f}`;
    case 'save_page':
      if (step.clip) return `Save region ${step.clip.width}×${step.clip.height} at ${step.clip.x}, ${step.clip.y} as PNG → ${f}`;
      return `Save ${step.selector ? 'element' : 'page'} as ${(step.format ?? 'pdf').toUpperCase()} → ${f}`;
    case 'analyze_image': {
      const files = Array.isArray(step.files) ? step.files.map((x) => String(x).replace(/\{+\s*|\s*\}+/g, '')).join(', ') : '';
      return `Analyze ${files || '(no file)'} → ${f}`;
    }
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
  if (step.action === 'save_page' && step.clip) {
    const c = step.clip;
    const ok = (n: number, min: number) => Number.isFinite(n) && n >= min && n <= 10_000;
    if (!ok(c.x, 0) || !ok(c.y, 0) || !ok(c.width, 1) || !ok(c.height, 1)) {
      errs.push('Screen region: x and y from 0, width and height at least 1 (pixels, up to 10000).');
    }
    if (step.selector?.trim()) errs.push('Screen region and "Capture only this element" are exclusive — clear one.');
  }
  if (step.action === 'analyze_image') {
    const files = Array.isArray(step.files) ? step.files.filter((x) => String(x).trim()) : [];
    if (files.length === 0) errs.push('Files: at least one file id or {{variable}}, e.g. {{page_file}}.');
    if (files.length > 10) errs.push('Files: at most 10.');
    if (!step.prompt?.trim()) errs.push('Prompt: what to ask about the file.');
    if (step.model?.trim() && !/^(gemini|claude)-[a-zA-Z0-9.-]+$/.test(step.model.trim())) {
      errs.push('Model: a gemini-* or claude-* model id, or blank for the default.');
    }
    const keys = (step.outputs ?? []).map((o) => o.key);
    if (keys.some((k) => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k))) {
      errs.push('Output keys: start with a letter; letters, digits and underscores only.');
    }
    if (new Set(keys).size !== keys.length) errs.push('Output keys: each key once.');
    const outputs = new Set(fileStepOutputs(step));
    const clash = uploadFileRefs(step).find((r) => outputs.has(r));
    if (clash) errs.push(`The step reads {{${clash}}} and also writes ${clash}. Pick a different output name.`);
  }
  return errs;
}

