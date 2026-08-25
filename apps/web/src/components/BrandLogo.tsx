import Image from "next/image";

export function BrandLogo({
  className = "",
  label = "CNPAF",
  priority = false,
  sizes = "184px",
}: {
  className?: string;
  label?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      alt={label}
      className={`brand-logo${className ? ` ${className}` : ""}`}
      height={640}
      preload={priority}
      sizes={sizes}
      src="/cnpaf-logo.webp"
      width={640}
    />
  );
}
