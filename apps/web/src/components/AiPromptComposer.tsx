"use client";

import { useId, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import {
  OPENAI_MODEL_CATALOG,
  type OpenAiModelId,
} from "@/lib/openai-model-catalog";

const ACCEPTED_FILES = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".csv",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
].join(",");

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Props = {
  locale: "zh" | "en";
  value: string;
  onValueChange: (value: string) => void;
  model: OpenAiModelId;
  onModelChange: (model: OpenAiModelId) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  privacyAttested: boolean;
  onPrivacyAttestedChange: (checked: boolean) => void;
  onSubmit: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  scopeNote?: string;
};

function readableSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AiPromptComposer({
  locale,
  value,
  onValueChange,
  model,
  onModelChange,
  files,
  onFilesChange,
  privacyAttested,
  onPrivacyAttestedChange,
  onSubmit,
  disabled = false,
  sending = false,
  placeholder,
  scopeNote,
}: Props) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const canSubmit = !disabled && !sending && Boolean(value.trim()) && (!files.length || privacyAttested);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const next = [...files];
    let error = "";
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        error = locale === "zh" ? `每次最多上传 ${MAX_FILES} 个文件。` : `Attach up to ${MAX_FILES} files per message.`;
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        error = locale === "zh" ? `${file.name} 超过 10 MB。` : `${file.name} is larger than 10 MB.`;
        continue;
      }
      if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
    }
    setFileError(error);
    onFilesChange(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div
      className="ai-prompt-composer"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!disabled && !sending) addFiles(event.dataTransfer.files);
      }}
    >
      {files.length ? (
        <div className="ai-prompt-attachments" aria-label={locale === "zh" ? "已添加文件" : "Attached files"}>
          {files.map((file) => (
            <span className="ai-prompt-attachment" key={`${file.name}:${file.size}`}>
              <AppIcon name={file.type.startsWith("image/") ? "image" : "file"} size={16} />
              <span><strong>{file.name}</strong><small>{readableSize(file.size)}</small></span>
              <button
                aria-label={`${locale === "zh" ? "移除" : "Remove"} ${file.name}`}
                disabled={disabled || sending}
                onClick={() => onFilesChange(files.filter((item) => item !== file))}
                type="button"
              >
                <AppIcon name="close" size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        aria-label={locale === "zh" ? "与 ChatGPT 共创" : "Co-create with ChatGPT"}
        disabled={disabled || sending}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }
        }}
        placeholder={placeholder ?? (locale === "zh" ? "询问、比较、分析或与 AI 共同撰写…" : "Ask, compare, analyze, or co-write with AI…")}
        rows={3}
        value={value}
      />

      {fileError ? <p className="ai-prompt-error" role="alert">{fileError}</p> : null}
      {files.length ? (
        <label className="ai-prompt-privacy">
          <input
            checked={privacyAttested}
            disabled={disabled || sending}
            onChange={(event) => onPrivacyAttestedChange(event.target.checked)}
            type="checkbox"
          />
          <span>{locale === "zh" ? "我已确认附件完成去标识化，可发送给当前 OpenAI 项目。" : "I confirm these files are de-identified and may be sent to the connected OpenAI project."}</span>
        </label>
      ) : null}

      <footer className="ai-prompt-footer">
        <div className="ai-prompt-tools">
          <input
            accept={ACCEPTED_FILES}
            hidden
            id={inputId}
            multiple
            onChange={(event) => addFiles(event.target.files)}
            ref={fileInput}
            type="file"
          />
          <button
            className="ai-prompt-tool"
            disabled={disabled || sending || files.length >= MAX_FILES}
            onClick={() => fileInput.current?.click()}
            title={locale === "zh" ? "上传 PDF、Word、Excel、文本或图片" : "Upload PDF, Word, Excel, text, or images"}
            type="button"
          >
            <AppIcon name="plus" size={18} />
            <span>{locale === "zh" ? "附件" : "Attach"}</span>
          </button>
          {scopeNote ? <span className="ai-prompt-scope"><AppIcon name="check" size={15} />{scopeNote}</span> : null}
        </div>
        <div className="ai-prompt-actions">
          <label className="ai-model-inline">
            <span className="sr-only">{locale === "zh" ? "选择 GPT 模型" : "Choose GPT model"}</span>
            <select
              disabled={disabled || sending}
              onChange={(event) => onModelChange(event.target.value as OpenAiModelId)}
              value={model}
            >
              {OPENAI_MODEL_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button
            aria-label={sending ? (locale === "zh" ? "分析中" : "Analyzing") : (locale === "zh" ? "发送" : "Send")}
            className="ai-prompt-submit"
            disabled={!canSubmit}
            onClick={onSubmit}
            type="button"
          >
            <AppIcon name={sending ? "sparkles" : "arrow"} size={19} weight="bold" />
          </button>
        </div>
      </footer>
    </div>
  );
}
