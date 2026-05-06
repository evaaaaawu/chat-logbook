import { useEffect, useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useMessages } from "@/hooks/useMessages";
import { useToast } from "@/hooks/useToast";
import { FilterPanel } from "@/components/FilterPanel";
import { SessionList } from "@/components/SessionList";
import { ConversationView } from "@/components/ConversationView";
import { Toast } from "@/components/Toast";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

function App() {
  const { sessions, softDelete, restore } = useSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"main" | "trash">("main");
  const { messages, error } = useMessages(selectedId);
  const { toast, showToast, dismissToast } = useToast();
  const mainSessions = sessions.filter((s) => !s.isDeleted);
  const deletedSessions = sessions.filter((s) => s.isDeleted);
  const visibleSessions = mode === "trash" ? deletedSessions : mainSessions;
  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

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

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && toast?.onAction) {
        e.preventDefault();
        toast.onAction();
        dismissToast();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const handleRestore = (id: string) => {
    if (id === selectedId) {
      const idx = deletedSessions.findIndex((s) => s.id === id);
      const remaining = deletedSessions.filter((_, i) => i !== idx);
      const next = remaining[idx] ?? remaining[idx - 1] ?? null;
      setSelectedId(next?.id ?? null);
    }
    void restore(id);
    showToast({
      message: "Session restored.",
      actionLabel: "View",
      onAction: () => {
        setMode("main");
        setSelectedId(id);
      },
    });
  };

  const handleDelete = (id: string) => {
    if (id === selectedId) {
      const idx = mainSessions.findIndex((s) => s.id === id);
      const remaining = mainSessions.filter((_, i) => i !== idx);
      const next = remaining[idx] ?? remaining[idx - 1] ?? null;
      setSelectedId(next?.id ?? null);
    }
    void softDelete(id);
    showToast({
      message: "Session deleted.",
      actionLabel: "Undo",
      onAction: () => void restore(id),
    });
  };

  return (
    <div className="h-screen bg-background text-foreground">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={15} minSize={10}>
          <FilterPanel
            deletedCount={deletedSessions.length}
            onOpenTrash={() => setMode("trash")}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={25} minSize={15}>
          <SessionList
            mode={mode}
            sessions={visibleSessions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onRestore={handleRestore}
            onBack={() => setMode("main")}
            deletedCount={deletedSessions.length}
            onOpenTrash={() => setMode("trash")}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={60} minSize={30}>
          <ConversationView
            session={selectedSession}
            messages={messages}
            error={error}
            onRestore={handleRestore}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
