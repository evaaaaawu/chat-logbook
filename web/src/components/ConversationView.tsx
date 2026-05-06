import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RotateCcw } from "lucide-react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Message, ContentBlock, Session } from "@/types";
import { CollapsibleThinking } from "./CollapsibleThinking";
import { CollapsibleToolCall } from "./CollapsibleToolCall";

interface ConversationViewProps {
  session: Session | null;
  messages: Message[];
  error?: string | null;
  onRestore?: (id: string) => void;
}

function DeletedBanner({
  sessionId,
  onRestore,
}: {
  sessionId: string;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-md border border-[#a13836] bg-[#3a1d23] px-4 py-2.5 text-sm">
      <span className="text-foreground">
        <strong className="text-destructive">This session is deleted.</strong>{" "}
        It won't appear in your main list until restored.
      </span>
      <button
        type="button"
        onClick={() => onRestore(sessionId)}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <RotateCcw size={14} aria-hidden="true" />
        Restore
      </button>
    </div>
  );
}

function getProjectName(projectPath: string): string {
  const segments = projectPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? projectPath;
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return "just now";
}

function ConversationHeader({ session }: { session: Session | null }) {
  return (
    <div
      data-testid="conversation-header"
      className="flex h-12 shrink-0 items-center gap-4 border-b border-border px-5"
    >
      {session && (
        <>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-accent-foreground">
            {session.title}
          </div>
          <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
            {getProjectName(session.project)} ·{" "}
            {getRelativeTime(session.updatedAt)}
          </div>
        </>
      )}
    </div>
  );
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

export function ConversationView({
  session,
  messages,
  error,
  onRestore,
}: ConversationViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 100,
    initialRect: { width: 800, height: 600 },
  });

  return (
    <div className="flex h-full flex-col">
      <ConversationHeader session={session} />
      {session?.isDeleted && onRestore && (
        <DeletedBanner sessionId={session.id} onRestore={onRestore} />
      )}
      {error ? (
        <div
          data-testid="conversation-panel"
          className="flex flex-1 items-center justify-center text-sm text-destructive"
        >
          {error}
        </div>
      ) : messages.length === 0 ? (
        <div
          data-testid="conversation-panel"
          className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        >
          Select a session to view the conversation
        </div>
      ) : (
        <div
          data-testid="conversation-panel"
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-6"
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
      )}
    </div>
  );
}
