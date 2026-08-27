"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { AppIcon } from "./AppIcon";

export function AvatarLightbox({
  locale,
  name,
  onClose,
  src,
}: {
  locale: "zh" | "en";
  name: string;
  onClose: () => void;
  src: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-labelledby="avatar-preview-title"
      className="avatar-lightbox"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      ref={dialogRef}
    >
      <div className="avatar-lightbox-content">
        <div className="avatar-lightbox-heading">
          <div>
            <div className="eyebrow">
              {locale === "zh" ? "个人头像" : "Profile photo"}
            </div>
            <h2 id="avatar-preview-title">{name}</h2>
          </div>
          <button
            aria-label={locale === "zh" ? "关闭头像预览" : "Close photo preview"}
            autoFocus
            className="icon-button avatar-lightbox-close"
            onClick={onClose}
            type="button"
          >
            <AppIcon name="close" />
          </button>
        </div>
        <Image
          alt={locale === "zh" ? `${name} 的头像` : `${name}'s profile photo`}
          className="avatar-lightbox-image"
          height={960}
          src={src}
          unoptimized
          width={960}
        />
      </div>
    </dialog>
  );
}
