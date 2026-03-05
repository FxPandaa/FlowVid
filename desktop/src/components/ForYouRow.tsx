import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { tmdbService, TmdbDiscoverItem } from "../services";
import { useLibraryStore } from "../stores";
import { StarFilled, ChevronLeft, ChevronRight, Film, Tv, Sparkles } from "./Icons";
import { useValidatedImage } from "../utils/useValidatedImage";
import "./ForYouRow.css";

// Map common genre names to TMDB IDs (movies + series combined)
const GENRE_NAME_TO_ID: Record<string, { movie: number; series: number }> = {
  action: { movie: 28, series: 10759 },
  adventure: { movie: 12, series: 10759 },
  animation: { movie: 16, series: 16 },
  comedy: { movie: 35, series: 35 },
  crime: { movie: 80, series: 80 },
  documentary: { movie: 99, series: 99 },
  drama: { movie: 18, series: 18 },
  family: { movie: 10751, series: 10751 },
  fantasy: { movie: 14, series: 10765 },
  history: { movie: 36, series: 36 },
  horror: { movie: 27, series: 27 },
  music: { movie: 10402, series: 10402 },
  mystery: { movie: 9648, series: 9648 },
  romance: { movie: 10749, series: 10749 },
  "science fiction": { movie: 878, series: 10765 },
  "sci-fi": { movie: 878, series: 10765 },
  "sci-fi & fantasy": { movie: 878, series: 10765 },
  "tv movie": { movie: 10770, series: 10770 },
  thriller: { movie: 53, series: 53 },
  war: { movie: 10752, series: 10768 },
  "war & politics": { movie: 10752, series: 10768 },
  western: { movie: 37, series: 37 },
};

function ForYouCard({ item }: { item: TmdbDiscoverItem }) {
  const navigate = useNavigate();
  const [isResolving, setIsResolving] = useState(false);
  const posterUrl = useValidatedImage(item.posterUrl);

  const handleClick = async () => {
    setIsResolving(true);
    try {
      const imdbId = await tmdbService.resolveImdbId(item.tmdbId, item.type);
      if (imdbId) {
        navigate(`/details/${item.type}/${imdbId}`);
      }
    } catch {
      console.error("Failed to resolve", item.title);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div
      className="foryou-card media-card media-card-medium"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      <div className="media-card-poster">
        {posterUrl ? (
          <img src={posterUrl} alt={item.title} loading="lazy" />
        ) : (
          <div className="media-card-placeholder">
            {item.type === "movie" ? <Film size={28} /> : <Tv size={28} />}
          </div>
        )}

        <div className="media-card-overlay">
          {isResolving ? (
            <div className="spinner"></div>
          ) : (
            <button className="play-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </button>
          )}
        </div>

        {item.rating > 0 && (
          <div className="media-card-rating">
            <span className="star"><StarFilled size={12} /></span>
            <span>{item.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="media-card-info">
        <h3 className="media-card-title">{item.title}</h3>
        <div className="media-card-meta">
          <span>{item.releaseDate?.substring(0, 4) || "TBA"}</span>
          <span className="dot">·</span>
          <span className="type">{item.type === "movie" ? "Movie" : "Series"}</span>
        </div>
      </div>
    </div>
  );
}

let _cachedForYou: TmdbDiscoverItem[] = [];

export function ForYouRow({ show = true }: { show?: boolean }) {
  const { library, watchHistory } = useLibraryStore();
  const [items, setItems] = useState<TmdbDiscoverItem[]>(_cachedForYou);
  const [isLoading, setIsLoading] = useState(_cachedForYou.length === 0);
  const rowRef = useRef<HTMLDivElement>(null);

  // Don't load or render if disabled
  if (!show) return null;

  // Extract genre preferences from library items
  const userGenres = useMemo(() => {
    const genreCount = new Map<string, number>();

    for (const item of library) {
      if (item.genres) {
        for (const genre of item.genres) {
          const lower = genre.toLowerCase();
          genreCount.set(lower, (genreCount.get(lower) || 0) + 1);
        }
      }
    }

    // Also count from watch history titles' library matches
    const watchedIds = new Set(watchHistory.map((h) => h.imdbId));
    for (const item of library) {
      if (watchedIds.has(item.imdbId) && item.genres) {
        for (const genre of item.genres) {
          const lower = genre.toLowerCase();
          genreCount.set(lower, (genreCount.get(lower) || 0) + 2); // Watched items weight more
        }
      }
    }

    // Sort by count, return top genre names
    return [...genreCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
  }, [library, watchHistory]);

  useEffect(() => {
    if (userGenres.length === 0) return;

    const fetchForYou = async () => {
      try {
        if (_cachedForYou.length === 0) setIsLoading(true);

        // Get TMDB genre IDs for movies
        const movieGenreIds = userGenres
          .map((g) => GENRE_NAME_TO_ID[g]?.movie)
          .filter(Boolean) as number[];

        const seriesGenreIds = userGenres
          .map((g) => GENRE_NAME_TO_ID[g]?.series)
          .filter(Boolean) as number[];

        // Fetch both types
        const [movieResults, seriesResults] = await Promise.all([
          movieGenreIds.length > 0
            ? tmdbService.discover("movie", {
                genres: movieGenreIds.slice(0, 3),
                sortBy: "vote_average.desc",
                ratingGte: 7,
              })
            : { results: [] },
          seriesGenreIds.length > 0
            ? tmdbService.discover("series", {
                genres: seriesGenreIds.slice(0, 3),
                sortBy: "vote_average.desc",
                ratingGte: 7,
              })
            : { results: [] },
        ]);

        // Interleave and deduplicate
        const combined: TmdbDiscoverItem[] = [];
        const seen = new Set<number>();
        const allResults = [
          ...movieResults.results,
          ...seriesResults.results,
        ].sort((a, b) => b.rating - a.rating);

        for (const item of allResults) {
          if (!seen.has(item.tmdbId)) {
            seen.add(item.tmdbId);
            combined.push(item);
          }
        }

        // Take top 20
        const finalItems = combined.slice(0, 20);
        _cachedForYou = finalItems;
        setItems(finalItems);
      } catch (error) {
        console.error("Failed to load For You:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchForYou();
  }, [userGenres, library, watchHistory]);

  const scroll = (direction: "left" | "right") => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.8;
      rowRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // Don't show if no library data or loading with no cache
  if (userGenres.length === 0) return null;

  if (isLoading) {
    return (
      <section className="media-row">
        <div className="media-row-header" style={{ padding: "0 48px" }}>
          <h2 className="media-row-title foryou-title">
            <Sparkles size={16} /> For You
          </h2>
        </div>
        <div className="media-row-items" style={{ padding: "8px 48px" }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="media-card-skeleton">
              <div className="skeleton-poster"></div>
              <div className="skeleton-title"></div>
              <div className="skeleton-meta"></div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="media-row">
      <div className="media-row-header" style={{ padding: "0 48px" }}>
        <h2 className="media-row-title foryou-title">
          <Sparkles size={16} /> For You
        </h2>
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
            <ForYouCard key={item.tmdbId} item={item} />
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
