import type { Chat } from "@/types";

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
  /** How many of the given chats fall in this project. */
  count: number;
  /** Most-recent `updatedAt` across the group — the recency sort key. */
  lastActiveAt: number;
}

/**
 * Fold a chat list into the Projects facet list for the navigation panel:
 * grouped by `project`, counted, and ordered by recency (most-recently-active
 * Project first). The `(No project)` group is always pinned last, whatever its
 * recency. Pure: returns a fresh array and never mutates the input.
 *
 * `ensure` keeps named Projects in the list even when no chat falls in them
 * (count 0) — so a selected Project stays visible after its last chat leaves
 * the active view.
 */
export function deriveProjects(
  chats: Chat[],
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
  for (const c of chats) {
    const existing = byProject.get(c.project);
    if (existing) {
      byProject.set(c.project, {
        ...existing,
        count: existing.count + 1,
        lastActiveAt: Math.max(existing.lastActiveAt, c.updatedAt),
      });
    } else {
      byProject.set(c.project, {
        project: c.project,
        label: labelFor(c.project),
        count: 1,
        lastActiveAt: c.updatedAt,
      });
    }
  }

  return [...byProject.values()].sort((a, b) => {
    // The (No project) group sinks to the bottom regardless of recency.
    if (a.project === "" && b.project !== "") return 1;
    if (b.project === "" && a.project !== "") return -1;
    return b.lastActiveAt - a.lastActiveAt;
  });
}
