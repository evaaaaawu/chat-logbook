/**
 * The DOM id anchoring a rendered Message, derived from its Normalized
 * `message_id`.
 *
 * This is the conversation layout's public contract (#192): Spotlight (#25)
 * scrolls to and highlights an exact Message by resolving this id, without
 * knowing anything about how the pane lays messages out. It is a function, not
 * a documented string format, so both sides can never drift apart.
 *
 * Keyed by message id rather than list position on purpose — positions shift
 * when empty turns are dropped or live messages arrive, and an anchor that
 * moves under a link is not an anchor.
 */
export function messageAnchorId(messageId: string): string {
  // Prefixed so the value is always a valid DOM id, whatever an Agent's
  // message ids look like.
  return `message-${messageId}`;
}
