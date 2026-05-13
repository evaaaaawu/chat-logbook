import crypto from "node:crypto";

export const CROCKFORD_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

const SHORT_CODE_LENGTH = 6;
const MAX_RETRIES = 5;

export interface GenerateShortCodeOptions {
  isTaken: (candidate: string) => boolean;
  randomIndex?: () => number;
}

export function generateShortCode({
  isTaken,
  randomIndex = () => crypto.randomInt(CROCKFORD_ALPHABET.length),
}: GenerateShortCodeOptions): string {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let code = "";
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
      code += CROCKFORD_ALPHABET[randomIndex()];
    }
    if (!isTaken(code)) {
      return code;
    }
  }
  throw new Error(
    `Failed to generate unique short_code after ${MAX_RETRIES + 1} attempts`
  );
}
