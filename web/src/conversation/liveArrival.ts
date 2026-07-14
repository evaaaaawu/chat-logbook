// What the conversation pane should do when the live stream appends messages to
// the open chat (issue #189). Kept as a pure decision so the two behaviors —
// follow the latest, or hold the viewport and flag new content — are tested
// directly, and ConversationView only wires the result to the scroll + pill.
//
// - `follow`: pinned to the bottom, so track the newest message (live monitor).
// - `flag`: scrolled up, so leave the viewport put and surface a "new messages"
//   affordance on the down pill instead of yanking the reader down.
// - `none`: the count did not grow (a re-read that changed nothing, or an
//   in-place edit), so nothing moves.
export type ArrivalAction = "follow" | "flag" | "none";

export function deriveArrivalAction({
  appended,
  atBottom,
}: {
  appended: boolean;
  atBottom: boolean;
}): ArrivalAction {
  if (!appended) return "none";
  return atBottom ? "follow" : "flag";
}
