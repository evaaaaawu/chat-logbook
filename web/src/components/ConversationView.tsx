import type { Message, ContentBlock } from "@/types";

interface ConversationViewProps {
  messages: Message[];
}

function renderContentBlock(block: ContentBlock, index: number) {
  switch (block.type) {
    case "text":
      return <span key={index}>{block.text}</span>;
    case "thinking":
      return (
        <em key={index} className="text-muted-foreground">
          {block.thinking}
        </em>
      );
    case "tool_use":
      return (
        <span key={index} className="text-muted-foreground">
          Tool: {block.name}
        </span>
      );
    case "tool_result":
      return null;
  }
}

function renderContent(content: Message["content"]) {
  if (typeof content === "string") {
    return <span>{content}</span>;
  }
  return content.map((block, i) => renderContentBlock(block, i));
}

export function ConversationView({ messages }: ConversationViewProps) {
  return (
    <div>
      {messages.map((message, index) => (
        <div key={index} data-role={message.role}>
          {renderContent(message.content)}
        </div>
      ))}
    </div>
  );
}
