import type { ColorToken } from "./tag-colors.js";

/**
 * A Tag as Metadata holds it and the API serves it. Kept apart from the
 * repository, which imports Node, so the wire contract can reach it.
 */
export interface Tag {
  id: string;
  name: string;
  color: ColorToken;
}
