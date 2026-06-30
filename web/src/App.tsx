import { useCallback, useEffect, useMemo, useState } from "react";
import { useChats } from "@/chat/useChats";
import {
  usePaginatedChats,
  type ListDirection,
  type ListSort,
} from "@/chat/usePaginatedChats";
import { useTags } from "@/tags/useTags";
import { useMessages } from "@/conversation/useMessages";
import { useToast } from "@/shared/useToast";
import { useChatOrder } from "@/chat/sort/useChatOrder";
import { useSortPreference } from "@/chat/sort/useSortPreference";
import { CHAT_SORT_CONFIG } from "@/chat/sort/sortConfig";
import { facetsFromCounts } from "@/chat/projects/projectFacets";
import { useChatCounts } from "@/chat/useChatCounts";
import { useFilteredTotal } from "@/chat/useFilteredTotal";
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

  // The main view's time sorts page server-side in both directions: the keyset
  // index covers createdAt/updatedAt either way (ADR-0017, #143). Title sort and
  // the Trash view stay on the full-load client path. The two read hooks always
  // run (hooks rule); `enabled` decides which one fetches.
  const paginate =
    mode === "main" &&
    (mainPref.field === "createdAt" || mainPref.field === "updatedAt");
  const pageSort: ListSort =
    mainPref.field === "createdAt" ? "createdAt" : "updatedAt";
  const pageDirection: ListDirection = mainPref.direction;

  // The active filter is owned here so the paginated read path can push it into
  // the keyset query (#130): an empty selection means "all". Declared above the
  // read hooks because `usePaginatedChats` re-anchors on the selection. The
  // empty-string entry selects the (No project) / Untagged group on each axis.
  const [selectedProjects, setSelectedProjects] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const full = useChats({ enabled: !paginate });
  // The paginated path filters server-side: the selection rides the keyset query
  // and re-anchors the window on change (#130). The full-load path (Title sort,
  // Trash) keeps filtering its loaded window client-side below.
  const paginated = usePaginatedChats(pageSort, pageDirection, {
    enabled: paginate,
    projects: [...selectedProjects],
    tags: [...selectedTags],
  });
  const source = paginate ? paginated : full;
  const { chats, sortEpoch, softDelete, restore, setTitle, reload } = source;

  // Filter-panel facet counts and the unfiltered List count come from a server
  // aggregation (#131 Phase A), not from folding the loaded window — so they
  // reflect the whole view (main vs Trash) even when the list is paginated.
  const counts = useChatCounts(mode);
  // The Trash link badge needs the trashed total in any view, so it reads the
  // Trash counts independently of the active view's counts.
  const trashCounts = useChatCounts("trash");

  const onAssignmentChange = useCallback(() => {
    void reload();
    void counts.reload();
  }, [reload, counts.reload]);
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

  // Project filter toggles: an empty selection means "all Projects". Facets are
  // derived from the active view's chats (so counts are per-view), and the
  // selected Projects are ensured into the list so a selected Project stays
  // visible even after its last chat leaves the view (count 0). The state itself
  // is declared above the read hooks so the paginated path can re-anchor on it.
  const toggleProject = useCallback((project: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }, []);

  // Tag filter toggles: AND within (a chat must hold every selected Tag),
  // combined with the Project filter (OR within) — AND across types. An empty
  // selection means "all Tags". The `UNTAGGED` sentinel selects chats with zero
  // Tags. The state is declared above the read hooks (see selectedProjects).
  const toggleTag = useCallback((tagId: string) => {
    setSelectedTags((prev) => toggleTagSelection(prev, tagId));
  }, []);
  const clearFilters = useCallback(() => {
    setSelectedProjects(new Set());
    setSelectedTags(new Set());
  }, []);

  // Project facets come from the server count aggregation; a selected Project is
  // ensured into the list so it stays visible at count 0 once its last chat
  // leaves the view.
  const projectFacets = useMemo(
    () =>
      facetsFromCounts(counts.counts.projects, {
        ensure: [...selectedProjects],
      }),
    [counts.counts.projects, selectedProjects]
  );

  // The paginated path already filtered server-side inside the keyset query
  // (#130), so its window is the filtered set — applying the client-side window
  // filter again would be redundant and would fight pagination. The full-load
  // path (Title sort, Trash) still filters its loaded window here.
  const visibleChats = paginate
    ? order.orderedChats
    : filterChatsByTags(
        filterChatsByProjects(order.orderedChats, selectedProjects),
        selectedTags
      );
  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  // Tag and Untagged counts are server-derived per view (main vs Trash). They
  // state each group's size in this view, not the post-filter result, so
  // selecting a Tag never moves the numbers.
  const countForTag = counts.tagCount;
  const untaggedCount = counts.counts.untagged;

  // The "Chats N" header total: server-derived in both cases. Unfiltered, it is
  // the view's facet total (#131 Phase A); filtered, it is the server's
  // post-filter count (#131 Phase B) — accurate even when the paginated window
  // holds only a page of the filtered set.
  const filterActive = selectedProjects.size + selectedTags.size > 0;
  const filteredTotal = useFilteredTotal(
    mode,
    [...selectedProjects],
    [...selectedTags]
  );
  // While the first filtered total is still loading (filteredTotal undefined),
  // hold the view's facet total rather than letting the header fall back to the
  // paginated window count (the page size) — that would flash a wrong number
  // for a frame before the real filtered total lands (#131).
  const listTotal = filterActive
    ? (filteredTotal ?? counts.counts.total)
    : counts.counts.total;
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
    void counts.reload();
    void trashCounts.reload();
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
    void counts.reload();
    void trashCounts.reload();
    showToast({
      message: "Chat deleted.",
      actionLabel: "Undo",
      onAction: () => {
        void restore(id);
        void counts.reload();
        void trashCounts.reload();
      },
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
            deletedCount={trashCounts.counts.total}
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
            total={listTotal}
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
