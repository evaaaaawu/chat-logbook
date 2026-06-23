import { Check } from "lucide-react";
import {
  TAG_COLOR_HEX,
  TAG_COLOR_TOKENS,
  type ColorToken,
} from "@/tags/palette";

interface ColorSwatchesProps {
  value: ColorToken;
  onChange: (color: ColorToken) => void;
}

// The eight-swatch palette picker (ADR-0015), shared by inline create-override
// and the management recolor popover.
export function ColorSwatches({ value, onChange }: ColorSwatchesProps) {
  return (
    <div data-testid="color-swatches" className="flex items-center gap-1.5">
      {TAG_COLOR_TOKENS.map((token) => {
        const selected = token === value;
        return (
          <button
            key={token}
            type="button"
            aria-label={`Color ${token}`}
            aria-pressed={selected}
            onClick={() => onChange(token)}
            className={`flex h-5 w-5 items-center justify-center rounded-full transition-transform hover:scale-110 ${
              selected
                ? "ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover"
                : ""
            }`}
            style={{ backgroundColor: TAG_COLOR_HEX[token] }}
          >
            {selected && (
              <Check size={12} aria-hidden="true" className="text-black/70" />
            )}
          </button>
        );
      })}
    </div>
  );
}
