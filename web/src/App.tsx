import { useCallback, useEffect, useMemo, useState } from "react";
import { useChats } from "@/chat/useChats";
import { usePaginatedChats, type ListSort } from "@/chat/usePaginatedChats";
import { useTags } from "@/tags/useTags";
import { useMessages } from "@/conversation/useMessages";
import { useToast } from "@/shared/useToast";
import { useChatOrder } from "@/chat/sort/useChatOrder";
import { useSortPreference } from "@/chat/sort/useSortPreference";
import { CHAT_SORT_CONFIG } from "@/chat/sort/sortConfig";
import { deriveProjects } from "@/chat/projects/deriveProjects";
import { filterChatsByProjects } from "@/chat/projects/filterChatsByProjects";
import { filterChatsByTags } from "@/tags/filterChatsByTags";
import { toggleTagSelection } from "@/tags/toggleTagSelection";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"main" | "trash">("main");
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

  // The main view's sort preference is owned here, not inside useChatOrder, so
  // the data path and the SortControl agree on one instance: the same field and
  // direction decide whether to paginate.
  const mainPref = useSortPreference(CHAT_SORT_CONFIG);

  // Only the main view's descending time sorts page server-side (the keyset
  // index covers createdAt/updatedAt DESC, per ADR-0017). Title sort, ascending
  // time, and the Trash view stay on the full-load client path. The two read
  // hooks always run (hooks rule); `enabled` decides which one fetches.
  const paginate =
    mode === "main" &&
    (mainPref.field === "createdAt" || mainPref.field === "updatedAt") &&
    mainPref.direction === "desc";
  const pageSort: ListSort =
    mainPref.field === "createdAt" ? "createdAt" : "updatedAt";

  const full = useChats({ enabled: !paginate });
  const paginated = usePaginatedChats(pageSort, { enabled: paginate });
  const source = paginate ? paginated : full;
  const { chats, sortEpoch, softDelete, restore, setTitle, reload } = source;

  const onAssignmentChange = useCallback(() => {
    void reload();
  }, [reload]);
  const {
    tags: tagCatalog,
    createTag,
    renameTag,
    recolorTag,
    deleteTag,
    assignTag,
    removeTag,
  } = useTags({ onAssignmentChange });
  const handleRenameTitle = (id: string, title: string) => {
    void setTitle(id, title);
  };
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
  const mainOrder = useChatOrder("main", chats, resortKey, mainPref);
  const trashOrder = useChatOrder("trash", chats, resortKey);
  const order = mode === "trash" ? trashOrder : mainOrder;
  const mainChats = mainOrder.orderedChats;
  const deletedChats = trashOrder.orderedChats;

  // Project filter: an empty selection means "all Projects". Facets are derived
  // from the active view's chats (so counts are per-view), and the selected
  // Projects are ensured into the list so a selected Project stays visible even
  // after its last chat leaves the view (count 0).
  const [selectedProjects, setSelectedProjects] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const toggleProject = useCallback((project: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }, []);

  // Tag filter: AND within (a chat must hold every selected Tag), combined with
  // the Project filter (OR within) by intersecting the two filtered sets — AND
  // across types. An empty selection means "all Tags". The `UNTAGGED` sentinel
  // selects chats with zero Tags.
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const toggleTag = useCallback((tagId: string) => {
    setSelectedTags((prev) => toggleTagSelection(prev, tagId));
  }, []);
  const clearFilters = useCallback(() => {
    setSelectedProjects(new Set());
    setSelectedTags(new Set());
  }, []);

  const projectFacets = useMemo(
    () => deriveProjects(order.orderedChats, { ensure: [...selectedProjects] }),
    [order.orderedChats, selectedProjects]
  );

  const visibleChats = filterChatsByTags(
    filterChatsByProjects(order.orderedChats, selectedProjects),
    selectedTags
  );
  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  // Tag and Untagged counts reflect the active view (main vs Trash), deriving
  // from the same per-view list the Project facet counts use — so the two
  // sections agree. They state each group's size in this view, not the
  // post-filter result, so selecting a Tag never moves the numbers.
  const viewChats = order.orderedChats;
  const countForTag = useCallback(
    (tagId: string) =>
      viewChats.filter((c) => c.tags?.some((t) => t.id === tagId)).length,
    [viewChats]
  );
  const untaggedCount = useMemo(
    () => viewChats.filter((c) => (c.tags?.length ?? 0) === 0).length,
    [viewChats]
  );
  // Create a Tag and immediately assign it to the chat the popover is on.
  const createTagForChat = useCallback(
    async (
      chatId: string,
      name: string,
      color: Parameters<typeof createTag>[1]
    ) => {
      const created = await createTag(name, color);
      if (created) await assignTag(chatId, created.id);
      return created;
    },
    [createTag, assignTag]
  );

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
      // Keystrokes inside an open popover (find-or-create, recolor, metadata…)
      // belong to that popover, not the global chat shortcuts. Without this,
      // Enter/Backspace while focus sits on a non-input element in a popover
      // (e.g. a color swatch) would start a title rename or trash the chat.
      if (
        target instanceof Element &&
        target.closest('[data-slot="popover-content"]')
      )
        return;

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
            onOpenTrash={() => switchMode("trash")}
            projectFacets={projectFacets}
            selectedProjects={selectedProjects}
            onToggleProject={toggleProject}
            onClearFilters={clearFilters}
            tags={tagCatalog}
            countForTag={countForTag}
            untaggedCount={untaggedCount}
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
            onRenameTag={(id, name) => void renameTag(id, name)}
            onRecolorTag={(id, color) => void recolorTag(id, color)}
            onDeleteTag={(id) => void deleteTag(id)}
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
            onOpenTrash={() => switchMode("trash")}
            sortSignature={`${mode}:${order.sortControlProps.field}:${order.sortControlProps.direction}`}
            sortControl={<SortControl {...order.sortControlProps} />}
            hasMore={source.hasMore}
            onLoadMore={source.loadMore}
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
            allTags={tagCatalog}
            onAssignTag={(chatId, tagId) => void assignTag(chatId, tagId)}
            onRemoveTag={(chatId, tagId) => void removeTag(chatId, tagId)}
            onCreateTag={createTagForChat}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
