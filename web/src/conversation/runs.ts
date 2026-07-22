import type { ContentBlock, Message } from "@/types";

/** One skim-layer row, addressed by the Message that carries it. */
export interface RowRef {
  messageId: string;
  blockIndex: number;
}

/**
 * A consecutive stretch of skim-layer rows with no message text between them,
 * presented as one tight visual group (see CONTEXT.md, #236).
 */
export interface Run {
  rows: RowRef[];
}

function isSkimRow(block: ContentBlock): boolean {
  return block.type === "tool_use" || block.type === "thinking";
}

/**
 * Every Run in the Chat, in reading order.
 *
 * A pure function of the rendered Messages, so grouping is decided before
 * layout rather than measured after it (#236).
 */
export function groupRuns(messages: Message[]): Run[] {
  const runs: Run[] = [];
  let current: RowRef[] = [];
  const close = () => {
    if (current.length > 0) runs.push({ rows: current });
    current = [];
  };

  for (const message of messages) {
    if (typeof message.content === "string") {
      close();
      continue;
    }
    message.content.forEach((block, blockIndex) => {
      if (isSkimRow(block)) {
        current.push({ messageId: message.id, blockIndex });
        return;
      }
      // A result renders nothing on its own — it belongs to the call that
      // produced it — so it neither starts a row nor breaks the stretch.
      if (block.type === "tool_result") return;
      close();
    });
  }
  close();
  return runs;
}

/** One message's content, cut into the pieces layout treats differently. */
export type Segment =
  | { kind: "run"; blockIndices: number[] }
  | { kind: "block"; blockIndex: number };

export interface MessageLayout {
  segments: Segment[];
  /** The message opens inside a Run that started in an earlier turn. */
  runContinuesBefore: boolean;
  /** The message closes inside a Run that carries on into a later turn. */
  runContinuesAfter: boolean;
}

/**
 * How each Message lays out, in the same order as the Messages given.
 *
 * The seam flags are what let a Run read as one group even though the Agent
 * recorded it as many turns: the message boundaries inside a Run give up their
 * spacing, so the rows sit a few pixels apart instead of forty (#236).
 */
export function planLayout(messages: Message[]): MessageLayout[] {
  const runs = groupRuns(messages);
  // Which run each row belongs to, so a message can tell a seam from an end.
  const runIndexByRow = new Map<string, number>();
  runs.forEach((run, runIndex) => {
    for (const row of run.rows) {
      runIndexByRow.set(rowKey(row.messageId, row.blockIndex), runIndex);
    }
  });

  return messages.map((message, messageIndex) => {
    const segments: Segment[] = [];
    let openRun: Extract<Segment, { kind: "run" }> | null = null;
    if (typeof message.content !== "string") {
      message.content.forEach((block, blockIndex) => {
        if (!runIndexByRow.has(rowKey(message.id, blockIndex))) {
          if (block.type === "tool_result") return;
          openRun = null;
          segments.push({ kind: "block", blockIndex });
          return;
        }
        if (openRun) {
          openRun.blockIndices.push(blockIndex);
          return;
        }
        openRun = { kind: "run", blockIndices: [blockIndex] };
        segments.push(openRun);
      });
    }

    return {
      segments,
      runContinuesBefore: sharesRun(
        runIndexByRow,
        firstRow(segments, message.id),
        lastRowOf(messages[messageIndex - 1], runIndexByRow)
      ),
      runContinuesAfter: sharesRun(
        runIndexByRow,
        lastRow(segments, message.id),
        firstRowOf(messages[messageIndex + 1], runIndexByRow)
      ),
    };
  });
}

function rowKey(messageId: string, blockIndex: number): string {
  return `${messageId}:${blockIndex}`;
}

function sharesRun(
  runIndexByRow: Map<string, number>,
  a: string | null,
  b: string | null
): boolean {
  if (a === null || b === null) return false;
  const runA = runIndexByRow.get(a);
  return runA !== undefined && runA === runIndexByRow.get(b);
}

function firstRow(segments: Segment[], messageId: string): string | null {
  const first = segments[0];
  if (!first || first.kind !== "run") return null;
  return rowKey(messageId, first.blockIndices[0]!);
}

function lastRow(segments: Segment[], messageId: string): string | null {
  const last = segments[segments.length - 1];
  if (!last || last.kind !== "run") return null;
  return rowKey(messageId, last.blockIndices[last.blockIndices.length - 1]!);
}

function firstRowOf(
  message: Message | undefined,
  runIndexByRow: Map<string, number>
): string | null {
  if (!message || typeof message.content === "string") return null;
  for (let i = 0; i < message.content.length; i += 1) {
    const key = rowKey(message.id, i);
    if (runIndexByRow.has(key)) return key;
    if (message.content[i]!.type !== "tool_result") return null;
  }
  return null;
}

function lastRowOf(
  message: Message | undefined,
  runIndexByRow: Map<string, number>
): string | null {
  if (!message || typeof message.content === "string") return null;
  for (let i = message.content.length - 1; i >= 0; i -= 1) {
    const key = rowKey(message.id, i);
    if (runIndexByRow.has(key)) return key;
    if (message.content[i]!.type !== "tool_result") return null;
  }
  return null;
}
