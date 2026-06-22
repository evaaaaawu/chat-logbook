# Tag colors are semantic tokens from a curated palette

A Tag stores a semantic color token (e.g. `violet`), not a raw hex value, chosen from a fixed eight-color palette drawn from the Solarized accent set (yellow, orange, red, magenta, violet, blue, cyan, green). We picked a curated palette over free-form hex so Tags stay visually coherent with the Solarized-dark theme, and so a future theme or palette change is a token→hex remap rather than a data migration of every existing Tag.

## Consequences

- The `tags.color` column holds a token name; rendering resolves token→hex through a single palette map shared by the UI, the chat list, and the Spotlight Tags picker.
- Reusing one color across several Tags is allowed — color is a recognition aid, not an identity. The token vocabulary is closed; adding a ninth color is a deliberate palette change, not user free-form input.
- Trade-off: gives up fully custom per-Tag colors in exchange for theme coherence and migration-free re-theming.
