export function BrandSlogan({
  className = "",
  compact = false,
  locale,
}: {
  className?: string;
  compact?: boolean;
  locale: "zh" | "en";
}) {
  return (
    <div
      className={`brand-slogan${compact ? " brand-slogan-compact" : ""}${className ? ` ${className}` : ""}`}
    >
      {locale === "en" ? (
        <span className="brand-slogan-en">Offer Love, All for Love.</span>
      ) : (
        <span className="brand-slogan-zh" lang="zh">
          忠于爱，终与爱。
        </span>
      )}
    </div>
  );
}
