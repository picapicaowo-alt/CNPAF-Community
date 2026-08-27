import Image from "next/image";

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "C"
  );
}

export function UserAvatar({
  name,
  src,
  size = "small",
}: {
  name: string;
  src?: string | null;
  size?: "small" | "large";
}) {
  const pixels = size === "large" ? 80 : 40;

  return (
    <span
      aria-hidden="true"
      className={`person-avatar person-avatar-${size}`}
    >
      {src ? (
        <Image
          alt=""
          className="person-avatar-image"
          height={pixels}
          src={src}
          unoptimized
          width={pixels}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
