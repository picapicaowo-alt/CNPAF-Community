export function BrandSlogan({
  className = "",
  compact = false,
  showChinese = true,
}: {
  className?: string;
  compact?: boolean;
  showChinese?: boolean;
}) {
  return (
    <div
      className={`brand-slogan${compact ? " brand-slogan-compact" : ""}${className ? ` ${className}` : ""}`}
    >
      <span className="brand-slogan-en">Offer Love, All for Love.</span>
      {showChinese ? (
        <span className="brand-slogan-zh" lang="zh">
          忠于爱，终与爱。
        </span>
      ) : null}
    </div>
  );
}
