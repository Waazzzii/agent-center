'use client';

/**
 * components/logins/PoolSelector.tsx
 *
 * The two halves of a login's pool, which live on different tabs:
 *
 *   PoolStepper      — WHICH browser you are looking at (Credentials tab). Moving
 *                      between browsers changes this and nothing above it.
 *   PoolSizeControl  — HOW MANY browsers the login may use (Setup tab). A
 *                      setting of the login, identical from every browser.
 *
 * WHAT THE USER IS LOOKING AT
 *
 * One login with a pool of credentials. The backend stores that as a parent
 * row plus member rows named "<login> #2", "#3", but none of that is a
 * distinction the operator has to care about. So browsers are labelled
 * POSITIONALLY — Browser 1..N — and the page title stays the login's name.
 *
 * The stepper is the shared ItemStepper, so stepping between browsers here
 * and between decision rules on an agent behave identically.
 */

import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, CircleDashed, Hourglass } from 'lucide-react';
import type { Login } from '@/lib/api/logins';
import { ItemStepper } from '@/components/ui/item-stepper';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoBubble } from '@/components/actions/login-fields';

/** Parent first, then members oldest-first — the order the pool grows in. */
export function poolOf(login: Login, all: Login[]): Login[] {
  const parent = login.pool_parent_id
    ? all.find((l) => l.id === login.pool_parent_id) ?? login
    : login;
  const members = all
    .filter((l) => l.pool_parent_id === parent.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return [parent, ...members];
}

/** The login whose name and settings represent the pool as a whole. */
export function poolParentOf(login: Login, all: Login[]): Login {
  return login.pool_parent_id
    ? all.find((l) => l.id === login.pool_parent_id) ?? login
    : login;
}

function statusBits(status: Login['status'], removing = false) {
  if (removing) {
    return { Icon: Hourglass, label: 'Removing after its current run', cls: 'text-muted-foreground' };
  }
  if (status === 'valid') {
    return { Icon: CheckCircle2, label: 'Signed in', cls: 'text-emerald-600 dark:text-emerald-500' };
  }
  if (status === 'needs_login') {
    return { Icon: AlertCircle, label: 'Needs login', cls: 'text-amber-600 dark:text-amber-500' };
  }
  return { Icon: CircleDashed, label: 'Not used yet', cls: 'text-muted-foreground' };
}

/**
 * Browser 1..N, with each one's sign-in state. Renders nothing for a login of
 * one browser — there is nothing to step through.
 *
 * Navigates with ?tab=credentials so stepping keeps you on that tab rather than
 * dropping you back on Setup at every step, and without scrolling to the top —
 * the stepper is not at the top of the page. The page renders the next browser
 * from what it already holds (see PageSnapshot on the login page), so a step
 * swaps the content in place rather than blanking it.
 */
export function PoolStepper({ login, all }: { login: Login; all: Login[] }) {
  const router = useRouter();
  const pool = poolOf(login, all);
  if (pool.length < 2) return null;
  const needing = pool.filter((m) => m.status === 'needs_login' && !m.pool_removing_at).length;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ItemStepper
        noun="browser"
        value={login.id}
        onChange={(id) => { if (id !== login.id) router.push(`/actions/logins/${id}?tab=credentials`, { scroll: false }); }}
        items={pool.map((m, i) => {
          const s = statusBits(m.status, !!m.pool_removing_at);
          return {
            value: m.id,
            label: `Browser ${i + 1} of ${pool.length}`,
            icon: <s.Icon className={`h-3.5 w-3.5 ${s.cls}`} />,
            hint: s.label,
          };
        })}
      />
      {needing > 0 && (
        <span className="text-[11px] text-amber-600 dark:text-amber-500">
          {needing} of {pool.length} need signing in
        </span>
      )}
    </div>
  );
}

/** Ceiling for the picker. The API allows more; nobody has asked for it. */
const MAX_POOL_SIZE = 10;

/**
 * How many browsers this login may use at once. The same setting from every
 * browser's page — the backend always writes it to the login.
 */
export function PoolSizeControl({
  maxBrowsers, onChange, disabled = false,
}: {
  maxBrowsers: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    // Label, control and ⓘ side by side. The control used to sit at the far end
    // of the card, a card-width away from the words it answers.
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium">Pool size</span>
      <Select value={String(maxBrowsers)} disabled={disabled} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger size="sm" className="min-w-[72px]" aria-label="Pool size">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {Array.from({ length: MAX_POOL_SIZE }, (_, i) => i + 1).map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        {maxBrowsers === 1 ? 'browser — runs take turns' : 'browsers at once'}
      </span>
      <InfoBubble>
        How many runs can use this login at the same time. Each gets its own browser, so they
        never share a window. Browsers are added as concurrent runs need them, up to this
        number. Lowering it removes the highest-numbered browsers: an idle one goes at once, one
        in use finishes its current run first.
      </InfoBubble>
    </div>
  );
}
