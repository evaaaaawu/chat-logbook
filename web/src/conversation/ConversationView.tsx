import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RotateCcw } from "lucide-react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Message, ContentBlock, Chat } from "@/types";
import { CollapsibleThinking } from "@/conversation/CollapsibleThinking";
import { CollapsibleToolCall } from "@/conversation/CollapsibleToolCall";
import { ChatMetadataPopover } from "@/metadata/ChatMetadataPopover";
import { EditableTitle } from "@/metadata/EditableTitle";

interface ConversationViewProps {
  chat: Chat | null;
  messages: Message[];
  error?: string | null;
  onRestore?: (id: string) => void;
  onRenameTitle?: (id: string, title: string) => void;
  editingTitle?: boolean;
  onEditingTitleChange?: (next: boolean) => void;
}

function DeletedBanner({
  chatId,
  onRestore,
}: {
  chatId: string;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-md border border-[#a13836] bg-[#3a1d23] px-4 py-2.5 text-sm">
      <span className="text-foreground">
        <strong className="text-destructive">This chat is deleted.</strong> It
        won't appear in your main list until restored.
      </span>
      <button
        type="button"
        onClick={() => onRestore(chatId)}
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

const HEADER_TITLE_DISPLAY_CLASS =
  "inline-block max-w-full truncate align-middle rounded px-1.5 py-0.5 -mx-1.5 text-sm font-semibold text-accent-foreground cursor-text transition-colors hover:bg-white/[0.04]";
const HEADER_TITLE_INPUT_CLASS =
  "min-w-[12ch] max-w-full rounded border border-border bg-transparent px-1.5 py-0.5 text-sm font-semibold text-accent-foreground outline-none focus:border-primary [field-sizing:content]";

function ConversationHeader({
  chat,
  editing,
  onEditingChange,
  onRenameTitle,
}: {
  chat: Chat | null;
  editing: boolean;
  onEditingChange: (next: boolean) => void;
  onRenameTitle?: (id: string, title: string) => void;
}) {
  return (
    <div
      data-testid="conversation-header"
      className="flex h-12 shrink-0 items-center gap-4 border-b border-border px-5"
    >
      {chat && (
        <>
          <div className="min-w-0 flex-1">
            {onRenameTitle ? (
              <EditableTitle
                value={chat.title}
                editing={editing}
                onEditStart={() => onEditingChange(true)}
                onEditEnd={() => onEditingChange(false)}
                onSave={(next) => onRenameTitle(chat.id, next)}
                displayClassName={HEADER_TITLE_DISPLAY_CLASS}
                inputClassName={HEADER_TITLE_INPUT_CLASS}
                inputAriaLabel="Chat title"
              />
            ) : (
              <span className={HEADER_TITLE_DISPLAY_CLASS}>{chat.title}</span>
            )}
          </div>
          <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
            {getProjectName(chat.project)} · {getRelativeTime(chat.updatedAt)}
          </div>
          <ChatMetadataPopover key={chat.id} chat={chat} />
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
  chat,
  messages,
  error,
  onRestore,
  onRenameTitle,
  editingTitle,
  onEditingTitleChange,
}: ConversationViewProps) {
  const [internalEditing, setInternalEditing] = useState(false);
  const headerEditing =
    editingTitle !== undefined ? editingTitle : internalEditing;
  const setHeaderEditing = (next: boolean) => {
    setInternalEditing(next);
    onEditingTitleChange?.(next);
  };
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // TanStack Virtual's useVirtualizer returns functions (e.g. measureElement)
  // that the React Compiler cannot memoize without risking stale UI, so the
  // compiler intentionally skips memoizing this component. This is expected and
  // safe here: the virtualizer values are consumed locally and not passed into
  // other memoized components/hooks. The warning cannot be compiled away, so we
  // silence it at the call site rather than disabling the rule globally.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 100,
    initialRect: { width: 800, height: 600 },
  });

  return (
    <div className="flex h-full flex-col">
      <ConversationHeader
        chat={chat}
        editing={headerEditing}
        onEditingChange={setHeaderEditing}
        onRenameTitle={onRenameTitle}
      />
      {chat?.isDeleted && onRestore && (
        <DeletedBanner chatId={chat.id} onRestore={onRestore} />
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
          Select a chat to view the conversation
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
