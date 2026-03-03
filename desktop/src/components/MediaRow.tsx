import { useRef } from "react";
import { MediaItem } from "../services/metadata/cinemeta";
import { MediaCard } from "./MediaCard";
import { ChevronLeft, ChevronRight } from "./Icons";
import "./MediaRow.css";

interface MediaRowProps {
  title: string;
  items: MediaItem[];
  isLoading?: boolean;
  variant?: "poster" | "landscape";
  size?: "small" | "medium" | "large";
}

export function MediaRow({
  title,
  items,
  isLoading = false,
  variant = "poster",
  size = "medium",
}: MediaRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.8;
      rowRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (isLoading) {
    const isLandscape = variant === "landscape";
    return (
      <section className="media-row">
        <h2 className="media-row-title">{title}</h2>
        <div className="media-row-items">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`media-card-skeleton ${isLandscape ? "media-card-skeleton-landscape" : ""}`}
            >
              <div
                className={`skeleton-poster ${isLandscape ? "skeleton-landscape" : ""}`}
              ></div>
              <div className="skeleton-title"></div>
              <div className="skeleton-meta"></div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="media-row">
      <div className="media-row-header">
        <h2 className="media-row-title">{title}</h2>
      </div>

      <div className="media-row-scroll-wrapper">
        <button
          className="media-row-scroll-btn media-row-scroll-left"
          onClick={() => scroll("left")}
          aria-label="Scroll left"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="media-row-items" ref={rowRef}>
          {items.map((item) => (
            <MediaCard
              key={`${item.type}-${item.id}`}
              item={item}
              variant={variant}
              size={size}
            />
          ))}
        </div>
        <button
          className="media-row-scroll-btn media-row-scroll-right"
          onClick={() => scroll("right")}
          aria-label="Scroll right"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
