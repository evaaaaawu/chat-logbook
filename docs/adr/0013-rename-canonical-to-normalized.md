# Rename the canonical message layer to "normalized"

The glossary names the standardized Message layer **Normalized** — it pairs with **Raw** and matches the existing `normalize()` verb. The code type is still `CanonicalMessage`. Rename the type and related identifiers to use "normalized" so the noun matches the verb and the glossary, and "canonical" stops being a second word for the same thing.

This is an internal code rename with no on-disk or API-shape impact — a mechanical refactor.
