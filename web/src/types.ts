/**
 * The API's response shapes under the names the web app uses. Each one is
 * derived from the server's own type (`@wire`, api/src/wire-types.ts) rather
 * than declared here, so the two sides cannot drift: a field the server adds or
 * changes shows up in this app's type check. `api/parse.ts` proves a body
 * matches these types before any hook sees it (ADR-0027).
 */
import type { ApiContentBlock, ChatResponse, MessageResponse } from "@wire";

export type { Action, ActionKind, ActionObject, PatchHunk, Tag } from "@wire";

export type Chat = ChatResponse;

export type ContentBlock = ApiContentBlock;

export type Message = MessageResponse;
