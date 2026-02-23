import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { MediaItem } from "../services/metadata/cinemeta";
import { useValidatedImage } from "../utils/useValidatedImage";
import { StarFilled, Play } from "./Icons";
import "./HeroBanner.css";

const ROTATE_INTERVAL = 15000; // 15 seconds

/** Module-level set to remember image URLs we have already preloaded (requested). */
const preloadedUrls = new Set<string>();
/** Module-level set for images that have fully loaded into the browser cache. */
const loadedUrls = new Set<string>();

function preloadImage(url: string | undefined | null) {
  if (!url || preloadedUrls.has(url)) return;
  preloadedUrls.add(url);
  const img = new Image();
  img.onload = () => loadedUrls.add(url);
  img.src = url;
}

interface HeroBannerProps {
  items: MediaItem[];
  isLoading?: boolean;
}

export function HeroBanner({ items, isLoading = false }: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [logoLoaded, setLogoLoaded] = useState(false);
  const [backdropReady, setBackdropReady] = useState(false);

  const item = items.length > 0 ? items[activeIndex % items.length] : null;
  const validLogo = useValidatedImage(item?.logo);

  // Preload current + next backdrop & logo images
  useEffect(() => {
    if (items.length === 0) return;
    // Preload current and next 2 items
    for (let offset = 0; offset < Math.min(3, items.length); offset++) {
      const idx = (activeIndex + offset) % items.length;
      const m = items[idx];
      preloadImage(m?.backdrop);
      preloadImage(m?.logo);
    }
  }, [items, activeIndex]);

  // When the backdrop image URL changes, wait for it to actually load before showing
  useEffect(() => {
    setBackdropReady(false);
    if (!item?.backdrop) return;
    // Only mark ready if the image has fully downloaded into the browser cache
    if (loadedUrls.has(item.backdrop)) {
      setBackdropReady(true);
      return;
    }
    const url = item.backdrop;
    const img = new Image();
    img.onload = () => {
      loadedUrls.add(url);
      setBackdropReady(true);
    };
    img.onerror = () => setBackdropReady(true); // show anyway on error
    img.src = url;
  }, [item?.backdrop]);

  // Reset logo loaded state when logo changes
  useEffect(() => {
    setLogoLoaded(false);
  }, [validLogo]);

  const goTo = useCallback(
    (index: number) => {
      if (items.length === 0 || isTransitioning) return;
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex(index % items.length);
        setIsTransitioning(false);
      }, 400);
    },
    [items.length, isTransitioning],
  );

  // Auto-rotate
  useEffect(() => {
    if (items.length <= 1) return;

    timerRef.current = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % items.length);
        setIsTransitioning(false);
      }, 400);
    }, ROTATE_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length]);

  // Reset timer on manual navigation
  const handleDotClick = (index: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    goTo(index);
    // Restart auto-rotate
    if (items.length > 1) {
      timerRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setActiveIndex((prev) => (prev + 1) % items.length);
          setIsTransitioning(false);
        }, 400);
      }, ROTATE_INTERVAL);
    }
  };

  if (isLoading) {
    return (
      <div className="hero-banner hero-loading">
        <div className="hero-skeleton"></div>
      </div>
    );
  }

  if (!item) {
    return null;
  }

  return (
    <div className="hero-banner">
      {/* Backdrop only fades while the new image is loading — not during content transitions.
          This prevents the full blank-screen flash between slides. */}
      <div
        className={`hero-backdrop ${!backdropReady ? "hero-backdrop-fade" : ""}`}
        style={{
          backgroundImage: item.backdrop ? `url(${item.backdrop})` : "none",
        }}
      >
        <div className="hero-gradient"></div>
      </div>

      <div
        className={`hero-content ${isTransitioning ? "hero-content-fade" : ""}`}
      >
        <div className="hero-heading">
          {validLogo ? (
            <img
              className={`hero-logo ${logoLoaded ? "hero-logo-loaded" : ""}`}
              src={validLogo}
              alt={item.title}
              onLoad={() => setLogoLoaded(true)}
            />
          ) : (
            <h1 className="hero-title">{item.title}</h1>
          )}
        </div>

        <div className="hero-meta">
          {item.rating > 0 && (
            <span className="hero-meta-chip hero-rating-chip">
              <span className="star">
                <StarFilled size={14} />
              </span>
              {item.rating.toFixed(1)}
            </span>
          )}
          {typeof item.year === "number" && item.year > 0 && (
            <span className="hero-meta-chip">{item.year}</span>
          )}
          <span className="hero-meta-chip hero-type-chip">
            {item.type === "movie" ? "Movie" : "Series"}
          </span>
          {item.genres && item.genres.length > 0 && (
            <span className="hero-meta-chip hero-genre-chip">
              {item.genres.slice(0, 2).join(" • ")}
            </span>
          )}
        </div>

        <p className="hero-overview">
          {item.overview?.slice(0, 300)}
          {item.overview && item.overview.length > 300 ? "..." : ""}
        </p>

        <div className="hero-actions">
          <Link
            to={`/player/${item.type}/${item.id}`}
            className="btn btn-primary hero-btn"
          >
            <Play size={14} /> Play
          </Link>
          <Link
            to={`/details/${item.type}/${item.id}`}
            className="btn btn-secondary hero-btn"
          >
            More Info
          </Link>
        </div>
      </div>

      {/* Dot indicators */}
      {items.length > 1 && (
        <div className="hero-dots">
          {items.map((_, i) => (
            <button
              key={i}
              className={`hero-dot ${i === activeIndex % items.length ? "hero-dot-active" : ""}`}
              onClick={() => handleDotClick(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
