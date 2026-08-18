import { useEffect, useState, type ImgHTMLAttributes } from "react";

export function SafeImage({ src, alt, className = "", onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);

  if (failed) {
    return <span className={`map-grid grid place-items-center bg-[#171720] text-white/35 ${className}`} role="img" aria-label={alt || "Image unavailable"}>
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 17 4-4 3 3 3-3 6 6" /></svg>
    </span>;
  }

  return <img {...props} src={src} alt={alt} className={className} onError={(event) => { setFailed(true); onError?.(event); }} />;
}
