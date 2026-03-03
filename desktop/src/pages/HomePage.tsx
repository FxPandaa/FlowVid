import { useState, useEffect, useMemo } from "react";
import { HeroBanner, MediaRow, ContinueWatching } from "../components";
import { cinemetaService, MediaItem } from "../services";
import { useLibraryStore } from "../stores";
import "./HomePage.css";

/**
 * Module-level data cache so navigating away and back
 * doesn't flash a skeleton / re-fetch everything.
 */
let _cachedPopularMovies: MediaItem[] = [];
let _cachedPopularSeries: MediaItem[] = [];
let _cachedTopRatedMovies: MediaItem[] = [];
let _cachedTopRatedSeries: MediaItem[] = [];

export function HomePage() {
  const [popularMovies, setPopularMovies] =
    useState<MediaItem[]>(_cachedPopularMovies);
  const [popularSeries, setPopularSeries] =
    useState<MediaItem[]>(_cachedPopularSeries);
  const [topRatedMovies, setTopRatedMovies] = useState<MediaItem[]>(
    _cachedTopRatedMovies,
  );
  const [topRatedSeries, setTopRatedSeries] = useState<MediaItem[]>(
    _cachedTopRatedSeries,
  );

  // Only show loading on very first load (no cached data)
  const hasCachedData = _cachedPopularMovies.length > 0;
  const [isLoading, setIsLoading] = useState(!hasCachedData);

  const { watchHistory } = useLibraryStore();

  // Build the top 10 featured items from popular movies + series
  const featuredItems = useMemo(() => {
    const combined: MediaItem[] = [];
    // Interleave movies and series for variety
    const maxEach = 5;
    for (let i = 0; i < maxEach; i++) {
      if (popularMovies[i]) combined.push(popularMovies[i]);
      if (popularSeries[i]) combined.push(popularSeries[i]);
    }
    return combined.slice(0, 10);
  }, [popularMovies, popularSeries]);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      if (!hasCachedData) setIsLoading(true);

      const [
        popularMoviesData,
        popularSeriesData,
        topRatedMoviesData,
        topRatedSeriesData,
      ] = await Promise.all([
        cinemetaService.getPopularMovies(),
        cinemetaService.getPopularSeries(),
        cinemetaService.getTopRatedMovies(),
        cinemetaService.getTopRatedSeries(),
      ]);

      // Persist to module-level cache
      _cachedPopularMovies = popularMoviesData;
      _cachedPopularSeries = popularSeriesData;
      _cachedTopRatedMovies = topRatedMoviesData;
      _cachedTopRatedSeries = topRatedSeriesData;

      setPopularMovies(popularMoviesData);
      setPopularSeries(popularSeriesData);
      setTopRatedMovies(topRatedMoviesData);
      setTopRatedSeries(topRatedSeriesData);
    } catch (error) {
      console.error("Failed to load content:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="home-page">
      <HeroBanner items={featuredItems} isLoading={isLoading} />

      <div className="content-rows">
        {/* Continue Watching - only show if there's history */}
        {/* For series, only show the most recent episode per series */}
        {watchHistory.length > 0 && (
          <ContinueWatching
            items={watchHistory.filter((item, index, self) => {
              // Skip finished items (≥95% watched)
              if (item.progress >= 95) return false;
              // For movies, always include
              if (item.type === "movie") return true;
              // For series, only include if it's the first occurrence of this imdbId
              return self.findIndex((h) => h.imdbId === item.imdbId) === index;
            })}
          />
        )}

        <MediaRow
          title="Popular Movies"
          items={popularMovies}
          isLoading={isLoading}
        />

        <MediaRow
          title="Popular TV Shows"
          items={popularSeries}
          isLoading={isLoading}
        />

        <MediaRow
          title="Top Rated Movies"
          items={topRatedMovies}
          isLoading={isLoading}
        />

        <MediaRow
          title="Top Rated TV Shows"
          items={topRatedSeries}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
