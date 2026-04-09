import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Message, ContentBlock } from "@/types";
import { CollapsibleThinking } from "./CollapsibleThinking";
import { CollapsibleToolCall } from "./CollapsibleToolCall";

interface ConversationViewProps {
  messages: Message[];
  error?: string | null;
}

function MarkdownText({ children }: { children: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
      {children}
    </Markdown>
  );
}

function renderContentBlock(block: ContentBlock, index: number) {
  switch (block.type) {
    case "text":
      return <MarkdownText key={index}>{block.text}</MarkdownText>;
    case "thinking":
      if (!block.thinking) return null;
      return <CollapsibleThinking key={index} thinking={block.thinking} />;
    case "tool_use":
      return <CollapsibleToolCall key={index} block={block} />;
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

function MessageBubble({ message }: { message: Message }) {
  return (
    <div
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
  );
}

export function ConversationView({ messages, error }: ConversationViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 100,
    initialRect: { width: 800, height: 600 },
  });

  if (error) {
    return (
      <div
        data-testid="conversation-panel"
        className="flex h-full items-center justify-center text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

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
      ref={scrollContainerRef}
      className="h-full overflow-y-auto p-6"
    >
      <div
        className="relative flex flex-col"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.index}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 right-0 flex flex-col pb-4"
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            <MessageBubble message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
