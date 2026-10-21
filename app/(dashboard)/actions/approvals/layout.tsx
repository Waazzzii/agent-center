import Link from 'next/link'

/**
 * RETIRED — the reusable approval-step library and the blocking HITL "Human
 * Review" action it fed are gone: the post-execution outcomes/decisions
 * mechanism replaced them, MCP + REST authoring are closed, and the agent editor
 * no longer offers the step (verified: zero agents carry an action_type='approval'
 * in production, 2026-10-19).
 *
 * This server-component layout wraps the whole /actions/approvals subtree
 * (list / create / [id]). Rendering this notice INSTEAD of {children} makes the
 * removed authoring UI unreachable from anywhere by direct URL, while saying why.
 * The live HITL queue (/interactions) is unaffected — it still serves browser
 * logins and parked runs. Historical runs still render their old "Human Review"
 * steps via components/execution/step-types.tsx. Delete this subtree outright in
 * the Pass-3 teardown.
 */
export default function Layout() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="text-lg font-semibold">Approvals are deprecated</h1>
      <p className="text-sm text-muted-foreground">
        The human-review approval step has been retired and replaced by agent
        Decisions &amp; Outcomes, which review an agent&apos;s work after it runs
        rather than blocking it midway. Approval steps can no longer be created or
        edited.
      </p>
      <Link href="/interactions/decisions" className="text-sm font-medium text-primary hover:underline">
        Go to Decisions
      </Link>
    </div>
  )
}
