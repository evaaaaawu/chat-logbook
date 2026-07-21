import type { ContentBlock, Message } from "@/types";

// What survives a copy: the blocks a person wrote. Reasoning, tool traffic,
// harness noise and image metadata are collapsed or lazily addressed on screen
// precisely because they are not what the reader came to take away.
function blockToMarkdown(block: ContentBlock): string | null {
  switch (block.type) {
    case "text":
      return block.text;
    case "command":
      return block.args ? `${block.name} ${block.args}` : block.name;
    default:
      return null;
  }
}

/**
 * The markdown a reader takes away when they copy a Message. Blocks are joined
 * by a blank line — markdown's paragraph break — so pasted text keeps the
 * separation the reader saw on screen.
 */
export function messageToMarkdown(message: Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map(blockToMarkdown)
    .filter((part) => part !== null)
    .join("\n\n");
}
