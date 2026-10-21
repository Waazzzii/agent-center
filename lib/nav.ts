/**
 * Shared nav item definitions and permission-aware routing helpers.
 * Imported by both the layout (for initial redirect) and the sidebar (for Settings entry link).
 */

export interface NavItem {
  label: string;
  href: string;
  permissionKeys?: string[];
  children?: NavItem[];
  /** Non-clickable section caption (e.g. "Building blocks"). No href/icon. */
  heading?: boolean;
}

/**
 * Main org nav.
 *
 * Three ideas, in the order you need them:
 *
 *   AGENTS     — the agents themselves, and the reusable steps they are
 *                built from. Agents is BOTH the link and the group: it goes
 *                straight to the list, and the things underneath it are the
 *                parts an agent is assembled out of. It used to be an inert
 *                grouper over a "Routines" child, which meant a click on the
 *                most-used word in the product did nothing but open a list
 *                containing one real destination.
 *   INTERACTIONS — the human action queues, both waiting on a person:
 *                DECISIONS (answer what an agent raised) and LOGINS (sign a
 *                parked browser in). Decisions was once top-level; it now sits
 *                beside Logins here because both are "an agent needs a human",
 *                and a login operator should reach its queue without agent
 *                access. Replaced the old single "Action Required" page.
 *   ACTIVITY   — what already happened: runs, and what they cost.
 *   AUTHORIZATION — group-first. "Access Groups" → a group → what it covers
 *                (Executions / Decisions / Logins). "Clients" → a client → the
 *                agents its kit offers. Running an agent, deciding on what it
 *                raises, and signing in to its logins are separate authorities.
 *   TAGS       — the agent organizational labels (top-level; the only org
 *                vocabulary here). People/permission "Access Groups" live under
 *                Authorization (membership in Wazzi admin, assignment here).
 *
 * The child labels carry their own noun ("AI Steps", not "AI") because the
 * "Skills" caption that used to supply it is gone. A one-word label only
 * reads correctly under a heading; without one it is a category with no
 * object. The caption was also the only non-clickable row in the tree.
 *
 * LOGINS NEST UNDER BROWSER SCRIPTS. An earlier version deliberately
 * flattened them, on the reasoning that a login is not a property of browser
 * scripts but another kind of step. True in the abstract; in practice a login
 * only ever exists to let a browser script reach a site behind auth, and
 * nothing else in the product uses one.
 *
 * APPROVALS IS GONE. The reusable approval-step library belonged to the
 * blocking HITL action, which outcomes replaced. The page still exists at
 * its URL until the old action type is removed; the nav just stops offering
 * a route to a thing you should no longer build.
 *
 * CLIENTS IS GONE for the same reason. A kit client is now provisioned when
 * its product is enabled for the org and deactivated when it is turned off,
 * so there is nothing left to manage by hand — the agent editor asks which
 * PRODUCTS an agent is available in, which is the question an operator
 * actually has. /clients still resolves while the old rows are migrated.
 *
 * Routes and permissions are unchanged — the agent list still lives at
 * /agents, "Usage" at /agent-analytics. Icons are keyed by href in
 * ViewModeSidebar.
 */
// Two tiers (migration 408): agent_center_user = view + run granted agents +
// executions + interactions. agent_center_manager = everything, incl. authoring
// the reusable building blocks (AI Steps, Browser Scripts, Logins), Usage, and
// the Authorization/Groups setup. Items a plain user shouldn't reach carry
// ['agent_center_manager'] so the sidebar hides them.
export const orgMainNavItems: NavItem[] = [
  {
    label: 'Agents',
    href: '/agents',
    permissionKeys: ['agent_center_user'],
    children: [
      { label: 'AI Steps', href: '/actions/ai-steps', permissionKeys: ['agent_center_manager'] },
      {
        label: 'Browser Scripts', href: '/actions/browser-scripts', permissionKeys: ['agent_center_manager'],
        children: [
          { label: 'Login Scripts', href: '/actions/logins', permissionKeys: ['agent_center_manager'] },
        ],
      },
    ],
  },
  {
    // INTERACTIONS — the human action queues, both waiting on a person.
    //   DECISIONS — answer what an agent's on-completion rule raised; scoped to
    //               the agents a user may decide on (decision grain).
    //   LOGINS    — sign a parked browser in. Open to agent_center_user so a
    //               LOGIN-grain operator can act WITHOUT agent access (the login
    //               grain is its own authority). Pool-aware: one row per parked
    //               browser member, so the same login profile can appear twice.
    // Both children open to agent_center_user. Approvals are deprecated, so the
    // parent holds these two today with room for more.
    label: 'Interactions',
    href: '',
    permissionKeys: ['agent_center_user'],
    children: [
      { label: 'Decisions', href: '/interactions/decisions', permissionKeys: ['agent_center_user'] },
      { label: 'Logins',    href: '/interactions/logins',    permissionKeys: ['agent_center_user'] },
    ],
  },
  {
    label: 'Activity',
    href: '',
    permissionKeys: ['agent_center_user'],
    children: [
      { label: 'Executions', href: '/agent-history',    permissionKeys: ['agent_center_user'] },
      { label: 'Usage',      href: '/agent-analytics',  permissionKeys: ['agent_center_manager'] },
    ],
  },
  {
    // AUTHORIZATION — group-first. "Access Groups" lists the Wazzi groups; drill
    // into one to set what it covers (Executions / Decisions / Logins pills).
    // "Clients" lists the enabled clients (a client is a host-app deployment of an
    // agent kit, often a product); drill in to multi-assign the agents it offers.
    // No "all" grant — admins already have blanket access.
    label: 'Authorization',
    href: '',
    permissionKeys: ['agent_center_manager'],
    children: [
      { label: 'Access Groups', href: '/authorization/groups',  permissionKeys: ['agent_center_manager'] },
      { label: 'Clients',       href: '/authorization/clients', permissionKeys: ['agent_center_manager'] },
    ],
  },
  {
    // TAGS — the agent organizational LABELS (top-level now it's the only org
    // vocabulary here). People/permission "Access Groups" live under Authorization
    // and are managed in Wazzi admin; two names so "groups" stops being ambiguous.
    label: 'Tags',
    href: '/tags',
    permissionKeys: ['agent_center_manager'],
  },
];

/** Settings nav — no settings in the Agent Center */
export const orgSettingsNavItems: NavItem[] = [];

/**
 * Returns the href of the first nav item the user has permission for,
 * or null if none are accessible.
 *
 * @param items       Nav items to search (already in desired display order)
 * @param bypass      True for super_admin / org_admin — they skip permission checks
 * @param hasPermFn   The hasPermission function from the auth store
 * @param orgId       Currently selected org
 */
export function firstPermittedHref(
  items: NavItem[],
  bypass: boolean,
  hasPermFn: (orgId: string, key: string) => boolean,
  orgId: string
): string | null {
  const permitted = (item: NavItem) =>
    bypass || !item.permissionKeys || item.permissionKeys.some((k) => hasPermFn(orgId, k));

  for (const item of items) {
    // Prefer the item's OWN page when it has one (e.g. Agents → /agents),
    // so a parent that also has children doesn't redirect to its first child.
    if (item.href && permitted(item)) return item.href;
    // Otherwise it's a grouper — descend into its children.
    if (item.children?.length) {
      const childHref = firstPermittedHref(item.children, bypass, hasPermFn, orgId);
      if (childHref) return childHref;
    }
  }
  return null;
}
