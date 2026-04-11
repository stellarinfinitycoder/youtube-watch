import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type LazyRenderProps = {
  children: ReactNode;
  minHeight?: number;
  className?: string;
};

function LazyRenderComponent({ children, minHeight = 320, className }: LazyRenderProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) {
      return;
    }

    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: "700px 0px", threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div ref={rootRef} className={className}>
      {isVisible ? children : <div className="video-tile-placeholder" style={{ minHeight }} />}
    </div>
  );
}

export const LazyRender = memo(LazyRenderComponent);
