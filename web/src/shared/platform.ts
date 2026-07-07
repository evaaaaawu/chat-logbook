// Platform-aware keyboard hint symbols (#179).
//
// Most hint glyphs are universal and render the same on every platform (`⌫`
// Backspace, `↵` Enter, `F2`) — those stay hardcoded at their call sites. Only
// the *primary modifier* differs: macOS shows `⌘`, everywhere else `Ctrl`.
//
// This module is the single place that difference lives. Every Cmd/Ctrl hint
// should route through `modifierHint` so a Windows/Linux user never sees a bare
// `⌘` (e.g. the Undo toast, and future select-all `Cmd/Ctrl+A` in #164/#166).

/**
 * True on macOS, false everywhere else. Detected from the browser's reported
 * platform; falls back to `false` (the Ctrl branch) when the platform is
 * unknown or `navigator` is unavailable. Pass an explicit `nav` in tests to
 * exercise either branch.
 */
export function isMacPlatform(
  nav: Navigator | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator
): boolean {
  return /mac/i.test(nav?.platform ?? "");
}

/**
 * The full keyboard hint for a primary-modifier shortcut: `⌘Z` on macOS,
 * `Ctrl+Z` elsewhere. This is the single entry point for Cmd/Ctrl hints — new
 * shortcuts (e.g. select-all in #164/#166) should call this rather than
 * hardcoding a `⌘`. `isMac` defaults to the detected platform; pass it in tests.
 */
export function modifierHint(
  key: string,
  isMac: boolean = isMacPlatform()
): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}
