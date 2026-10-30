'use client';

/**
 * The little markdown agent summaries use: paragraphs, "- " bullets, "#"
 * headings, **bold**, `code`, ``` fences and bare links. Builds React nodes —
 * never HTML strings — so agent output can't inject markup. Anything else
 * renders as plain text, which is the right failure for a summary.
 */

import * as React from 'react';

const INLINE = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+)/g;
const MD_LINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/;

function inline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyBase}-${i}`;
    const link = part.match(MD_LINK);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">{link[1]}</a>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>;
    if (/^https?:\/\//.test(part)) return <a key={key} href={part} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline break-all">{part}</a>;
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

export function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) body.push(lines[i++]!);
      i++;
      blocks.push(<pre key={`b${i}`} className="overflow-x-auto rounded-md bg-surface-2 p-2 text-xs">{body.join('\n')}</pre>);
      continue;
    }
    if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*] /, ''));
      blocks.push(<ul key={`b${i}`} className="list-disc space-y-0.5 pl-5">{items.map((t, j) => <li key={j}>{inline(t, `l${i}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^#{1,6} /.test(line)) {
      blocks.push(<p key={`b${i}`} className="font-semibold">{inline(line.replace(/^#{1,6} /, ''), `h${i}`)}</p>);
      i++;
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*[-*] /.test(lines[i]!) && !/^#{1,6} /.test(lines[i]!) && !lines[i]!.trim().startsWith('```')) {
      para.push(lines[i++]!);
    }
    blocks.push(<p key={`b${i}`}>{inline(para.join(' '), `p${i}`)}</p>);
  }
  return <div className={className ?? 'space-y-2'}>{blocks}</div>;
}
