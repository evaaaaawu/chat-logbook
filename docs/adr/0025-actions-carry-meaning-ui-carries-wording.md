# Actions carry meaning, the UI carries wording

A `tool_use` block stores an **Action** — one of `edit`, `write`, `read`, `search`, `execute`, `delegate`, `other`, plus what it applied to. The English a reader sees (`Edited`, `Ran`, `Searched for`) is not stored anywhere. Each Plugin maps its own Agent's tool names onto the Action set at normalize time; the frontend maps Actions onto words at render time. Nothing downstream of a Plugin ever sees a tool name.

The line matters because the two halves change for different reasons and at different costs. What a call _did_ is a fact about the archived conversation: it is settled the moment the row is normalized, and re-deciding it means re-normalizing from Raw. What a call is _called_ is a presentation choice: someone may prefer `Executed` to `Ran`, or want the column in another language, and none of that should touch a stored row. Storing the English word would have made a one-word edit a full re-normalize of every chat.

The naming has one visible seam: the kind is `execute` but it renders as `Ran`. `run` was unavailable because **Run** already names the visual grouping of consecutive skim-layer rows, and "four runs inside this Run" is not a sentence worth shipping. The mismatch is the split working rather than an inconsistency in it.

## Considered alternatives

**Keep the mapping in the frontend, keyed on tool names.** This is what shipped before, in two separate tables — one for row labels, one for fold summaries. It contradicts this repo's own promise that "a new Agent plugin ships with zero frontend changes as long as it speaks this vocabulary" (ADR-0023): Codex names its tools `shell` and `apply_patch`, so #35 would have landed with every row falling back to a raw tool name. ADR-0023 had already solved the same problem once for diffs, by keying on the shape of what it found rather than on a list of tool names; the row label simply had not caught up. This ADR closes that gap.

**Store the English verb in Normalized.** Rejected for the reason above: it pins wording into the archive. It also invites the verb and the fold summary's verb to drift, since only one of them would be stored.

**Let `other` fall back to the tool's raw name on screen.** Rejected. MCP tool names are unbounded — they come from whichever servers the reader installed — so `other` is permanent rather than a gap waiting to be filled, and on one real archive it covers about a tenth of all calls. Falling back would have left the machine register on screen for exactly the rows nobody planned for. An MCP call is named after its server instead (`mcp__Claude_Browser__computer` → "Claude Browser"), which loses which tool ran and keeps what a reader can use.

## Consequences

- Changing a verb, or translating the column, is a frontend edit. Changing what a kind _means_ is a re-normalize.
- The Action set is a cross-layer contract and stays small for the same reason the block vocabulary does (ADR-0023): prefer widening a kind over adding one. `fetch` was folded into `read` on those grounds.
- Two densities can group Actions differently without either lying. The row keeps `read` and `search` apart, because a search's object is a pattern and `Read "useMessages"` does not parse; the fold summary merges them, per #199. Grouping is wording, so it lives in the UI.
- `mcp__<server>__<tool>` is parsed by shared code rather than by a Plugin: that structure belongs to MCP, so a second Agent with MCP servers inherits the handling.
- The expanded view picks its renderer from the Action too, closed by #263. It needed one addition to do so: an Action names what happened, and the shell renderer also needs the verbatim command, which the row's own label deliberately is not. That command rides as `action.detail` (ADR-0023). Every renderer choice is now name-free — a diff keys on the result's shape, a file excerpt on `read` plus a path, a shell view on `execute` plus a detail.
