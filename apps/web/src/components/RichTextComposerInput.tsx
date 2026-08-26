"use client";

import { useEffect, useRef } from "react";

type Props = {
  ariaLabel: string;
  disabled: boolean;
  onSubmit: () => void;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
};

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const content = Array.from(node.childNodes).map(nodeToMarkdown).join("");
  switch (node.tagName) {
    case "STRONG":
    case "B":
      return `**${content}**`;
    case "EM":
    case "I":
      return `*${content}*`;
    case "CODE":
      return `\`${content}\``;
    case "BR":
      return "\n";
    case "DIV":
    case "P":
      return `${content}\n`;
    default:
      return content;
  }
}

function editorMarkdown(element: HTMLElement) {
  return Array.from(element.childNodes)
    .map(nodeToMarkdown)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n$/, "");
}

function escaped(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdownHtml(value: string) {
  return escaped(value)
    .replace(/\*\*([^\n*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^\n_]+)__/g, "<strong>$1</strong>")
    .replace(/`([^\n`]+)`/g, "<code>$1</code>")
    .replace(/(^|[^*])\*([^\n*]+)\*/g, "$1<em>$2</em>")
    .replaceAll("\n", "<br>");
}

function insertFragmentAtSelection(html: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/** A small, dependency-free WYSIWYG surface for the Markdown we support in chat. */
export function RichTextComposerInput({
  ariaLabel,
  disabled,
  onSubmit,
  onValueChange,
  placeholder,
  value,
}: Props) {
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value && editor.current?.textContent) editor.current.replaceChildren();
  }, [value]);

  function sync() {
    if (editor.current) onValueChange(editorMarkdown(editor.current));
  }

  return (
    <div
      aria-label={ariaLabel}
      aria-multiline="true"
      className="ai-rich-input"
      contentEditable={!disabled}
      data-placeholder={placeholder}
      onInput={sync}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        insertFragmentAtSelection(inlineMarkdownHtml(text));
        sync();
      }}
      ref={editor}
      role="textbox"
      suppressContentEditableWarning
    />
  );
}
