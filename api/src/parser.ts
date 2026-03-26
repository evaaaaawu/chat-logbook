import fs from "node:fs";
import path from "node:path";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  timestamp: string;
}

export interface Session {
  id: string;
  title: string;
  project: string;
  createdAt: number;
  updatedAt: number;
}

interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

const COMMAND_PREFIXES = ["/clear", "/init", "/compact", "/help"];

function isCommand(display: string): boolean {
  return COMMAND_PREFIXES.some((cmd) => display.startsWith(cmd));
}

function parseHistoryEntry(raw: unknown): HistoryEntry {
  const obj = raw as Record<string, unknown>;
  return {
    display: typeof obj.display === "string" ? obj.display : "",
    timestamp: typeof obj.timestamp === "number" ? obj.timestamp : 0,
    project: typeof obj.project === "string" ? obj.project : "",
    sessionId: typeof obj.sessionId === "string" ? obj.sessionId : "",
  };
}

export function listSessions(
  claudeDir: string,
  historyFile = "history.jsonl"
): Session[] {
  const historyPath = path.join(claudeDir, historyFile);

  if (!fs.existsSync(historyPath)) {
    return [];
  }

  const content = fs.readFileSync(historyPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  const grouped = new Map<string, HistoryEntry[]>();

  for (const line of lines) {
    const entry = parseHistoryEntry(JSON.parse(line));
    if (!entry.sessionId) continue;
    const entries = grouped.get(entry.sessionId) ?? [];
    entries.push(entry);
    grouped.set(entry.sessionId, entries);
  }

  const sessions: Session[] = [];

  for (const [id, entries] of grouped) {
    const sorted = entries.toSorted((a, b) => a.timestamp - b.timestamp);
    const firstNonCommand = sorted.find(
      (e) => e.display && !isCommand(e.display)
    );
    const title = firstNonCommand?.display || "Untitled";

    sessions.push({
      id,
      title,
      project: sorted[0].project,
      createdAt: sorted[0].timestamp,
      updatedAt: sorted[sorted.length - 1].timestamp,
    });
  }

  return sessions;
}

const CONVERSATION_TYPES = new Set(["user", "assistant"]);

interface RawSessionEntry {
  type: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  isMeta?: boolean;
  isSidechain?: boolean;
  timestamp?: string;
}

export function getSessionMessages(sessionPath: string): Message[] {
  if (!fs.existsSync(sessionPath)) {
    return [];
  }

  const content = fs.readFileSync(sessionPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  const messages: Message[] = [];

  for (const line of lines) {
    const entry: RawSessionEntry = JSON.parse(line);

    if (!CONVERSATION_TYPES.has(entry.type)) continue;
    if (entry.isMeta) continue;
    if (entry.isSidechain) continue;
    if (!entry.message) continue;

    messages.push({
      role: entry.message.role as "user" | "assistant",
      content: entry.message.content,
      timestamp: entry.timestamp ?? "",
    });
  }

  return messages;
}

export function findSessionFile(
  claudeDir: string,
  sessionId: string
): string | null {
  const projectsDir = path.join(claudeDir, "projects");

  if (!fs.existsSync(projectsDir)) {
    return null;
  }

  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true });

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const candidate = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
