import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallback?: ReactNode;
  fallbackText?: string;
  fallbackIcon?: ReactNode;
}

export function SafeImage({
  src,
  alt,
  style,
  className,
  fallback,
  fallbackText,
  fallbackIcon,
  ...rest
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (hasError || !src) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          background: "rgba(0, 0, 0, 0.04)",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: style?.borderRadius || 8,
          color: "#86868b",
          fontSize: 11,
          fontWeight: 600,
          textAlign: "center",
          padding: 6,
          ...style,
        }}
      >
        {fallbackIcon || (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )}
        {fallbackText && <span style={{ fontSize: 10, lineHeight: 1.2, color: "#6e6e73" }}>{fallbackText}</span>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={{
        ...style,
        opacity: loaded ? 1 : 0.8,
        transition: "opacity 0.2s ease",
      }}
      className={className}
      onError={() => setHasError(true)}
      onLoad={() => setLoaded(true)}
      loading="lazy"
      {...rest}
    />
  );
}
