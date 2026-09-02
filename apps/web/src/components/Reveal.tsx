import { useEffect, useRef, useState, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );
  const [isVisible, setIsVisible] = useState(prefersReducedMotion);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || isVisible) return;

    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -48px", threshold: 0 },
    );
    const revealWithoutMotion = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      setPrefersReducedMotion(true);
      setIsVisible(true);
      observer.disconnect();
    };

    reducedMotion.addEventListener("change", revealWithoutMotion);
    observer.observe(element);

    return () => {
      reducedMotion.removeEventListener("change", revealWithoutMotion);
      observer.disconnect();
    };
  }, [isVisible]);

  return <div
    ref={elementRef}
    className={`${className} ${prefersReducedMotion ? "translate-y-0 opacity-100" : `transition-all duration-700 ease-out ${isVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}`}
    style={{ transitionDelay: isVisible && !prefersReducedMotion && delay > 0 ? `${delay}ms` : undefined }}
    data-revealed={isVisible}
  >
    {children}
  </div>;
}
