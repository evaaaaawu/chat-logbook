import { Check, Copy, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Chat } from "@/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getAgentDisplayName } from "@/lib/agentDisplayName";

interface ChatMetadataPopoverProps {
  chat: Chat;
}

const COPIED_FEEDBACK_MS = 1500;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getRelativeTimeLong(ts: number): string {
  const diffMs = Date.now() - ts;
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  if (day > 0) return `${day} ${day === 1 ? "day" : "days"} ago`;
  if (hour > 0) return `${hour} ${hour === 1 ? "hour" : "hours"} ago`;
  if (min > 0) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  return "just now";
}

function TruncatedPath({ value }: { value: string }) {
  return (
    <span title={value} className="block min-w-0 max-w-full truncate">
      {value}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-baseline gap-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-xs text-foreground">{children}</div>
    </div>
  );
}

function PlainField({ label, value }: { label: string; value: ReactNode }) {
  return <Row label={label}>{value}</Row>;
}

function CopyableField({
  label,
  display,
  copyValue,
  copyAriaLabel,
}: {
  label: string;
  display: ReactNode;
  copyValue: string;
  copyAriaLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const [fading, setFading] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );

  const handleCopy = () => {
    void navigator.clipboard.writeText(copyValue);
    setCopied(true);
    setFading(false);
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [
      window.setTimeout(() => setFading(true), COPIED_FEEDBACK_MS - 240),
      window.setTimeout(() => {
        setCopied(false);
        setFading(false);
      }, COPIED_FEEDBACK_MS),
    ];
  };

  return (
    <Row label={label}>
      <div className="group flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">{display}</div>
        {copied && (
          <span
            className={`shrink-0 text-[11px] text-chart-5 transition-opacity duration-200 ${fading ? "opacity-0" : "opacity-100"}`}
            aria-live="polite"
          >
            Copied
          </span>
        )}
        <button
          type="button"
          aria-label={copyAriaLabel}
          onClick={handleCopy}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-white/[0.04] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          {copied ? (
            <Check size={12} aria-hidden="true" />
          ) : (
            <Copy size={12} aria-hidden="true" />
          )}
        </button>
      </div>
    </Row>
  );
}

const EMPTY = <span className="text-muted-foreground">—</span>;

export function ChatMetadataPopover({ chat }: ChatMetadataPopoverProps) {
  const created = formatDateTime(chat.createdAt);
  const updated = formatDateTime(chat.updatedAt);

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Chat info"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Info size={16} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        data-testid="chat-metadata-popover"
        align="end"
        sideOffset={6}
        className="w-80 gap-0 p-0"
      >
        <section className="px-3 py-2">
          <SectionLabel>Time</SectionLabel>
          <PlainField
            label="Created"
            value={
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span>{created}</span>
                <span className="truncate text-muted-foreground">
                  · {getRelativeTimeLong(chat.createdAt)}
                </span>
              </span>
            }
          />
          <PlainField
            label="Updated"
            value={
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span>{updated}</span>
                <span className="truncate text-muted-foreground">
                  · {getRelativeTimeLong(chat.updatedAt)}
                </span>
              </span>
            }
          />
        </section>
        <section className="border-t border-border px-3 py-2">
          <SectionLabel>Origin context</SectionLabel>
          <PlainField
            label="AI Agent"
            value={getAgentDisplayName(chat.agent)}
          />
          {chat.project ? (
            <CopyableField
              label="Project"
              display={<TruncatedPath value={chat.project} />}
              copyValue={chat.project}
              copyAriaLabel="Copy project path"
            />
          ) : (
            <PlainField label="Project" value={EMPTY} />
          )}
        </section>
        <section className="border-t border-border px-3 py-2">
          <SectionLabel>Identifiers & location</SectionLabel>
          <CopyableField
            label="Chat ID"
            display={chat.chatId}
            copyValue={chat.chatId}
            copyAriaLabel="Copy chat id"
          />
          <CopyableField
            label="Source ID"
            display={<TruncatedPath value={chat.id} />}
            copyValue={chat.id}
            copyAriaLabel="Copy source id"
          />
          {chat.sourceFilePath ? (
            <CopyableField
              label="Source path"
              display={<TruncatedPath value={chat.sourceFilePath} />}
              copyValue={chat.sourceFilePath}
              copyAriaLabel="Copy source path"
            />
          ) : (
            <PlainField label="Source path" value={EMPTY} />
          )}
        </section>
      </PopoverContent>
    </Popover>
  );
}
