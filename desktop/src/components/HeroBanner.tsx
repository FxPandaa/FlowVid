import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { MediaItem } from "../services/metadata/cinemeta";
import { useValidatedImage } from "../utils/useValidatedImage";
import { StarFilled, Play } from "./Icons";
import "./HeroBanner.css";

const ROTATE_INTERVAL = 15000; // 15 seconds
const CROSSFADE_DURATION = 800; // ms — matches CSS transition

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

/**
 * Ensure a backdrop image is loaded into the browser cache.
 * Resolves immediately if the image is already cached.
 */
function ensureImageLoaded(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (loadedUrls.has(url)) {
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => {
      loadedUrls.add(url);
      resolve();
    };
    img.onerror = () => resolve(); // show anyway on error
    img.src = url;
  });
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

  // Simple two-layer crossfade:
  //   baseUrl  — always opacity 1 (the "old" image, sits underneath)
  //   topUrl   — fades in from opacity 0 → 1 on top, then gets copied to baseUrl
  // After the crossfade finishes, baseUrl becomes the new image and topUrl is
  // hidden instantly (no reverse animation) so the next transition can begin.
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [topUrl, setTopUrl] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);
  const crossfadeRef = useRef(false);

  const item = items.length > 0 ? items[activeIndex % items.length] : null;
  const validLogo = useValidatedImage(item?.logo);

  // Set up the initial backdrop once we have the first item
  useEffect(() => {
    if (!item?.backdrop) return;
    if (baseUrl === null) {
      ensureImageLoaded(item.backdrop).then(() => {
        setBaseUrl(item.backdrop!);
      });
    }
  }, [item?.backdrop]); // eslint-disable-line react-hooks/exhaustive-deps

  // When activeIndex changes (after initial), crossfade to the new backdrop
  const prevIndexRef = useRef(activeIndex);
  useEffect(() => {
    if (prevIndexRef.current === activeIndex) return;
    prevIndexRef.current = activeIndex;

    const newItem = items[activeIndex % items.length];
    const newUrl = newItem?.backdrop;
    if (!newUrl) return;
    if (crossfadeRef.current) return; // don't overlap
    crossfadeRef.current = true;

    ensureImageLoaded(newUrl).then(() => {
      // Put new image on top layer, then fade it in
      setTopUrl(newUrl);
      // Double rAF to ensure the browser has painted opacity 0 before we animate to 1
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShowTop(true);
        });
      });

      // After the CSS transition completes, promote the top image to base and reset
      setTimeout(() => {
        setBaseUrl(newUrl);
        // Instantly hide top layer — no animation because we remove the active class
        // which also removes the CSS transition property
        setShowTop(false);
        setTopUrl(null);
        crossfadeRef.current = false;
      }, CROSSFADE_DURATION + 50); // small buffer beyond CSS duration
    });
  }, [activeIndex, items]);

  // Preload current + next backdrop & logo images
  useEffect(() => {
    if (items.length === 0) return;
    for (let offset = 0; offset < Math.min(3, items.length); offset++) {
      const idx = (activeIndex + offset) % items.length;
      const m = items[idx];
      preloadImage(m?.backdrop);
      preloadImage(m?.logo);
    }
  }, [items, activeIndex]);

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

  // Determine which layer is "active" (bottom, fully visible) and which is "incoming" (top, fading in)

  return (
    <div className="hero-banner">
      {/* Base backdrop layer — always opacity 1 */}
      <div
        className="hero-backdrop"
        style={{
          backgroundImage: baseUrl ? `url(${baseUrl})` : "none",
          opacity: 1,
          zIndex: 0,
        }}
      />

      {/* Top layer — fades in during crossfade, then instantly hidden */}
      {topUrl && (
        <div
          className={`hero-backdrop hero-backdrop-top${showTop ? " hero-backdrop-active" : ""}`}
          style={{
            backgroundImage: `url(${topUrl})`,
            zIndex: 1,
          }}
        />
      )}

      {/* Gradient overlay */}
      <div className="hero-gradient" />

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
