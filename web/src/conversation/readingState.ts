/**
 * Where the reader left a Chat: the scroll position, as a message anchor, and
 * which skim-layer rows they had opened. Persisted per chat so reopening lands
 * where it was last read rather than always at the bottom (#239).
 *
 * This is reading state, not something authored about a chat, so it lives in
 * the browser rather than the Metadata store: losing it costs one landing at
 * the bottom. Writes are bounded to the most recently read chats.
 */
export interface ScrollAnchor {
  /** Normalized message id of the topmost visible Message. */
  messageId: string;
  /** Pixels scrolled past that Message's top edge. */
  offset: number;
}

export interface ReadingState {
  /** null when nothing worth anchoring was recorded (e.g. pinned at bottom). */
  anchor: ScrollAnchor | null;
  /** Row keys (messageId:blockIndex, or a fold id) the reader had opened. */
  openRows: readonly string[];
}

const STORAGE_KEY = "chat-logbook.reading-state";
const STORAGE_VERSION = 1;

/**
 * How many recently-read chats keep their reading state. Each entry is tiny, so
 * this is generous enough to cover "chats I've been reading" while staying well
 * inside a browser's localStorage budget. Past it, the least-recently-written
 * chat is dropped — reopening it lands at the bottom, as a first visit would.
 */
export const READING_STATE_LIMIT = 50;

interface StoredEntry extends ReadingState {
  chatId: string;
}

interface StoredPayload {
  version: number;
  /** Most-recently-written first, so the tail is what eviction drops. */
  chats: StoredEntry[];
}

function readPayload(): StoredPayload {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return { version: STORAGE_VERSION, chats: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { version: STORAGE_VERSION, chats: [] };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { version: STORAGE_VERSION, chats: [] };
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== STORAGE_VERSION || !Array.isArray(record.chats)) {
    return { version: STORAGE_VERSION, chats: [] };
  }
  return { version: STORAGE_VERSION, chats: record.chats as StoredEntry[] };
}

export function loadReadingState(chatId: string): ReadingState | null {
  const entry = readPayload().chats.find((c) => c.chatId === chatId);
  if (!entry) return null;
  return { anchor: entry.anchor, openRows: entry.openRows };
}

export function saveReadingState(chatId: string, state: ReadingState): void {
  const previous = readPayload().chats.filter((c) => c.chatId !== chatId);
  const chats: StoredEntry[] = [{ chatId, ...state }, ...previous].slice(
    0,
    READING_STATE_LIMIT
  );
  const payload: StoredPayload = { version: STORAGE_VERSION, chats };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
