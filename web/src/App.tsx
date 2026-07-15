import { useCallback, useEffect, useMemo, useState } from "react";
import {
  usePaginatedChats,
  type ListDirection,
  type ListSort,
} from "@/chat/usePaginatedChats";
import { useTags } from "@/tags/useTags";
import { useTagMode } from "@/tags/useTagMode";
import { useMessages } from "@/conversation/useMessages";
import { useToast } from "@/shared/useToast";
import { modifierHint } from "@/shared/platform";
import { useChatOrder } from "@/chat/sort/useChatOrder";
import { useSortPreference } from "@/chat/sort/useSortPreference";
import { CHAT_SORT_CONFIG, TRASH_SORT_CONFIG } from "@/chat/sort/sortConfig";
import { facetsFromCounts } from "@/chat/projects/projectFacets";
import { useChatCounts } from "@/chat/useChatCounts";
import { useFilteredTotal } from "@/chat/useFilteredTotal";
import { toggleTagSelection } from "@/tags/toggleTagSelection";
import { FilterPanel } from "@/chat/FilterPanel";
import { ChatList } from "@/chat/ChatList";
import { BatchTagButton } from "@/tags/BatchTagButton";
import { useSelection } from "@/chat/useSelection";
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

  // The sort preferences are owned here, not inside useChatOrder, so the data
  // path and each view's SortControl agree on one instance: the same field and
  // direction drive the keyset query.
  const mainPref = useSortPreference(CHAT_SORT_CONFIG);
  const trashPref = useSortPreference(TRASH_SORT_CONFIG);

  // Every axis pages server-side now (ADR-0018): the time axes scan the keyset
  // index either way (#143), the Trash view adds the deleted-time axis (#145),
  // and Title sorts through the precomputed collation key (#146 / ADR-0019).
  // There is no full-load fallback left — the read hook always paginates, scoped
  // per view. The two hooks both run (hooks rule); `enabled` picks the active one.
  const mainPaginate = mode === "main";
  const trashPaginate = mode === "trash";
  // The active axis maps straight to a keyset sort in both views.
  const pageSort: ListSort =
    mainPref.field === "createdAt"
      ? "createdAt"
      : mainPref.field === "title"
        ? "title"
        : "updatedAt";
  const pageDirection: ListDirection = mainPref.direction;
  const trashPageSort: ListSort =
    trashPref.field === "createdAt"
      ? "createdAt"
      : trashPref.field === "updatedAt"
        ? "updatedAt"
        : trashPref.field === "title"
          ? "title"
          : "deletedAt";

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
  // The Tag filter's Match mode (all/any), persisted per view like the sort
  // preference (ADR-0016 update). Main and Trash keep independent modes; the
  // active one rides the read hooks and the TagsSection control.
  const mainTagMode = useTagMode("main");
  const trashTagMode = useTagMode("trash");
  const tagMode = mode === "trash" ? trashTagMode : mainTagMode;

  // The paginated path filters server-side: the selection rides the keyset query
  // and re-anchors the window on change (#130). Both views read through it now;
  // `enabled` keeps the inactive view's hook idle.
  const paginated = usePaginatedChats(pageSort, pageDirection, {
    enabled: mainPaginate,
    projects: [...selectedProjects],
    tags: [...selectedTags],
    tagMode: mainTagMode.mode,
  });
  // The Trash view reuses the same paginated read path, scoped to trashed-only
  // (#145). It re-anchors on the active filter and its axis the same way the main
  // view does.
  const trashPaginated = usePaginatedChats(trashPageSort, trashPref.direction, {
    enabled: trashPaginate,
    trashedOnly: true,
    projects: [...selectedProjects],
    tags: [...selectedTags],
    tagMode: trashTagMode.mode,
  });
  const source = mode === "trash" ? trashPaginated : paginated;
  const {
    chats,
    sortEpoch,
    softDelete,
    restore,
    setTitle,
    reload,
    softDeleteBatch,
    restoreBatch,
  } = source;

  // Filter-panel facet counts and the unfiltered List count come from a server
  // aggregation (#131 Phase A), not from folding the loaded window — so they
  // reflect the whole view (main vs Trash) even when the list is paginated.
  const counts = useChatCounts(mode);
  // The Trash link badge needs the trashed total in any view, so it reads the
  // Trash counts independently of the active view's counts.
  const trashCounts = useChatCounts("trash");

  // Destructure the (stable) counts reloader into a local so the callback deps
  // are plain identifiers — a `counts.reload` member dep can't be tracked by the
  // React Compiler's manual-memoization check.
  const { reload: reloadCounts } = counts;
  const onAssignmentChange = useCallback(() => {
    void reload();
    void reloadCounts();
  }, [reload, reloadCounts]);
  const {
    tags: tagCatalog,
    createTag,
    renameTag,
    recolorTag,
    deleteTag,
    assignTag,
    removeTag,
    assignTagsBatch,
    fetchTagsByChat,
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
  const trashOrder = useChatOrder("trash", chats, resortKey, trashPref);
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

  // Every axis filters server-side inside the keyset query now (#130), so the
  // loaded window is already the filtered set — re-filtering it client-side would
  // be redundant and would fight pagination. The ordered window renders as-is.
  const visibleChats = order.orderedChats;
  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  // The Selection (batch Move to Trash, #161) with the Open Chat as its primary
  // member. Keyed to filter + view so it re-seeds to the primary on a filter
  // change or view switch but rides sort changes and background refreshes (an id
  // set). Range selection walks the visible order.
  const visibleIds = visibleChats.map((c) => c.id);
  const selectionResetKey = `${mode}:${[...selectedProjects].sort().join(",")}:${[...selectedTags].sort().join(",")}:${tagMode.mode}`;
  const selection = useSelection({
    orderedIds: visibleIds,
    primaryId: selectedId,
    resetKey: selectionResetKey,
  });

  // Open a Chat: it becomes the Open Chat and the sole Selection (a plain click
  // or keyboard move collapses any multi-selection). Shared by the row click and
  // the Cursor's debounced open.
  const openChat = useCallback(
    (id: string) => {
      setSelectedId(id);
      selection.selectOnly(id);
    },
    [selection]
  );

  // Cmd/Ctrl+click toggles one id. The reading pane does not follow a modifier
  // click — except when you toggle off the Open Chat itself, where the primary
  // has to move to the nearest remaining member (or empty when none remain).
  const toggleSelect = useCallback(
    (id: string) => {
      if (id === selectedId && selection.selectedIds.has(id)) {
        const remaining = visibleIds.filter(
          (x) => x !== id && selection.selectedIds.has(x)
        );
        const at = visibleIds.indexOf(id);
        const below = visibleIds
          .slice(at + 1)
          .find((x) => remaining.includes(x));
        const above = [...visibleIds.slice(0, at)]
          .reverse()
          .find((x) => remaining.includes(x));
        setSelectedId(below ?? above ?? null);
      }
      selection.toggle(id);
    },
    [selectedId, selection, visibleIds]
  );

  // Shift+click ranges from the primary (the anchor) to the target; the reading
  // pane stays put. Cmd/Ctrl+Shift makes it additive.
  const rangeSelect = useCallback(
    (id: string, additive: boolean) => {
      if (selectedId === null) {
        openChat(id);
        return;
      }
      selection.selectRange(selectedId, id, additive);
    },
    [selectedId, selection, openChat]
  );

  // Clear (the batch bar button and Esc) collapses the Selection to the Open
  // Chat, dismissing the batch bar without disturbing what you are reading.
  const clearSelection = useCallback(() => {
    if (selectedId) selection.selectOnly(selectedId);
    else selection.clear();
  }, [selectedId, selection]);

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
    [...selectedTags],
    tagMode.mode
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
      actionHint: modifierHint("Z"),
      onAction: () => {
        void restore(id);
        void counts.reload();
        void trashCounts.reload();
      },
    });
  };

  // Batch Move to Trash over the Selection (#161). One request flips the whole
  // set (ADR-0021 explicit-ids branch); the client reloads its window and the
  // facet counts rather than mutating rows in place, then raises an Undo toast
  // whose inverse is a batch restore. Selection clears immediately so the bar
  // dismisses without waiting on the round-trip.
  const handleBatchTrash = () => {
    const chatIds = [...selection.selectedIds];
    if (chatIds.length === 0) return;
    // The batch trashes the primary too, so move the Open Chat to the first
    // surviving row (or empty), then collapse the Selection.
    const trashed = new Set(chatIds);
    const nextOpen = visibleIds.find((x) => !trashed.has(x)) ?? null;
    setSelectedId(nextOpen);
    selection.clear();
    const refreshCounts = () => {
      void counts.reload();
      void trashCounts.reload();
    };
    void softDeleteBatch(chatIds);
    refreshCounts();
    const n = chatIds.length;
    showToast({
      message: `${n} chat${n > 1 ? "s" : ""} moved to Trash.`,
      actionLabel: "Undo",
      actionHint: modifierHint("Z"),
      onAction: () => {
        void restoreBatch(chatIds);
        refreshCounts();
      },
    });
  };

  // Apply the staged batch Tag diff over the Selection (#163). One request
  // carries the add/remove diff (ADR-0021 explicit-ids branch), then the
  // drop-reconcile reload (#176) drops any Chat the change moved out of an active
  // filter. That reload reports which ids left the list, so the Selection prunes
  // to exactly those — it never dangles on Chats you can no longer see, and a
  // Chat merely scrolled out of the window (not a drop) is untouched.
  const applyBatchTag = useCallback(
    async (chatIds: string[], diff: { add: string[]; remove: string[] }) => {
      await assignTagsBatch(chatIds, diff);
      const dropped = await reload();
      void reloadCounts();
      if (dropped.length > 0) selection.deselect(dropped);
    },
    [assignTagsBatch, reload, reloadCounts, selection]
  );

  // The Undo toast replays the inverse diff (add↔remove) through the same path.
  const handleBatchTag = (
    chatIds: string[],
    diff: { add: string[]; remove: string[] }
  ) => {
    if (chatIds.length === 0) return;
    if (diff.add.length === 0 && diff.remove.length === 0) return;
    void applyBatchTag(chatIds, diff);
    const n = chatIds.length;
    showToast({
      message: `Tags updated on ${n} chat${n > 1 ? "s" : ""}.`,
      actionLabel: "Undo",
      actionHint: modifierHint("Z"),
      onAction: () => {
        void applyBatchTag(chatIds, { add: diff.remove, remove: diff.add });
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
      // Keystrokes inside an open popover or modal dialog (find-or-create,
      // recolor, metadata, the tag picker…) belong to that surface, not the
      // global chat shortcuts. Without this, Enter/Backspace while focus sits on
      // a non-input element there (e.g. a color swatch or a tag row) would start
      // a title rename or trash the chat. The dialog is portaled to <body>, so
      // its React `stopPropagation` can't reach this window-level listener —
      // matching on the slot is what keeps the keystroke contained.
      if (
        target instanceof Element &&
        target.closest(
          '[data-slot="popover-content"], [data-slot="dialog-content"]'
        )
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
            tagMode={tagMode.mode}
            onTagModeChange={tagMode.setMode}
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
            onSelect={openChat}
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
            hasPrevious={source.hasPrevious}
            onLoadPrevious={source.loadPrevious}
            selectedIds={selection.selectedIds}
            onToggleSelect={toggleSelect}
            onRangeSelect={rangeSelect}
            onClearSelection={clearSelection}
            onBatchTrash={handleBatchTrash}
            batchTagButton={
              <BatchTagButton
                selectedIds={selection.selectedIds}
                allTags={tagCatalog}
                fetchTagsByChat={fetchTagsByChat}
                onApply={handleBatchTag}
                onCreate={createTag}
              />
            }
            allTags={tagCatalog}
            onAssignTag={(chatId, tagId) => void assignTag(chatId, tagId)}
            onRemoveTag={(chatId, tagId) => void removeTag(chatId, tagId)}
            onCreateTag={createTagForChat}
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
