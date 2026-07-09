import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props}>{children}</table>
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
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownComponents}
      >
        {children}
      </Markdown>
    </div>
  );
}
