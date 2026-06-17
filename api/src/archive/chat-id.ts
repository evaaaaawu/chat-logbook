import crypto from "node:crypto";

export const CROCKFORD_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

const CHAT_ID_LENGTH = 6;
const MAX_RETRIES = 5;

/** Wire-form prefix that makes a chat id paste-anywhere pattern-matchable. */
export const CHAT_ID_PREFIX = "clog_";

const WIRE_FORM_RE = new RegExp(
  `^${CHAT_ID_PREFIX}[${CROCKFORD_ALPHABET}]{${CHAT_ID_LENGTH}}$`
);

/** Render a stored bare chat_id code into its public wire form. */
export function formatChatId(code: string): string {
  return `${CHAT_ID_PREFIX}${code}`;
}

/**
 * Parse a public wire-form chat id back to its bare code, or null when the
 * input is not a well-formed `clog_` + 6 Crockford characters. Strict: a bare
 * code, wrong length, or out-of-alphabet character all parse to null so the
 * caller can collapse them into the same 404 path.
 */
export function parseChatId(wire: string): string | null {
  if (!WIRE_FORM_RE.test(wire)) return null;
  return wire.slice(CHAT_ID_PREFIX.length);
}

export interface GenerateChatIdOptions {
  isTaken: (candidate: string) => boolean;
  randomIndex?: () => number;
}

export function generateChatId({
  isTaken,
  randomIndex = () => crypto.randomInt(CROCKFORD_ALPHABET.length),
}: GenerateChatIdOptions): string {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let code = "";
    for (let i = 0; i < CHAT_ID_LENGTH; i++) {
      code += CROCKFORD_ALPHABET[randomIndex()];
    }
    if (!isTaken(code)) {
      return code;
    }
  }
  throw new Error(
    `Failed to generate unique chat_id after ${MAX_RETRIES + 1} attempts`
  );
}
