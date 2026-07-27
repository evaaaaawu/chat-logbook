import type { ActionKind, ContentBlock, Message } from "@/types";
import {
  groupRuns,
  planRunLayout,
  rowKeyOf,
  type RowRef,
} from "@/conversation/runs";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;

/**
 * A stretch of Tool units inside a Run, shown as one summary row (#199).
 *
 * A Run of eight commands is a wall. Folded, the reader learns what the stretch
 * was about without opening it.
 */
export interface Fold {
  rows: RowRef[];
  summary: string;
}

// One or two units are already quiet enough on their own, and folding them
// would only add a click (#199).
const FOLD_THRESHOLD = 3;

/**
 * Every Fold in the Chat, in reading order.
 *
 * A pure function of the Messages, like the Run grouping it builds on (#236).
 */
export function planFolds(messages: Message[]): Fold[] {
  const blockAt = blockLookup(messages);
  const folds: Fold[] = [];

  for (const run of groupRuns(messages)) {
    // Thinking is a boundary even though it sits inside the Run for spacing:
    // a summary reading `Ran 6 commands` must not be hiding a paragraph of
    // reasoning behind it, or the label would be lying (#199).
    for (const stretch of splitOnThinking(run.rows, blockAt)) {
      if (stretch.length < FOLD_THRESHOLD) continue;
      folds.push({
        rows: stretch,
        summary: foldSummary(
          stretch.map((row) => blockAt(row) as ToolUseBlock)
        ),
      });
    }
  }
  return folds;
}

/** One thing the view draws inside a Run's container. */
export type RunEntry =
  | { kind: "unit"; blockIndex: number }
  | {
      kind: "fold";
      /**
       * The fold's identity, and the key its open state is remembered under.
       * Namespaced away from the row keys: a fold is anchored at its first unit
       * and would otherwise share that unit's key, so opening the summary would
       * open that one unit along with it (#199).
       */
      foldId: string;
      summary: string;
      /** The fold's units carried by *this* Message. */
      blockIndices: number[];
      /** Whether the summary row itself is drawn here. */
      isAnchor: boolean;
    };

export type FoldedSegment =
  | { kind: "block"; blockIndex: number }
  | { kind: "run"; entries: RunEntry[] };

export interface MessageLayout {
  segments: FoldedSegment[];
  runContinuesBefore: boolean;
  runContinuesAfter: boolean;
}

/**
 * How each Message lays out, in the same order as the Messages given.
 *
 * A fold routinely spans turns — an Agent records six commands as six of them —
 * so the summary row is anchored at the fold's first unit and the turns after
 * it carry the same `foldId` without an anchor. Collapsed, those turns draw
 * nothing; expanded, each draws its own units, which is what keeps a unit
 * independently expandable inside an open fold (#199).
 */
export function planLayout(messages: Message[]): MessageLayout[] {
  const foldByRow = new Map<string, Fold>();
  for (const fold of planFolds(messages)) {
    for (const row of fold.rows) foldByRow.set(rowKeyOf(row), fold);
  }

  const runLayouts = planRunLayout(messages);
  return messages.map((message, index) => {
    const runLayout = runLayouts[index]!;
    return {
      runContinuesBefore: runLayout.runContinuesBefore,
      runContinuesAfter: runLayout.runContinuesAfter,
      segments: runLayout.segments.map((segment) => {
        if (segment.kind === "block") return segment;
        return {
          kind: "run",
          entries: foldEntries(message, segment.blockIndices, foldByRow),
        };
      }),
    };
  });
}

function foldEntries(
  message: Message,
  blockIndices: number[],
  foldByRow: Map<string, Fold>
): RunEntry[] {
  const entries: RunEntry[] = [];

  for (const blockIndex of blockIndices) {
    const rowKey = rowKeyOf({ messageId: message.id, blockIndex });
    const fold = foldByRow.get(rowKey);
    if (!fold) {
      entries.push({ kind: "unit", blockIndex });
      continue;
    }
    const anchor = rowKeyOf(fold.rows[0]!);
    const foldId = `fold:${anchor}`;
    const last = entries[entries.length - 1];
    if (last?.kind === "fold" && last.foldId === foldId) {
      last.blockIndices.push(blockIndex);
      continue;
    }
    entries.push({
      kind: "fold",
      foldId,
      summary: fold.summary,
      blockIndices: [blockIndex],
      isAnchor: anchor === rowKey,
    });
  }
  return entries;
}

/** How a group of Actions reads once it is counted. */
interface Phrasing {
  verb: string;
  noun: string;
}

// Keyed on the Action, not on the tool that ran: a reader skimming a folded
// stretch wants to know it was six commands, not six Bashes — and an Agent that
// calls its shell `shell` must land in the same group (#261).
//
// The wording lives here rather than in the stored Action, the same split the
// row density draws (ADR-0025). `wrote` rather than `created` because write
// covers both a new file and an overwrite, and the summary sits one click above
// rows that already say `Wrote foo.ts +12 -0`. One act, one word, at both
// densities.
//
// Every kind but `other` has a phrasing: `other` is the unbounded tail — an MCP
// server a reader happened to install — with nothing to be counted as. Typed
// exhaustively so a kind added later cannot land in that tail by accident.
const PHRASINGS: Record<Exclude<ActionKind, "other">, Phrasing> = {
  execute: { verb: "ran", noun: "command" },
  edit: { verb: "edited", noun: "file" },
  write: { verb: "wrote", noun: "file" },
  read: { verb: "read", noun: "file" },
  // One group with read, though the rows they hide keep the two apart: a search
  // reads as `Searched for "useMessages"` because its object is a pattern, but
  // a line above, both are the Agent looking things up (#199). Merging here
  // rather than in the Action keeps grouping a matter of wording (ADR-0025).
  search: { verb: "read", noun: "file" },
  // A subagent's whole run comes back as one unit, so what was handed off is a
  // task rather than a call.
  delegate: { verb: "delegated", noun: "task" },
};

/**
 * How a call's Action reads in a summary, or nothing when it has no group.
 *
 * A unit normalized before Actions existed has no kind at all, and counts the
 * same way `other` does rather than reaching back for its tool name (#260).
 */
function phrasingOf(kind: ActionKind | undefined): Phrasing | undefined {
  return kind === undefined || kind === "other" ? undefined : PHRASINGS[kind];
}

// Two groups is what a one-line summary carries before it stops being skimmable.
const MAX_NAMED_GROUPS = 2;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What a folded stretch of Tool units did, in one line.
 *
 * A pure function of the units, so the row can be planned before layout.
 */
export function foldSummary(blocks: ToolUseBlock[]): string {
  const groups = new Map<string, { phrasing: Phrasing; count: number }>();
  // A call that fits no group still happened, so it is counted in the
  // remainder rather than dropped — the summary would otherwise hide it.
  let unknown = 0;
  for (const block of blocks) {
    const phrasing = phrasingOf(block.action?.kind);
    if (!phrasing) {
      unknown += 1;
      continue;
    }
    const key = `${phrasing.verb} ${phrasing.noun}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { phrasing, count: 1 });
  }

  // Largest first, and insertion order breaks a tie, so equal groups read in
  // the order they happened.
  const ranked = [...groups.values()].sort((a, b) => b.count - a.count);
  // Nothing to name: say how much happened rather than nothing at all.
  if (ranked.length === 0) return capitalize(`ran ${plural(unknown, "tool")}`);
  const named = ranked.slice(0, MAX_NAMED_GROUPS);

  const phrases = named.map(
    ({ phrasing, count }) => `${phrasing.verb} ${plural(count, phrasing.noun)}`
  );

  const remainder =
    unknown +
    ranked
      .slice(MAX_NAMED_GROUPS)
      .reduce((total, group) => total + group.count, 0);
  if (remainder > 0) phrases.push(`+${remainder} more`);

  return capitalize(phrases.join(", "));
}

function blockLookup(
  messages: Message[]
): (row: RowRef) => ContentBlock | undefined {
  const byId = new Map<string, Message>();
  for (const message of messages) byId.set(message.id, message);
  return (row) => {
    const content = byId.get(row.messageId)?.content;
    if (!content || typeof content === "string") return undefined;
    return content[row.blockIndex];
  };
}

/** The Run's rows, cut into runs of Tool units wherever thinking interrupts. */
function splitOnThinking(
  rows: RowRef[],
  blockAt: (row: RowRef) => ContentBlock | undefined
): RowRef[][] {
  const stretches: RowRef[][] = [];
  let current: RowRef[] = [];
  for (const row of rows) {
    const block = blockAt(row);
    if (block?.type === "tool_use") {
      current.push(row);
      continue;
    }
    if (current.length > 0) stretches.push(current);
    current = [];
  }
  if (current.length > 0) stretches.push(current);
  return stretches;
}
