function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A Message header's absolute stamp: `2026-07-17 14:32`, in the reader's local
 * timezone.
 *
 * Always both date and time, never relative ("2h ago") and never time-only
 * (#192). An archive is read long after the fact, so "14:32" alone is not a
 * fact the reader can place, and the date cannot depend on whether the Chat
 * happens to span midnight — that would make the same Message render
 * differently depending on its neighbours.
 */
export function formatMessageTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
