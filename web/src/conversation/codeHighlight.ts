import { useEffect, useMemo, useState } from "react";
import type { HLJSApi } from "highlight.js";

/**
 * Map a file extension to a highlight.js language id.
 *
 * Only the common set is registered (see `loadHighlighter`), so this maps to
 * ids that set is known to carry. An extension not listed here resolves to
 * `null`, and the caller renders the diff plain — the same as today for a file
 * whose language we do not recognise (#240).
 */
const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "xml",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  sql: "sql",
  diff: "diff",
  dockerfile: "dockerfile",
};

/**
 * The highlight.js language for a path, or `null` when its extension is not one
 * we highlight. Pure, so the mapping is testable without loading the
 * highlighter — and a `null` result lets the view skip the load entirely.
 */
export function languageForPath(path: string): string | null {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  const ext = dot === -1 ? name : name.slice(dot + 1);
  return EXTENSION_LANGUAGE[ext.toLowerCase()] ?? null;
}

// Cached so the highlighter is fetched at most once per session, on whichever
// code view opens first. Chats that open none never touch this promise, so they
// never pay for the highlighter (#240).
let highlighterPromise: Promise<HLJSApi> | null = null;

/**
 * Load the highlighter, lazily. The common-language bundle is imported on first
 * call and reused thereafter, so it is code-split out of the initial load and
 * fetched only when some code view is first expanded.
 */
export function loadHighlighter(): Promise<HLJSApi> {
  if (!highlighterPromise) {
    highlighterPromise = import("highlight.js/lib/common").then(
      (module) => module.default
    );
  }
  return highlighterPromise;
}

/**
 * A highlighter for one file's lines, or `null` while it cannot colour them.
 *
 * `null` covers both cases a view renders plain: a path whose language we do
 * not recognise — where the highlighter is never even loaded — and the moment
 * before the lazy load resolves. Callers render `line.text` then, so code is
 * always readable and highlighting only ever arrives as an improvement.
 *
 * Highlighting a line at a time drops multi-line context (a string opened on
 * one line and closed on the next), which is the trade both a diff and a read
 * excerpt already make: neither is guaranteed to hold a whole file, and it
 * keeps each line's markup independent of its neighbours.
 */
export function useHighlighter(
  filePath: string
): ((text: string) => string) | null {
  const language = useMemo(() => languageForPath(filePath), [filePath]);
  const [hljs, setHljs] = useState<HLJSApi | null>(null);

  useEffect(() => {
    if (!language) return;
    let active = true;
    loadHighlighter().then((loaded) => {
      if (active) setHljs(loaded);
    });
    return () => {
      active = false;
    };
  }, [language]);

  return useMemo(() => {
    if (!language || !hljs) return null;
    return (text: string) =>
      hljs.highlight(text, { language, ignoreIllegals: true }).value;
  }, [language, hljs]);
}
