import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, ContentBlock } from "@/types";

interface ConversationViewProps {
  messages: Message[];
}

function MarkdownText({ children }: { children: string }) {
  return <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>;
}

function renderContentBlock(block: ContentBlock, index: number) {
  switch (block.type) {
    case "text":
      return <MarkdownText key={index}>{block.text}</MarkdownText>;
    case "thinking":
      return (
        <em key={index} className="text-sm text-muted-foreground">
          {block.thinking}
        </em>
      );
    case "tool_use":
      return (
        <span
          key={index}
          className="inline-block rounded bg-card px-2 py-1 font-mono text-xs text-chart-3"
        >
          Tool: {block.name}
        </span>
      );
    case "tool_result":
      return null;
  }
}

function renderContent(content: Message["content"]) {
  if (typeof content === "string") {
    return <MarkdownText>{content}</MarkdownText>;
  }
  return content.map((block, i) => renderContentBlock(block, i));
}

export function ConversationView({ messages }: ConversationViewProps) {
  if (messages.length === 0) {
    return (
      <div
        data-testid="conversation-panel"
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
      >
        Select a session to view the conversation
      </div>
    );
  }

  return (
    <div
      data-testid="conversation-panel"
      className="flex h-full flex-col overflow-y-auto p-6"
    >
      <div className="flex flex-col gap-4">
        {messages.map((message, index) => (
          <div
            key={index}
            data-role={message.role}
            className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
              message.role === "user"
                ? "self-end bg-card text-accent-foreground"
                : "self-start bg-primary/10 text-foreground"
            }`}
          >
            <div
              className={`mb-1 text-xs font-semibold uppercase tracking-wide ${
                message.role === "user" ? "text-chart-2" : "text-primary"
              }`}
            >
              {message.role === "user" ? "You" : "Assistant"}
            </div>
            {renderContent(message.content)}
          </div>
        ))}
      </div>
    </div>
  );
}
