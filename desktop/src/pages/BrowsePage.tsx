import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { cinemetaService, MediaItem } from "../services";
import { MediaCard } from "../components";
import { ArrowLeft } from "../components/Icons";
import "./BrowsePage.css";

const CATEGORIES: Record<
  string,
  { title: string; type: "movie" | "series"; catalog: "top" | "imdbRating" }
> = {
  "popular-movies": {
    title: "Popular Movies",
    type: "movie",
    catalog: "top",
  },
  "popular-series": {
    title: "Popular TV Shows",
    type: "series",
    catalog: "top",
  },
  "top-movies": {
    title: "Top Rated Movies",
    type: "movie",
    catalog: "imdbRating",
  },
  "top-series": {
    title: "Top Rated TV Shows",
    type: "series",
    catalog: "imdbRating",
  },
};

export function BrowsePage() {
  const { category } = useParams<{ category: string }>();
  const config = category ? CATEGORIES[category] : undefined;

  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(
    async (currentSkip: number) => {
      if (!config) return;

      try {
        const data = await cinemetaService.getCatalog(
          config.type,
          config.catalog,
          currentSkip,
        );
        if (data.length === 0) {
          setHasMore(false);
        } else {
          setItems((prev) =>
            currentSkip === 0 ? data : [...prev, ...data],
          );
        }
      } catch (error) {
        console.error("Failed to load browse content:", error);
      }
    },
    [config],
  );

  useEffect(() => {
    setItems([]);
    setSkip(0);
    setHasMore(true);
    setIsLoading(true);
    loadItems(0).finally(() => setIsLoading(false));
  }, [category, loadItems]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && hasMore) {
          const nextSkip = skip + 100;
          setSkip(nextSkip);
          setIsLoadingMore(true);
          loadItems(nextSkip).finally(() => setIsLoadingMore(false));
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, skip, loadItems]);

  if (!config) {
    return (
      <div className="browse-page">
        <div className="browse-empty">
          <h2>Category not found</h2>
          <Link to="/" className="browse-back-link">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="browse-page">
      <div className="browse-header">
        <Link to="/" className="browse-back-btn">
          <ArrowLeft size={18} />
        </Link>
        <h1>{config.title}</h1>
      </div>

      {isLoading ? (
        <div className="browse-grid">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="browse-skeleton">
              <div className="skeleton-poster"></div>
              <div className="skeleton-title"></div>
              <div className="skeleton-meta"></div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="browse-grid">
            {items.map((item) => (
              <MediaCard
                key={`${item.type}-${item.id}`}
                item={item}
                size="medium"
                showRating
              />
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} className="browse-sentinel">
              {isLoadingMore && (
                <div className="browse-loading-more">
                  <div className="spinner"></div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
