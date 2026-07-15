import { useState } from "react";
import { Tag as TagIcon } from "lucide-react";
import type { Tag } from "@/types";
import type { ColorToken } from "@/tags/palette";
import { TagPickerDialog, type TagState } from "@/tags/TagPickerDialog";
import { deriveBatchTagStates } from "@/tags/batchTagState";
import {
  batchTagDiff,
  displayStateFor,
  toggleStaged,
  type StagedTagEdits,
} from "@/tags/batchTagStaging";

interface BatchTagButtonProps {
  // The Selection the batch acts over (#161), as wire chat ids.
  selectedIds: ReadonlySet<string>;
  allTags: Tag[];
  fetchTagsByChat: (chatIds: string[]) => Promise<Record<string, Tag[]>>;
  onApply: (
    chatIds: string[],
    diff: { add: string[]; remove: string[] }
  ) => void;
  onCreate: (name: string, color: ColorToken) => Promise<Tag | null>;
}

const EMPTY_STATES: ReadonlyMap<string, TagState> = new Map();

// The batch bar's `Tag` button (#163). Opens the shared TagPickerDialog in
// batch mode: on open it derives each Tag's tri-state across the Selection from
// one grouped read, stages add/remove intents as the user clicks, and on `Done`
// hands the accumulated diff back to the caller to apply in one batch call.
export function BatchTagButton({
  selectedIds,
  allTags,
  fetchTagsByChat,
  onApply,
  onCreate,
}: BatchTagButtonProps) {
  const [open, setOpen] = useState(false);
  const [initialStates, setInitialStates] =
    useState<ReadonlyMap<string, TagState>>(EMPTY_STATES);
  const [staged, setStaged] = useState<StagedTagEdits>(new Map());

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    // Fresh staging each open; pull the tri-state from one grouped query.
    setStaged(new Map());
    setInitialStates(EMPTY_STATES);
    const ids = [...selectedIds];
    void fetchTagsByChat(ids).then((byChat) => {
      setInitialStates(deriveBatchTagStates(ids.length, byChat));
    });
  };

  const handleToggle = (tagId: string) => {
    setStaged((prev) =>
      toggleStaged(prev, initialStates.get(tagId) ?? "none", tagId)
    );
  };

  // Creating a Tag in batch mode mirrors single mode's create-and-assign: the
  // new Tag is staged to add-all so `Done` applies it across the Selection.
  const handleCreate = async (name: string, color: ColorToken) => {
    const created = await onCreate(name, color);
    if (created) {
      setStaged((prev) => {
        const next = new Map(prev);
        next.set(created.id, "all");
        return next;
      });
    }
    return created;
  };

  // The dialog closes itself on `Done` (via its imperative `close()`); this
  // onDone side effect only applies the staged diff in one batch call.
  const handleDone = () => {
    onApply([...selectedIds], batchTagDiff(staged, initialStates));
  };

  return (
    <TagPickerDialog
      title="Tag selected chats"
      tags={allTags}
      open={open}
      onOpenChange={handleOpenChange}
      stateFor={(tagId) => displayStateFor(staged, initialStates, tagId)}
      onToggle={handleToggle}
      onCreate={handleCreate}
      onDone={handleDone}
      doneTestId="batch-tag-done"
      triggerTestId="batch-tag-button"
      triggerAriaLabel="Add/Remove Tag"
      triggerClassName="rounded-l-md border border-white/10 bg-background/60 p-1.5 text-muted-foreground shadow-sm transition-all hover:border-[#2d716a] hover:bg-[#12302e] hover:text-[#2aa198]"
      triggerContent={<TagIcon size={14} aria-hidden="true" />}
    />
  );
}
