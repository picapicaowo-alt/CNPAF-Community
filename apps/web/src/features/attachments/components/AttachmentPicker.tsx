"use client";

import {
  attachmentKindForMime,
  documentAttachmentAccept,
  formatAttachmentBytes,
} from "@cnpaf/shared";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

const choices: Array<{
  accept: string;
  capture?: boolean | "environment";
  icon: AppIconName;
  kind: "image" | "audio" | "video" | "document";
  labelEn: string;
  labelZh: string;
}> = [
  {
    accept: "image/*",
    icon: "image",
    kind: "image",
    labelEn: "Photo or image",
    labelZh: "照片或图片",
  },
  {
    accept: "audio/*",
    capture: true,
    icon: "audio",
    kind: "audio",
    labelEn: "Voice or audio",
    labelZh: "语音或音频",
  },
  {
    accept: "video/*",
    capture: "environment",
    icon: "video",
    kind: "video",
    labelEn: "Record or add video",
    labelZh: "拍摄或添加视频",
  },
  {
    accept: documentAttachmentAccept,
    icon: "file",
    kind: "document",
    labelEn: "Document or file",
    labelZh: "文档或文件",
  },
];

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function AttachmentPicker({
  disabled = false,
  files,
  locale,
  onChange,
}: {
  disabled?: boolean;
  files: File[];
  locale: "zh" | "en";
  onChange: (files: File[]) => void;
}) {
  function append(nextFiles: File[]) {
    const unique = new Map(files.map((file) => [fileKey(file), file]));
    for (const file of nextFiles) unique.set(fileKey(file), file);
    onChange([...unique.values()]);
  }

  return (
    <div className="attachment-picker stack-sm">
      <div className="attachment-picker-options">
        {choices.map((choice) => (
          <label className="attachment-picker-option" key={choice.kind}>
            <span className={`attachment-kind-icon attachment-kind-${choice.kind}`}>
              <AppIcon name={choice.icon} />
            </span>
            <span>{locale === "zh" ? choice.labelZh : choice.labelEn}</span>
            <input
              accept={choice.accept}
              capture={choice.capture}
              disabled={disabled}
              multiple
              onChange={(event) => {
                append(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
              type="file"
            />
          </label>
        ))}
      </div>
      {files.length ? (
        <ul className="attachment-file-list" aria-label={locale === "zh" ? "待上传附件" : "Attachments to upload"}>
          {files.map((file) => {
            const kind = attachmentKindForMime(file.type);
            const icon: AppIconName = kind === "document" ? "file" : kind;
            return (
              <li key={fileKey(file)}>
                <span className={`attachment-kind-icon attachment-kind-${kind}`}>
                  <AppIcon name={icon} />
                </span>
                <span className="attachment-file-copy">
                  <strong>{file.name}</strong>
                  <span>{formatAttachmentBytes(file.size)}</span>
                </span>
                <button
                  aria-label={locale === "zh" ? `移除 ${file.name}` : `Remove ${file.name}`}
                  className="icon-button"
                  onClick={() => onChange(files.filter((item) => fileKey(item) !== fileKey(file)))}
                  type="button"
                >
                  <AppIcon name="close" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
