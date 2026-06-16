import { useEffect, useState } from "react";
import { useChats } from "@/chat/useChats";
import { useMessages } from "@/conversation/useMessages";
import { useToast } from "@/shared/useToast";
import { useChatOrder } from "@/chat/sort/useChatOrder";
import { FilterPanel } from "@/chat/FilterPanel";
import { ChatList } from "@/chat/ChatList";
import { SortControl } from "@/chat/sort/SortControl";
import { ConversationView } from "@/conversation/ConversationView";
import { Toast } from "@/shared/Toast";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/shared/ui/resizable";

function App() {
  const { chats, sortEpoch, softDelete, restore, setTitle } = useChats();
  const handleRenameTitle = (id: string, title: string) => {
    void setTitle(id, title);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"main" | "trash">("main");
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const { messages, error } = useMessages(selectedId);
  const { toast, showToast, dismissToast } = useToast();

  // Switching views (Chat List <-> Trash) flushes any held-back background order
  // by counting as a re-sort. A monotonic generation bumps on every view switch
  // and feeds the frozen-sort key, so returning to a view re-sorts with the
  // latest data rather than reviving the order it had on the way out.
  const [viewGen, setViewGen] = useState(0);
  const switchMode = (next: "main" | "trash") => {
    setMode(next);
    setViewGen((g) => g + 1);
  };

  // sortEpoch (user data actions) and viewGen (view switches) both flush the
  // frozen order; sort field/direction changes flush it inside the hook.
  const resortKey = `${sortEpoch}:${viewGen}`;
  const mainOrder = useChatOrder("main", chats, resortKey);
  const trashOrder = useChatOrder("trash", chats, resortKey);
  const order = mode === "trash" ? trashOrder : mainOrder;
  const mainChats = mainOrder.orderedChats;
  const deletedChats = trashOrder.orderedChats;
  const visibleChats = order.orderedChats;
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
        switchMode("main");
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
        switchMode("main");
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
            onOpenTrash={() => switchMode("trash")}
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
            onBack={() => switchMode("main")}
            deletedCount={deletedChats.length}
            onOpenTrash={() => switchMode("trash")}
            sortSignature={`${mode}:${order.sortControlProps.field}:${order.sortControlProps.direction}`}
            sortControl={<SortControl {...order.sortControlProps} />}
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
