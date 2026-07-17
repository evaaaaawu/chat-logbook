# Text actions follow an emphasis hierarchy, not per-action colors

A text action's color comes from its rank in the surface it sits on, not from what the action does. Each surface gets at most one emphasized action in `--primary`; exit actions (`Clear`, `Clear selection`, `Back`) are always quiet in `--card-foreground`; destructive actions take `--destructive` regardless of rank; hover always brightens. The rules themselves live in `docs/DESIGN.md` — this ADR records why they are what they are.

We first framed the rule as color-encodes-direction (forward actions teal, retreating actions gray) and rejected it before commit. Direction gives the same answer as emphasis on the surface that prompted the rule — the batch bar, where `Select all N` and `Clear` sat side by side in the same teal and had to be read to be told apart — but it bends elsewhere: a Toast's Undo is semantically a retreat yet clearly the toast's one emphasized action, and a destructive confirmation's primary action would be "forward" and therefore teal when it must be red. Emphasis handles both without exceptions, and it is the framing Material, Apple HIG, and Polaris readers already know, so future contributors and agents apply it at zero cost.

Quiet actions use `--card-foreground` (Solarized base1) rather than `--muted-foreground`, the codebase's usual neutral, because muted sits at 2.42:1 on the card surface — well under the 4.5:1 WCAG AA floor for small text — while base1 clears it at 4.86:1. Hover brightens (base1 → base2, teal → `--primary-hover`) because the theme is always dark and brighter reads as more active; the previous `hover:text-primary/80` pattern dimmed instead, an artifact of lowering opacity over a dark surface rather than a design choice.

## Consequences

- Adding a text action asks one question — is it this surface's main act, an exit, or destructive — and `docs/DESIGN.md` maps the answer to classes. No per-button color debates.
- The hierarchy governs actions only. `--primary` as a state indicator (active Project, non-default sort, Tag accents, the unread divider) is untouched and out of scope.
- Trade-off, unresolved: `--primary` on dark surfaces is 4.12:1, just under AA. Every state indicator in the app reads that token, so fixing it is a palette-level decision tracked separately rather than smuggled into an action-color rule. Hover reaching 6.41:1 helps whoever already found the link, not whoever is still looking for it.
- Trade-off: a surface with two genuinely coequal candidates for emphasis has no answer here; one of them must be demoted to quiet. So far no surface has needed two.
