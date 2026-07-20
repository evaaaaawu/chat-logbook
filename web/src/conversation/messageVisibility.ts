import type { ContentBlock, Message } from "@/types";

function hasText(text: string): boolean {
  return text.trim().length > 0;
}

function rendersSomething(block: ContentBlock): boolean {
  switch (block.type) {
    case "text":
      return hasText(block.text);
    case "thinking":
      return hasText(block.thinking);
    case "tool_use":
      // Renders as a collapsed row — visible, though it carries no header.
      return true;
    case "tool_result":
      // Never rendered on its own: a result belongs to the tool call that
      // produced it, not to the turn the Agent happened to record it under.
      return false;
    case "command":
      // The reader's own slash-command action, shown as a chip.
      return true;
    case "system":
      // Harness noise, shown as a collapsed row the reader skims past.
      return true;
  }
}

/**
 * Whether a Message puts anything on screen at all.
 *
 * A turn that renders nothing — most often a user turn carrying only tool
 * results — is dropped before layout, so it can never surface as an empty
 * authored block (#192). Suppressing it at render time would still leave the
 * turn occupying a row in the virtualized list.
 */
export function hasRenderableContent(message: Message): boolean {
  if (typeof message.content === "string") return hasText(message.content);
  return message.content.some(rendersSomething);
}

/**
 * Whether a Message is authored prose, and so earns a `You` / agent-name
 * header.
 *
 * Text and a slash-command invocation count: both are things the reader wrote,
 * so they earn a `You` header. Tool calls and thinking are collapsed units: the
 * Agent logs them as turns of their own, but the reader sees them as part of the
 * moment that prompted them, so they nest under the preceding header instead of
 * repeating it (#192).
 */
export function hasAuthorHeader(message: Message): boolean {
  if (typeof message.content === "string") return hasText(message.content);
  return message.content.some(
    (block) =>
      (block.type === "text" && hasText(block.text)) || block.type === "command"
  );
}
