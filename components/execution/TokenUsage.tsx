'use client';

import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Token usage for a run or a single action, with a tooltip that says what the
 * number actually counts.
 *
 * Exists because the honest figure is not the obvious one. Prompt caching is
 * on, so the API's `input_tokens` is only the part of the prompt that was NOT
 * served from cache — routinely 3 or 9 against a prompt of ninety thousand.
 * Reporting that column as "in" made every AI step look nearly free and made
 * the accounting look broken. The prompt is
 * `input + cache_read + cache_write`, and the split matters because the three
 * are billed at different rates.
 *
 * The tooltip also has to say where money lives, because it is NOT here: no
 * per-step dollar figure is stamped any more. Spend comes from Anthropic's
 * Cost API and is aggregated on the Billing & Usage page. Without saying so,
 * a reader reasonably assumes these tokens are the whole cost story.
 */

export interface TokenCounts {
  /** Uncached prompt tokens — the API's `input_tokens`. */
  fresh: number;
  /** Prompt served from cache — cheap (~10% of base input). */
  cacheRead: number;
  /** Prompt written INTO the cache on a first call — ~125% of base input. */
  cacheWrite: number;
  output: number;
}

export function totalIn(t: TokenCounts): number {
  return t.fresh + t.cacheRead + t.cacheWrite;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const exact = (n: number) => n.toLocaleString();

export function TokenUsage({
  tokens,
  variant = 'card',
  className,
}: {
  tokens: TokenCounts;
  /** 'card' = the big in/out figure on a summary card. 'inline' = a table row. */
  variant?: 'card' | 'inline';
  className?: string;
}) {
  const input = totalIn(tokens);
  const total = input + tokens.output;

  if (total === 0) {
    return <span className={cn(variant === 'card' ? 'text-base font-semibold' : 'text-xs', className)}>—</span>;
  }

  const figure =
    variant === 'card' ? (
      <span className="text-base font-semibold tabular-nums">
        {fmt(input)}
        <span className="font-normal text-muted-foreground"> / </span>
        {fmt(tokens.output)}
      </span>
    ) : (
      <span className="tabular-nums">
        {fmt(input)} / {fmt(tokens.output)} tok
      </span>
    );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A span, not a button: this is a figure that explains itself on
              hover, not a control. Kept focusable so it is reachable without
              a pointer. */}
          <span tabIndex={0} className={cn('cursor-help decoration-dotted underline-offset-4 hover:underline', className)}>
            {figure}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-xs p-0 font-normal">
          <div className="space-y-2 p-3 leading-snug">
            <div className="font-medium">Token usage</div>

            <table className="w-full tabular-nums">
              <tbody>
                <Row label="Prompt, from cache" value={tokens.cacheRead} hint="billed at ~10% of input" />
                <Row label="Prompt, written to cache" value={tokens.cacheWrite} hint="first call only, ~125%" />
                <Row label="Prompt, uncached" value={tokens.fresh} />
                <tr className="border-t border-border/60">
                  <td className="pt-1 font-medium">Total in</td>
                  <td className="pt-1 text-right font-medium">{exact(input)}</td>
                </tr>
                <tr>
                  <td className="font-medium">Out</td>
                  <td className="text-right font-medium">{exact(tokens.output)}</td>
                </tr>
              </tbody>
            </table>

            <p className="text-muted-foreground">
              Almost every prompt is served from cache, so the uncached figure alone is
              a few tokens and says nothing about the real prompt size.
            </p>

            <p className="border-t border-border/60 pt-2 text-muted-foreground">
              No dollar cost is recorded per run.{' '}
              <Link href="/billing" className="text-brand hover:underline">
                Billing &amp; Usage
              </Link>{' '}
              has spend, aggregated from Anthropic&apos;s Cost API.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <tr className={value === 0 ? 'text-muted-foreground/60' : undefined}>
      <td className="pr-3">
        {label}
        {hint && <span className="block text-[10px] text-muted-foreground/70">{hint}</span>}
      </td>
      <td className="text-right align-top">{exact(value)}</td>
    </tr>
  );
}
