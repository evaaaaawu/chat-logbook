// Overrides for ids the convention below reads wrongly. Empty on purpose: every
// model shipped so far derives correctly from its id, so listing them here would
// be duplicate data that drifts. Add an entry only when a model's written name
// genuinely departs from its id.
const MODEL_DISPLAY_NAMES: Record<string, string> = {};

// Anthropic's id convention: `claude-<family>-<major>[-<minor>][-<snapshot>]`,
// where the snapshot is an 8-digit date. Reading the name out of the shape means
// a new model — or a new dated snapshot of an old one — names itself with no
// maintenance here at all.
const CONVENTIONAL_ID = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-(\d{8}))?$/;

function deriveModelDisplayName(model: string): string | null {
  const match = CONVENTIONAL_ID.exec(model);
  if (!match) return null;

  const [, family, major, minor] = match;
  const name = family.charAt(0).toUpperCase() + family.slice(1);
  return minor === undefined ? `${name} ${major}` : `${name} ${major}.${minor}`;
}

/**
 * The model's name as it is written, read from its id. Three layers, narrowest
 * first: an explicit override, then a name derived from the id convention, and
 * finally the raw id. The last layer is the honest one — an id that fits no
 * known shape names itself rather than being guessed at.
 */
export function getModelDisplayName(model: string): string {
  return MODEL_DISPLAY_NAMES[model] ?? deriveModelDisplayName(model) ?? model;
}
