# Chat URLs open a Focus View; the app shell stays at `/`

We want per-Chat deep links: bookmark a specific Chat and open several Chats in separate tabs to compare them. The `chat id` (`clog_` + 6 Crockford base-32 chars, [ADR-0009](0009-two-ids-per-chat.md)) was designed to be surfaced in URLs, so the identifier already exists — the decision is what a Chat's URL _renders_.

`/chats/<chat id>` renders a **Focus View**: the conversation pane alone, with no list or filter panels. The full three-pane app stays at `/`, and in-app navigation (clicking rows, moving the Cursor) never writes the open Chat into the URL. Deep links are minted explicitly — double-click on a row, the row's context menu ("Open in new tab"), or a Copy link button in the conversation pane header. The URL carries Chat identity only: no Trash view, no filter, no sort state. An unknown, Trashed, or Purged `chat id` renders a not-found state in place (with a link back to `/`), never a silent redirect.

## Considered options

- **`/chats/:id` opens the full app with that Chat selected, URL synced to the Open Chat.** The common SPA pattern. Rejected for two reasons. (1) History pollution: a plain arrow key changes the Open Chat (see Cursor in `CONTEXT.md`), so URL sync forces a push-vs-replace split between mouse and keyboard navigation to keep Back usable. (2) It is worse for the stated need: comparing Chats in side-by-side tabs duplicates the list and filter panels in every tab, wasting most of each window. Gmail's message pop-out and Figma's file URLs follow the content-only pattern chosen here.
- **Make rows real anchors so `Cmd+click` opens a new tab.** Rejected: `Cmd/Ctrl+click` is already the Selection toggle (`CONTEXT.md`, and the batch-action set #159–#166 builds on it). The browser convention loses; new-tab opening lives on double-click and the context menu instead.
- **Hash or query-string URLs (`/#/chats/:id`, `/?chat=`).** Rejected: the `chat id` is a public resource identifier by design; a path is its natural form. The server adds an SPA fallback for non-`/api` routes.
