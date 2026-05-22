import { useEffect, useMemo, useState } from "react";
import { useChats } from "@/hooks/useChats";
import { useMessages } from "@/hooks/useMessages";
import { useToast } from "@/hooks/useToast";
import { useSortPreference } from "@/hooks/useSortPreference";
import { sortChats } from "@/lib/sortChats";
import {
  CHAT_DIRECTION_LABELS,
  CHAT_SORT_AXES,
  CHAT_SORT_CONFIG,
} from "@/lib/chatSort";
import { FilterPanel } from "@/components/FilterPanel";
import { ChatList } from "@/components/ChatList";
import { SortControl } from "@/components/SortControl";
import { ConversationView } from "@/components/ConversationView";
import { Toast } from "@/components/Toast";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

function App() {
  const { chats, softDelete, restore, setTitle } = useChats();
  const handleRenameTitle = (id: string, title: string) => {
    void setTitle(id, title);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"main" | "trash">("main");
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const { messages, error } = useMessages(selectedId);
  const { toast, showToast, dismissToast } = useToast();
  const sort = useSortPreference(CHAT_SORT_CONFIG);
  const mainChats = useMemo(
    () =>
      sortChats(
        chats.filter((c) => !c.isDeleted),
        sort.field,
        sort.direction
      ),
    [chats, sort.field, sort.direction]
  );
  const deletedChats = chats.filter((c) => c.isDeleted);
  const visibleChats = mode === "trash" ? deletedChats : mainChats;
  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  const handleRestore = (id: string) => {
    if (id === selectedId) {
      const idx = deletedChats.findIndex((c) => c.id === id);
      const remaining = deletedChats.filter((_, i) => i !== idx);
      const next = remaining[idx] ?? remaining[idx - 1] ?? null;
      setSelectedId(next?.id ?? null);
    }
    void restore(id);
    showToast({
      message: "Chat restored.",
      actionLabel: "View",
      onAction: () => {
        setMode("main");
        setSelectedId(id);
      },
    });
  };

  const handleDelete = (id: string) => {
    if (id === selectedId) {
      const idx = mainChats.findIndex((c) => c.id === id);
      const remaining = mainChats.filter((_, i) => i !== idx);
      const next = remaining[idx] ?? remaining[idx - 1] ?? null;
      setSelectedId(next?.id ?? null);
    }
    void softDelete(id);
    showToast({
      message: "Chat deleted.",
      actionLabel: "Undo",
      onAction: () => void restore(id),
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isEditable) return;

      if (e.key === "Escape" && mode === "trash") {
        e.preventDefault();
        setMode("main");
        return;
      }

      if (e.key === "Backspace" && selectedId) {
        e.preventDefault();
        if (mode === "trash") {
          handleRestore(selectedId);
        } else {
          handleDelete(selectedId);
        }
        return;
      }

      if (
        (e.key === "F2" || e.key === "Enter") &&
        selectedId &&
        mode === "main"
      ) {
        e.preventDefault();
        setEditingTitleId(selectedId);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && toast?.onAction) {
        e.preventDefault();
        toast.onAction();
        dismissToast();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className="h-screen bg-background text-foreground">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={15} minSize={10}>
          <FilterPanel
            deletedCount={deletedChats.length}
            onOpenTrash={() => setMode("trash")}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={25} minSize={15}>
          <ChatList
            mode={mode}
            chats={visibleChats}
            selectedId={selectedId}
            editingId={editingTitleId}
            onEditingIdChange={setEditingTitleId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onRestore={handleRestore}
            onRenameTitle={handleRenameTitle}
            onBack={() => setMode("main")}
            deletedCount={deletedChats.length}
            onOpenTrash={() => setMode("trash")}
            sortSignature={`${sort.field}:${sort.direction}`}
            sortControl={
              <SortControl
                testId="chat-sort-popover"
                axes={CHAT_SORT_AXES}
                field={sort.field}
                direction={sort.direction}
                isDefault={sort.isDefault}
                directionLabels={CHAT_DIRECTION_LABELS}
                onSelectField={sort.selectField}
                onToggleDirection={sort.toggleDirection}
              />
            }
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={60} minSize={30}>
          <ConversationView
            chat={selectedChat}
            messages={messages}
            error={error}
            onRestore={handleRestore}
            onRenameTitle={handleRenameTitle}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
