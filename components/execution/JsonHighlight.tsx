'use client';

/**
 * Colour for pretty-printed JSON — keys, strings, numbers, literals.
 *
 * Payloads are what people read on a run to find out what a step was given
 * and what it produced, and monochrome JSON makes a key and its value the
 * same weight. Tokenised into React nodes rather than injected as HTML, so a
 * payload carrying markup renders as text.
 *
 * Runtime keys (_input_id, _status, …) are dimmed: they are the executor's
 * bookkeeping, present on every item, and the eye should skip them.
 */

import * as React from 'react';

// key | string | number | literal — in that order of precedence.
const TOKEN_SOURCE = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/.source;

export function JsonHighlight({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  // A fresh /g regex per render — exec() advances lastIndex, and a shared
  // module-level instance would carry that state between calls.
  const token = new RegExp(TOKEN_SOURCE, 'g');
  while ((m = token.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const [whole, str, colon, num, lit] = m;
    if (str && colon) {
      const runtime = str.startsWith('"_');
      nodes.push(
        <span key={k++} className={runtime ? 'text-text-dim' : 'text-step-ai'}>{str}</span>,
        colon,
      );
    } else if (str) {
      nodes.push(<span key={k++} className="text-success">{str}</span>);
    } else if (num) {
      nodes.push(<span key={k++} className="text-step-agent">{num}</span>);
    } else if (lit) {
      nodes.push(<span key={k++} className="text-brand">{lit}</span>);
    } else {
      nodes.push(whole);
    }
    last = m.index + whole.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

/** True when `text` parsed as JSON (so highlighting is meaningful). */
export function isJsonText(text: string): boolean {
  const t = text.trimStart();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try { JSON.parse(text); return true; } catch { return false; }
}
