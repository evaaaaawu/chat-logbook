# chat-logbook

chat-logbook is a local-first library for your AI assistant conversations: it reads what AI tools write on your machine, keeps its own durable copy, and presents everything as one browsable, searchable history. This glossary fixes the words we use for that domain so code, docs, UI, and AI agents all mean the same thing.

## Language

### Stores

**Source**:
The vendor-controlled, read-only original conversation data on your machine (`~/.claude/`, `~/.codex/`, …). May be cleaned up by the vendor at any time; chat-logbook never writes to it.
_Avoid_: source files, the live copy

**Archive**:
chat-logbook's own durable copy of conversations, derived from Source. Once a vendor cleans up Source, the Archive is the only remaining copy, so it is never deleted except by an explicit Purge.
_Avoid_: backup, cache, snapshot

**Metadata**:
The user-added layer about a Chat — custom title, tags, notes, highlights, visibility flags. Owned by you, keyed to the internal Chat id, kept separate from the Archive.
_Avoid_: data (as a store name), annotations (as the umbrella term), user data

**Index**:
The search index derived from the Archive. Freely rebuildable — destroying and recreating it never risks your data.
_Avoid_: cache, search cache

**Checkpoint**:
The ingestion progress watermark derived from Source — how far each Source file has been scanned, so the next Scan can skip unchanged files. Freely rebuildable: losing it costs one full re-scan, never any data. Not backed up.
_Avoid_: scan state, sync state, cursor

**ChatReader**:
The Chat read face — at read time it composes Archive + Metadata into the outward Chat/Message shapes the API serves. A read-time derivation, not a materialized store.
_Avoid_: chat store, view model

### The conversation

**Chat**:
One conversation with an AI assistant — the core unit chat-logbook lists, shows, and searches.
_Avoid_: session, thread, conversation

**Title**:
The name shown for a Chat. The effective Title is the custom title if set, else the first user message's first line, else `"Untitled"` — so it is never empty. The custom title lives in Metadata; the fallback is derived from the Archive.
_Avoid_: name, subject, heading

**Message**:
A single turn within a Chat, from the user or the assistant. Composed of one or more Blocks.
_Avoid_: entry, line

**Block**:
A typed piece of a Message's content: text, thinking, tool call, or tool result. A Message is an ordered sequence of Blocks, and a Block's type decides how it renders (thinking and tool blocks collapse by default).
_Avoid_: segment, part, chunk

**chat id**:
The short, user-facing id for a Chat that you can paste anywhere and any agent can pattern-match. The code field is `chat_id`; the wire form is `clog_` + 6 Crockford base-32 characters (e.g. `clog_a3f7kx`).
_Avoid_: short_code, slug, code

**source id**:
The id the originating Agent gave the conversation, recorded on Raw rows. The code field is `source_id`.
_Avoid_: source_session_id, session_id

**Project**:
The working directory a Chat belongs to. (chat-logbook itself is never "the project" in domain prose — that word is reserved for the user's working directory.)
_Avoid_: workspace, repo, folder

**Tag**:
A user-created label, with a name and a color, that you attach to any number of Chats to categorize them your own way. A Chat may carry many Tags; a Tag may be on many Chats. Lives in Metadata, so it never touches the Archive.
_Avoid_: label, category, folder, keyword

### Raw vs normalized

**Raw**:
The verbatim record exactly as the Agent wrote it, preserved untouched. Not rebuildable, so never discarded.
_Avoid_: payload (as the noun for the record), source copy

**Normalized**:
The standardized form of a Message that the rest of chat-logbook reads. Rebuildable from Raw, so parser fixes are a re-ingest, not a migration.
_Avoid_: canonical, parsed, cooked, processed

### Agents & plugins

**Agent**:
An AI assistant tool whose conversations chat-logbook reads (Claude Code, Codex, Aider, OpenCode). This is the internal/code term; user-facing copy says "AI assistant".
_Avoid_: vendor, provider

**Plugin**:
The per-Agent adapter that knows one Agent's format and does three things: discover, extract, normalize. The ingestion pipeline itself stays Agent-agnostic.
_Avoid_: parser, connector, driver, adapter (in prose)

### Ingestion & lifecycle

**Ingestion**:
Reading new content from Source into the Archive. Runs as a Scan when the app opens and as a live Watcher while it runs.
_Avoid_: import, sync, indexing

**Trash**:
Hiding a Chat from your view. Reversible, and never touches the Archive.
_Avoid_: delete, remove, soft-delete (in prose)

**Purge**:
Permanently deleting a Chat from the Archive. The only action that ever deletes Archive rows — irreversible, and always confirmed.
_Avoid_: delete, hard-delete (in prose), wipe

**Visibility**:
Whether a Chat appears, decided at read time from Metadata — never by changing the Archive or the Index.
_Avoid_: filtering, access

### Selection

**Selection**:
The set of Chats the user has marked in the Chat list to act on together — the target of a batch action. The **Open Chat** is its primary member: a plain click makes a Chat the sole Selection, and modifier-clicks (`Cmd/Ctrl+click` to toggle, `Shift+click` for a range) extend it. When the Selection holds a single Chat it _is_ just the Open Chat and no batch UI shows; the floating batch bar appears only at two or more. An id set, so it survives a sort change and a background refresh and clears on a filter change or view switch.
_Avoid_: selected chat (ambiguous with Open Chat), checked, highlighted

**Open Chat**:
The primary member of the Selection — the single Chat whose content the reading pane shows, chosen by a plain click on a row's body or a keyboard move (never a modifier-click). When the Selection holds several Chats, the Open Chat is the one still shown in the pane; the rest are marked but not shown. Deselecting the Open Chat moves the primary to the nearest remaining member.
_Avoid_: active chat, current chat, selected chat

**Cursor**:
The row keyboard navigation currently rests on, shown with a focus ring. Arrow keys move the Cursor; on a plain arrow it also becomes the Open Chat and the anchor for range selection, but during a `Shift`+arrow range paint the Cursor moves without changing the Open Chat. Distinct from both the Open Chat and the Selection.
_Avoid_: focus, active row, highlighted row

### Views

**Focus View**:
The single-Chat reading page a Chat's own URL opens — the conversation alone, with no list or filter panels. Reached by double-clicking a row, the row's context menu, or Copy link; built for bookmarking a Chat and comparing several side by side. The full app stays at the root address and never encodes the Open Chat in its URL.
_Avoid_: detail page, standalone view, popup, chat page

**Spotlight**:
The overlay search surface — one input, opened with `/` or `⌘K` (Ctrl+K elsewhere), that finds Chats, Messages, Tags, and Projects and takes you there. `Enter` always means "take me there": it opens or replaces, never narrows in place (`⌘Enter` appends a Tag/Project to the current filter instead). The app's primary navigation surface, not a filter control.
_Avoid_: search box, command palette, quick open, filter box

**Demo**:
The hosted, install-free form of the app that ships with sample Chats instead of reading your machine. Exists so someone can try the product from a plain URL; nothing of yours ever reaches it, and real use stays local.
_Avoid_: cloud version, web version, hosted app

### List ordering

**Frozen order**:
The Chat list holds its existing row order across a background refresh — existing rows never move, and only a newly-appearing Chat slots into its sorted position. The order re-sorts only on a user action: changing the sort, switching view (Chat list ⇄ Trash), or a Trash/Restore. Owned by the `useChatOrder` hook per view.
_Avoid_: pinned order, locked order, sticky sort

### List counts

**Facet count**:
The number beside each Project and each Tag in the filter panel — how many Chats in the current view (Chat list or Trash) carry that Project/Tag. It counts the view's whole universe and does **not** change when you select a filter: selecting a Tag never moves the numbers.
_Avoid_: result count, filtered count

**List count**:
The total in the Chat list header ("Chats N") — how many Chats are currently listed. It reflects the active Project/Tag filter, so it is the post-filter result count, not the view's universe.
_Avoid_: facet count, total (unqualified)

## Flagged ambiguities

- **Chat, not session.** "Chat" is canonical since the v0.8.0 rename. "session" still lingers in `docs/PRD.md` — that is term debt to repay, not an alias to keep. Use "session" only when you mean the _Agent's own_ unit (which is why the field is `source id`, once `source_session_id`).
- **Agent (code) vs "AI assistant" (copy).** "Agent" is the internal domain term — the thing an `AgentPlugin` reads. User-facing copy stays "AI assistant"; don't push "Agent" into product copy.
- **"delete" is banned on its own.** There are two deletions: **Trash** (soft, reversible, Metadata-only) and **Purge** (hard, irreversible, Archive). Always say which.
- **Three ids, never just "id".** `chat id` (short, public) vs the internal id (UUID, never shown) vs `source id` (the Agent's). Name which one.
- **"Stores" and "repos" are different axes.** Five _stores_ (Source, Archive, Metadata, Index, Checkpoint) is not the three _repos_ (`chat-logbook`, `chat-logbook-sync`, `chat-logbook-docs`). Don't let the store count and "three" collide in conversation.
- **Checkpoint is not Index.** Both are rebuildable, but Index derives from Archive (rebuild on tokenizer/schema change) and Checkpoint derives from Source (rebuild = a full re-scan). They live in separate stores so rebuilding one never forces rebuilding the other.

## Example dialogue

> **Dev:** A user deleted a conversation in Claude Code and it vanished from their `~/.claude/`. Do we drop it from our list?
> **Maintainer:** No. That's a Source deletion. The Archive keeps it — Source disappearing is exactly what the Archive exists to survive.
> **Dev:** So it still shows up?
> **Maintainer:** Right, unless the user themselves Trashed it. Trash is a Visibility flag in Metadata; it hides the Chat but doesn't touch the Archive. They can restore it.
> **Dev:** And if they really want it gone?
> **Maintainer:** Then they Purge it — the one action that deletes Archive rows, with a confirmation. After that it's gone for good; even re-ingestion won't bring it back, because Source is already gone too.
> **Dev:** Got it. And to reference this Chat in an issue?
> **Maintainer:** Use its `chat id` — the `clog_…` one. Not the internal UUID, and not the Agent's source id.
