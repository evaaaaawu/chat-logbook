# Reading positions anchor to a Message, never to a list index

The conversation pane remembers two positions. One is the scroll spot, kept across visits so reopening a Chat lands where you left it (#239). The other is the Unread divider, kept within a visit so Messages that arrive while you are scrolled up are marked rather than silently mixed in (#189). Both point at "somewhere in this Chat", and the obvious way to say that is an index into the Message array the pane renders.

That array is the wrong thing to index into. It is `allMessages` filtered by `hasRenderableContent` — a turn that renders nothing is dropped so the virtualizer, the divider, and the arrival trackers all count only what you can see — so its indices shift whenever an earlier turn starts or stops rendering. It is also virtualized with estimated heights, so a raw pixel offset means something different on every load depending on measurement order and which rows are open.

**Both positions anchor to a Normalized `message_id` and resolve to an index at render time.** The scroll spot is a `{ messageId, offset }` pair; the Unread divider is a `messageId` that is set once and then frozen. Resolution happens in one place, next to the rule that freezes it, and a position whose Message no longer exists degrades to a defined fallback — landing at the bottom for the scroll spot, no divider for the unread mark — rather than pointing somewhere arbitrary.

This is the same reasoning that already governs Message anchoring elsewhere: `MessageResponse.id` is served as a Message's stable handle precisely so the pane can address a Message without a positional index (ADR-0023, #192), which is what lets Spotlight scroll to an exact Message.

## Amendment: the freeze lasts as long as the Message renders (#271)

"Set once and then frozen" above is unqualified, and implementing it showed it needs one. A divider anchored to a Message that later stops rendering resolves to nothing, and holding that anchor for the rest of the visit would leave the pane unable to mark any later arrival — the same silent failure this decision exists to end. **The freeze therefore lasts as long as the anchored Message still renders**: once it is gone, the next arrival may anchor a new divider.

Two consequences worth naming, because neither follows from the sentence above:

- A pill the reader already dismissed can return. Re-anchoring writes a fresh mark, so `consumed` starts false again. That is the intended reading — the new mark is a new batch, not the old one resurfacing — but it means "consumed" is a property of a mark, not of the visit.
- The batch a divider marks is the run of unseen Messages **at the end of the column**, found from the end. A Message that stopped rendering earlier in the visit and comes back mid-list is not the start of a batch, and scanning from the front would put the divider in front of content already read.

## Considered options

- **Store the array index and freeze it.** What the divider did before this decision. It is correct at the moment it is written and silently wrong afterwards: one earlier turn changing renderability shifts every index beneath it, and the divider ends up in front of a Message the reader has already read. There is no error and no test failure — the marker just moves. The same class of bug reaches the arrival check, where an append is detected by comparing filtered counts, so one Message appearing while another stops rendering reads as "nothing arrived".
- **Store the index but recompute it whenever the Message list changes identity.** Rejected because it contradicts the rule it is meant to serve. The divider is set-once-then-freeze on purpose — it marks where you actually left off, not where the newest Message is — and a recompute has no way to tell a filtering shift from a genuine new arrival. Anchoring by id gets the freeze for free: the anchor cannot drift, because the thing it names does not move.
- **Store a raw `scrollTop`.** Rejected for the scroll spot before this ADR and named here so it is not re-proposed. Estimated heights make a pixel offset unreproducible across loads, and it cannot survive the Chat gaining or losing Messages between visits.
- **Anchor to `source id` rather than the Normalized `message_id`.** Rejected: `source id` identifies the Chat as the Agent recorded it, not a turn within it, and re-normalize is expected to rebuild Normalized rows from Raw. The Normalized `message_id` is stable across a re-normalize and unique within a Chat, which is exactly the guarantee an anchor needs.
