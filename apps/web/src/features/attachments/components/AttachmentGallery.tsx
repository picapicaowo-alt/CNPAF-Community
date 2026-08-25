"use client";

import Image from "next/image";
import type { AttachmentSummary } from "@cnpaf/shared";
import { formatAttachmentBytes } from "@cnpaf/shared";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { StatusPill } from "@/components/ui";

function iconFor(kind: AttachmentSummary["kind"]): AppIconName {
  return kind === "document" ? "file" : kind;
}

function labelFor(kind: AttachmentSummary["kind"], locale: "zh" | "en") {
  const labels = {
    image: { zh: "图片", en: "Image" },
    audio: { zh: "音频", en: "Audio" },
    video: { zh: "视频", en: "Video" },
    document: { zh: "文件", en: "File" },
  } as const;
  return labels[kind][locale];
}

export function AttachmentGallery({
  attachments,
  compact = false,
  locale,
}: {
  attachments: AttachmentSummary[];
  compact?: boolean;
  locale: "zh" | "en";
}) {
  if (!attachments.length) return null;

  if (compact) {
    return (
      <div className="attachment-compact-list">
        {attachments.map((attachment) => (
          <a
            aria-label={`${labelFor(attachment.kind, locale)}: ${attachment.originalName}`}
            className="attachment-compact-link"
            href={attachment.url}
            key={attachment.id}
            rel="noreferrer"
            target="_blank"
            title={attachment.originalName}
          >
            <AppIcon name={iconFor(attachment.kind)} />
            <span>{attachment.originalName}</span>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="attachment-gallery">
      {attachments.map((attachment) => (
        <article className="attachment-card" key={attachment.id}>
          <div className="attachment-preview">
            {attachment.kind === "image" && attachment.url ? (
              <a href={attachment.url} rel="noreferrer" target="_blank">
                <Image
                  alt={attachment.originalName}
                  height={320}
                  sizes="(max-width: 760px) 100vw, 320px"
                  src={attachment.url}
                  unoptimized
                  width={480}
                />
              </a>
            ) : attachment.kind === "audio" && attachment.url ? (
              <audio controls preload="metadata" src={attachment.url}>
                {locale === "zh" ? "浏览器不支持音频播放。" : "Your browser does not support audio playback."}
              </audio>
            ) : attachment.kind === "video" && attachment.url ? (
              <video controls playsInline preload="metadata" src={attachment.url}>
                {locale === "zh" ? "浏览器不支持视频播放。" : "Your browser does not support video playback."}
              </video>
            ) : (
              <a className="attachment-document-preview" href={attachment.url} rel="noreferrer" target="_blank">
                <AppIcon name="file" />
                <span>{locale === "zh" ? "打开文件" : "Open file"}</span>
              </a>
            )}
          </div>
          <div className="attachment-card-footer">
            <span className="attachment-kind-icon">
              <AppIcon name={iconFor(attachment.kind)} />
            </span>
            <span className="attachment-file-copy">
              <strong title={attachment.originalName}>{attachment.originalName}</strong>
              <span>{formatAttachmentBytes(attachment.byteSize)} · {attachment.mimeType}</span>
            </span>
            <StatusPill>{labelFor(attachment.kind, locale)}</StatusPill>
          </div>
        </article>
      ))}
    </div>
  );
}
