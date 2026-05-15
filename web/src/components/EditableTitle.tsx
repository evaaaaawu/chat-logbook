import { useEffect, useRef, type KeyboardEvent } from "react";

interface EditableTitleProps {
  value: string;
  editing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onSave: (next: string) => void;
  displayClassName?: string;
  inputClassName?: string;
  inputAriaLabel?: string;
  onDisplayClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
}

export function EditableTitle({
  value,
  editing,
  onEditStart,
  onEditEnd,
  onSave,
  displayClassName,
  inputClassName,
  inputAriaLabel = "Session title",
  onDisplayClick,
}: EditableTitleProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const next = inputRef.current?.value ?? value;
    onEditEnd();
    if (next !== value) onSave(next);
  };

  const cancel = () => {
    cancelledRef.current = true;
    onEditEnd();
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else {
      e.stopPropagation();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label={inputAriaLabel}
        defaultValue={value}
        maxLength={200}
        onKeyDown={handleKey}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        className={inputClassName}
      />
    );
  }

  return (
    <span
      onClick={(e) => {
        onDisplayClick?.(e);
        if (e.defaultPrevented) return;
        onEditStart();
      }}
      className={displayClassName}
    >
      {value}
    </span>
  );
}
