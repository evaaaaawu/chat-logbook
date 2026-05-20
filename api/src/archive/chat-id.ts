import crypto from "node:crypto";

export const CROCKFORD_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

const CHAT_ID_LENGTH = 6;
const MAX_RETRIES = 5;

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
