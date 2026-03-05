import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { tmdbService, TmdbDiscoverItem } from "../services";
import { StarFilled, X, Search, Film, Tv, Check } from "../components/Icons";
import { useValidatedImage } from "../utils/useValidatedImage";
import "./DiscoverPage.css";

// ── Genre lists (TMDB IDs) ──────────────────────────────────────────────

interface Genre {
  id: number;
  name: string;
}

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Highest Rated" },
  { value: "primary_release_date.desc", label: "Newest First" },
  { value: "primary_release_date.asc", label: "Oldest First" },
  { value: "revenue.desc", label: "Highest Revenue" },
  { value: "vote_count.desc", label: "Most Voted" },
];

const LANGUAGES = [
  { code: "", label: "All Languages" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "no", label: "Norwegian" },
  { code: "fi", label: "Finnish" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "th", label: "Thai" },
];

const currentYear = new Date().getFullYear();

// ── Discover card component (uses TMDB data directly) ───────────────────

function DiscoverCard({ item }: { item: TmdbDiscoverItem }) {
  const navigate = useNavigate();
  const [resolvedImdbId, setResolvedImdbId] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const posterUrl = useValidatedImage(item.posterUrl);

  const handleClick = async () => {
    if (resolvedImdbId) {
      navigate(`/details/${item.type}/${resolvedImdbId}`);
      return;
    }

    setIsResolving(true);
    try {
      const imdbId = await tmdbService.resolveImdbId(item.tmdbId, item.type);
      if (imdbId) {
        setResolvedImdbId(imdbId);
        navigate(`/details/${item.type}/${imdbId}`);
      }
    } catch {
      console.error("Failed to resolve IMDB ID for", item.title);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div
      className="discover-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      <div className="discover-card-poster">
        {posterUrl ? (
          <img src={posterUrl} alt={item.title} loading="lazy" />
        ) : (
          <div className="discover-card-placeholder">
            {item.type === "movie" ? <Film size={28} /> : <Tv size={28} />}
          </div>
        )}

        <div className="discover-card-overlay">
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
          <div className="discover-card-rating">
            <span className="star"><StarFilled size={12} /></span>
            <span>{item.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="discover-card-info">
        <h3 className="discover-card-title">{item.title}</h3>
        <div className="discover-card-meta">
          <span>{item.releaseDate?.substring(0, 4) || "TBA"}</span>
          <span className="dot">·</span>
          <span>{item.type === "movie" ? "Movie" : "Series"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Discover page ──────────────────────────────────────────────────

export function DiscoverPage() {
  const [type, setType] = useState<"movie" | "series">("movie");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState("popularity.desc");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [ratingMin, setRatingMin] = useState<string>("");
  const [ratingMax, setRatingMax] = useState<string>("");
  const [language, setLanguage] = useState("");
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);

  const [results, setResults] = useState<TmdbDiscoverItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const genreDropdownRef = useRef<HTMLDivElement>(null);

  // Load genres when type changes
  useEffect(() => {
    tmdbService.getGenres(type).then(setGenres);
  }, [type]);

  // Close genre dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(e.target as Node)) {
        setGenreDropdownOpen(false);
      }
    };
    if (genreDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [genreDropdownOpen]);

  // Build filter params
  const filterParams = useMemo(
    () => ({
      sortBy,
      genres: selectedGenres,
      yearGte: yearFrom ? parseInt(yearFrom) : undefined,
      yearLte: yearTo ? parseInt(yearTo) : undefined,
      ratingGte: ratingMin ? parseFloat(ratingMin) : undefined,
      ratingLte: ratingMax ? parseFloat(ratingMax) : undefined,
      language: language || undefined,
    }),
    [sortBy, selectedGenres, yearFrom, yearTo, ratingMin, ratingMax, language],
  );

  const loadResults = useCallback(
    async (p: number, append: boolean = false) => {
      try {
        const data = await tmdbService.discover(type, { ...filterParams, page: p });
        if (append) {
          setResults((prev) => [...prev, ...data.results]);
        } else {
          setResults(data.results);
        }
        setTotalPages(data.totalPages);
      } catch (error) {
        console.error("Discover failed:", error);
      }
    },
    [type, filterParams],
  );

  // Reset and reload when filters change
  useEffect(() => {
    setPage(1);
    setIsLoading(true);
    loadResults(1, false).finally(() => setIsLoading(false));
  }, [type, filterParams, loadResults]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || isLoading || page >= totalPages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && page < totalPages) {
          const nextPage = page + 1;
          setPage(nextPage);
          setIsLoadingMore(true);
          loadResults(nextPage, true).finally(() => setIsLoadingMore(false));
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isLoading, isLoadingMore, page, totalPages, loadResults]);

  const toggleGenre = (id: number) => {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const clearFilters = () => {
    setSelectedGenres([]);
    setSortBy("popularity.desc");
    setYearFrom("");
    setYearTo("");
    setRatingMin("");
    setRatingMax("");
    setLanguage("");
  };

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    sortBy !== "popularity.desc" ||
    yearFrom !== "" ||
    yearTo !== "" ||
    ratingMin !== "" ||
    ratingMax !== "" ||
    language !== "";

  return (
    <div className="discover-page">
      <div className="discover-header">
        <h1>Discover</h1>
        <p className="discover-subtitle">
          Find your next favorite {type === "movie" ? "movie" : "show"}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="discover-filters">
        {/* Type toggle */}
        <div className="discover-type-tabs">
          <button
            className={`discover-type-tab ${type === "movie" ? "active" : ""}`}
            onClick={() => setType("movie")}
          >
            <Film size={14} />
            Movies
          </button>
          <button
            className={`discover-type-tab ${type === "series" ? "active" : ""}`}
            onClick={() => setType("series")}
          >
            <Tv size={14} />
            TV Shows
          </button>
        </div>

        {/* Filter controls row */}
        <div className="discover-filter-row">
          {/* Sort */}
          <div className="discover-filter-group">
            <label>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="discover-select"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Year range */}
          <div className="discover-filter-group">
            <label>Year</label>
            <div className="discover-range-inputs">
              <input
                type="number"
                className="discover-input"
                placeholder="From"
                min="1900"
                max={currentYear}
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
              />
              <span className="range-separator">–</span>
              <input
                type="number"
                className="discover-input"
                placeholder="To"
                min="1900"
                max={currentYear}
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
              />
            </div>
          </div>

          {/* Rating range */}
          <div className="discover-filter-group">
            <label>Rating</label>
            <div className="discover-range-inputs">
              <input
                type="number"
                className="discover-input"
                placeholder="Min"
                min="0"
                max="10"
                step="0.5"
                value={ratingMin}
                onChange={(e) => setRatingMin(e.target.value)}
              />
              <span className="range-separator">–</span>
              <input
                type="number"
                className="discover-input"
                placeholder="Max"
                min="0"
                max="10"
                step="0.5"
                value={ratingMax}
                onChange={(e) => setRatingMax(e.target.value)}
              />
            </div>
          </div>

          {/* Language */}
          <div className="discover-filter-group">
            <label>Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="discover-select"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button className="discover-clear-btn" onClick={clearFilters}>
              <X size={14} />
              Clear
            </button>
          )}
        </div>

        {/* Genre multi-select dropdown */}
        <div className="discover-genre-dropdown" ref={genreDropdownRef}>
          <button
            className={`discover-genre-trigger ${genreDropdownOpen ? "open" : ""} ${selectedGenres.length > 0 ? "has-selection" : ""}`}
            onClick={() => setGenreDropdownOpen(!genreDropdownOpen)}
          >
            <span>
              {selectedGenres.length === 0
                ? "All Genres"
                : selectedGenres.length === 1
                  ? genres.find((g) => g.id === selectedGenres[0])?.name || "1 Genre"
                  : `${selectedGenres.length} Genres`}
            </span>
            <svg className="dropdown-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {genreDropdownOpen && (
            <div className="discover-genre-menu">
              {selectedGenres.length > 0 && (
                <button
                  className="discover-genre-option clear-option"
                  onClick={() => setSelectedGenres([])}
                >
                  <X size={12} />
                  <span>Clear selection</span>
                </button>
              )}
              {genres.map((genre) => {
                const isSelected = selectedGenres.includes(genre.id);
                return (
                  <button
                    key={genre.id}
                    className={`discover-genre-option ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleGenre(genre.id)}
                  >
                    <span className="genre-check">
                      {isSelected && <Check size={12} />}
                    </span>
                    <span>{genre.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="discover-grid">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="discover-skeleton">
              <div className="skeleton-poster"></div>
              <div className="skeleton-title"></div>
              <div className="skeleton-meta"></div>
            </div>
          ))}
        </div>
      ) : results.length > 0 ? (
        <>
          <div className="discover-grid">
            {results.map((item, idx) => (
              <DiscoverCard key={`${item.tmdbId}-${idx}`} item={item} />
            ))}
          </div>

          {page < totalPages && (
            <div ref={sentinelRef} className="discover-sentinel">
              {isLoadingMore && (
                <div className="discover-loading-more">
                  <div className="spinner"></div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="discover-empty">
          <Search size={40} />
          <h2>No results found</h2>
          <p>Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}
