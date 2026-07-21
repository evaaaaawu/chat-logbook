import Markdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import type { Element, ElementContent } from "hast";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { CopyButton } from "@/shared/CopyButton";
import { FileChip } from "@/conversation/FileChip";

// The code as written, read off the syntax tree rather than the rendered
// output: highlighting has already wrapped keywords in spans by the time this
// renders, and what the reader takes away has to paste back into a file.
function nodeText(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(nodeText).join("");
  return "";
}

// The closing fence leaves one trailing newline: markdown's punctuation, not
// part of the code.
function codeSource(node: Element | undefined): string {
  if (!node) return "";
  return node.children.map(nodeText).join("").replace(/\n$/, "");
}

const markdownComponents: Components = {
  a: ({ children, ...props }) => {
    // The frontend's one generic rule: a file link renders as a chip. The
    // Agent's own mention syntax was already translated into this link at
    // normalize time, so the renderer never learns any Agent's markup
    // (ADR-0023).
    if (props.href?.startsWith("file://")) {
      return <FileChip href={props.href} />;
    }
    return (
      <a {...props} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props}>{children}</table>
    </div>
  ),
  // Only fenced blocks get a copy button — inline code is a word inside a
  // sentence, not something to take away. `group` scopes the hover reveal to
  // this block, so one button appears at a time.
  pre: ({ children, node, ...props }) => (
    <div className="group relative">
      <pre {...props}>{children}</pre>
      <CopyButton
        value={codeSource(node)}
        label="Copy code"
        className="absolute right-2 top-2 bg-[#002b36]/80"
      />
    </div>
  ),
};

// prose-sm keeps chat turns tighter than prose's article-scale defaults.
// The margin overrides pull paragraphs and lists closer for conversation
// density. overflow-wrap:anywhere lets unbroken strings (paths, ids) break so
// they can never blow out the pane; `pre` keeps `white-space: pre` so code
// lines scroll horizontally instead of wrapping.
//
// Code blocks are left to the highlight.js solarized-dark theme: prose's `pre`
// background and padding are cleared so the `.hljs` surface (bg #002b36, 1em
// padding) is the only frame — no double box. Font size is set once on `pre`
// (its `code` child inherits); inline code is sized via a :not(pre) selector so
// the two never compound.
const PROSE_CLASS =
  "prose prose-sm prose-invert max-w-none [overflow-wrap:anywhere] " +
  "prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 " +
  "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 " +
  "prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-3 prose-pre:text-[0.875em] " +
  "[&_pre_code]:text-[1em] [&_:not(pre)>code]:text-[0.875em]";

export function MarkdownText({ children }: { children: string }) {
  return (
    <div className={PROSE_CLASS}>
      <Markdown
        // remark-breaks renders a single newline as a line break. A logged turn
        // is something a person typed with Enter, not an article written to
        // markdown's blank-line paragraph rule — folding those newlines into
        // spaces silently reflows what they actually wrote. Structure (lists,
        // tables, code) still parses normally.
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
        // react-markdown drops `file:` URLs by default, as a defence against
        // links a page might navigate to. These never navigate — the chip
        // copies the path instead — so the URL has to survive to be read.
        urlTransform={(url) =>
          url.startsWith("file://") ? url : defaultUrlTransform(url)
        }
        components={markdownComponents}
      >
        {children}
      </Markdown>
    </div>
  );
}
