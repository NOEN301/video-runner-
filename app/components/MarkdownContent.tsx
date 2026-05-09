"use client";

import { useEffect, useRef, useState } from "react";

type RenderBlock =
  | { type: "text"; content: string }
  | { type: "code"; lang: string; code: string };

function parseBlocks(text: string): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    blocks.push({ type: "code", lang: match[1] || "plaintext", code: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    blocks.push({ type: "text", content: text.slice(lastIndex) });
  }

  return blocks;
}

const renderableLangs = new Set(["html", "svg", "htm", "xml"]);

function isPreviewable(block: RenderBlock) {
  if (block.type !== "code") return false;
  if (renderableLangs.has(block.lang)) return true;
  if (!block.lang && (block.code.startsWith("<!") || block.code.startsWith("<?xml"))) return true;
  return false;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="copy-btn"
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function CodeBlockView({ block, previewEnabled = true }: { block: { lang: string; code: string }; previewEnabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewable = previewEnabled && isPreviewable({ type: "code", ...block });
  const lines = block.code.split("\n");
  const isLong = lines.length > 6;

  useEffect(() => {
    if (previewOpen && previewFrameRef.current) {
      setTimeout(() => previewFrameRef.current?.focus(), 100);
    }
  }, [previewOpen]);

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{block.lang || "plaintext"}</span>
        <div className="code-header-actions">
          {previewable ? (
            <button
              className={`copy-btn preview-toggle ${previewOpen ? "active" : ""}`}
              type="button"
              onClick={() => setPreviewOpen(!previewOpen)}
            >
              {previewOpen ? "收起预览" : "预览"}
            </button>
          ) : null}
          {isLong ? (
            <button className="copy-btn" type="button" onClick={() => setExpanded(!expanded)}>
              {expanded ? "收起代码" : "展开代码"}
            </button>
          ) : null}
          <CopyButton text={block.code} />
        </div>
      </div>

      {previewOpen ? (
        <iframe
          ref={previewFrameRef}
          className="code-inline-preview"
          sandbox="allow-scripts allow-same-origin"
          srcDoc={block.code}
          title="内联预览"
          tabIndex={0}
        />
      ) : null}

      <pre className={isLong && !expanded ? "code-collapsed" : ""}>
        <code>{block.code}</code>
      </pre>

      {isLong && !expanded ? (
        <div className="code-fade-hint">代码已折叠，点击「展开代码」查看全部</div>
      ) : null}
    </div>
  );
}

type MarkdownContentProps = {
  content: string;
  collapsed?: boolean;
  previewEnabled?: boolean;
};

export default function MarkdownContent({ content, collapsed, previewEnabled }: MarkdownContentProps) {
  const blocks = parseBlocks(content);

  if (blocks.length === 0) {
    return <span>{content}</span>;
  }

  return (
    <div className={`md-content ${collapsed ? "collapsed" : ""}`}>
      {blocks.map((block, index) =>
        block.type === "code" ? (
          <CodeBlockView block={block} key={index} previewEnabled={previewEnabled} />
        ) : (
          <span className="md-text" key={index}>
            {block.content}
          </span>
        )
      )}
    </div>
  );
}

export { isPreviewable };
