/** The pinned label for chats whose Project (working directory) is empty. */
export const NO_PROJECT_LABEL = "(No project)";

/** Display label for a Project value: the name, or `(No project)` when empty. */
function labelFor(project: string): string {
  return project === "" ? NO_PROJECT_LABEL : project;
}

export interface ProjectFacet {
  /** The `chat.project` value; "" identifies the `(No project)` group. */
  project: string;
  /** Display label: the project name, or `(No project)` for the empty group. */
  label: string;
  /** How many chats in the view fall in this project. */
  count: number;
  /** Most-recent `updatedAt` across the group — the recency sort key. */
  lastActiveAt: number;
}

/** One per-Project count row as the server aggregation returns it (#131). */
export interface ProjectCount {
  project: string;
  count: number;
  lastActiveAt: number;
}

/**
 * Build the Projects facet list for the navigation panel from the server count
 * aggregation (#131 Phase A) — so the counts reflect the view's whole universe,
 * not just what has paged into the loaded window. Ordered by recency
 * (most-recently-active Project first), with the `(No project)` group pinned
 * last whatever its recency. `ensure` keeps a selected Project visible at count
 * 0 when the view holds none of it. Pure: returns a fresh array.
 */
export function facetsFromCounts(
  counts: ProjectCount[],
  opts?: { ensure?: string[] }
): ProjectFacet[] {
  const byProject = new Map<string, ProjectFacet>();
  for (const p of opts?.ensure ?? []) {
    byProject.set(p, {
      project: p,
      label: labelFor(p),
      count: 0,
      lastActiveAt: 0,
    });
  }
  for (const c of counts) {
    byProject.set(c.project, {
      project: c.project,
      label: labelFor(c.project),
      count: c.count,
      lastActiveAt: c.lastActiveAt,
    });
  }

  return [...byProject.values()].sort((a, b) => {
    // The (No project) group sinks to the bottom regardless of recency.
    if (a.project === "" && b.project !== "") return 1;
    if (b.project === "" && a.project !== "") return -1;
    return b.lastActiveAt - a.lastActiveAt;
  });
}
