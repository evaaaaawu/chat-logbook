import type { ContentBlock, Message } from "@/types";

export type ToolResultBlock = Extract<ContentBlock, { type: "tool_result" }>;

/**
 * Every tool result in the Chat, keyed by the `tool_use` id it answers.
 *
 * Built from the *unfiltered* Message list. An Agent usually records a result
 * in the turn after the call, and such a turn renders nothing of its own, so it
 * is dropped before layout (#192). Collecting before that drop is what lets a
 * call find its result whichever turn carried it (#193).
 */
export function collectToolResults(
  messages: Message[]
): Map<string, ToolResultBlock> {
  const results = new Map<string, ToolResultBlock>();
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type === "tool_result") results.set(block.tool_use_id, block);
    }
  }
  return results;
}
