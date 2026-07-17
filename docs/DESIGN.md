# Design guidelines

The rules we actually follow, written down as they get decided. Each entry exists because a real change forced the decision — nothing here is aspirational. If a rule and the code disagree, one of them is a bug; fix whichever is wrong rather than living with the gap. Known to be incomplete by design (see ADR-0024 for the first rules' rationale).

## Vocabulary

- **Emphasized action** — the one action a surface most wants you to take. At most one per surface.
- **Quiet action** — every other action on the surface, including all exits: clear, cancel, back, dismiss.
- **Destructive action** — deletes or discards user data. Destructive beats emphasized: a surface whose main act is deletion styles it as destructive, not emphasized.
- **State indicator** — color used to show status (active Project, non-default sort, Tag accents), not to invite a click. Indicators are outside the action hierarchy.

## Rules

### 1. Text actions follow the emphasis hierarchy

| Rank        | Classes                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------- |
| Emphasized  | `text-primary hover:text-primary-hover` (+ `font-medium` when a quiet action sits beside it) |
| Quiet       | `text-card-foreground hover:text-foreground-bright`                                          |
| Destructive | `text-destructive`, hover per the icon-button pattern already in `ChatList`                  |

Never use `--muted-foreground` for an action label: 2.42:1 on the card surface fails AA. It stays reserved for non-interactive supporting text.

Exception: an inline link inside prose (the empty state's "Check Trash…") keeps `text-primary` with `hover:underline` — a color-only hover on a word mid-sentence reads as a typo.

### 2. Hover brightens

The theme is always dark, so brighter means more active. Hover targets are the brighter tokens (`--primary-hover`, `--foreground-bright`). Never dim with opacity (`hover:text-primary/80` and friends) — lowering opacity over a dark surface darkens the text.

### 3. Colors are tokens

New colors enter `web/src/index.css` as a CSS variable wired through `@theme inline`, then get used via the Tailwind utility. No inline hex in components. A palette change must stay a token remap.

### 4. Text contrast clears WCAG AA

Text of any size clears 4.5:1 against the surface it renders on. Measure against the actual surface (`--card` for the batch bar, `--background` for the sidebar), not a guess. Known debt: `--primary` itself sits at 4.12:1 — tracked as a palette-level issue, don't fix it per-button.

## Tokens

The action-facing subset of `web/src/index.css` (Solarized dark):

| Token                 | Value     | Role                                     |
| --------------------- | --------- | ---------------------------------------- |
| `--primary`           | `#2aa198` | Emphasized actions, state indicators     |
| `--primary-hover`     | `#35cabf` | Emphasized hover (cyan at 50% lightness) |
| `--card-foreground`   | `#93a1a1` | Quiet actions, card body text (base1)    |
| `--foreground-bright` | `#eee8d5` | Quiet hover (base2)                      |
| `--muted-foreground`  | `#586e75` | Non-interactive supporting text only     |
| `--destructive`       | `#dc322f` | Destructive actions                      |

## Verifying style changes

`hover:` utilities exist only after Tailwind builds. Type checks and jsdom tests pass whether or not a utility name is real, so a typo fails silently with everything green. Verify with `pnpm build` plus a grep of the emitted CSS, then hover in a live browser. The in-app browser's CDP does not raise `:hover`; use Playwright.
