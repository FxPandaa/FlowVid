import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useLibraryStore } from "../stores";
import { MediaCard } from "../components";
import {
  StarFilled,
  Clipboard,
  Search,
  BookOpen,
  Film,
  Tv,
  Play,
  X,
  ChevronLeft,
  ChevronRight,
} from "../components/Icons";
import { MediaItem } from "../services";
import { useValidatedImage } from "../utils/useValidatedImage";
import type { WatchHistoryItem } from "../stores/libraryStore";
import "./LibraryPage.css";

export function LibraryPage() {
  const {
    library,
    watchHistory,
    activeFilter,
    sortBy,
    setFilter,
    setSortBy,
    getFilteredLibrary,
    clearWatchHistory,
    removeFromLibrary,
  } = useLibraryStore();

  const cwListRef = useRef<HTMLDivElement>(null);

  const handleCwWheel = useCallback((e: WheelEvent) => {
    const el = cwListRef.current;
    if (!el || e.deltaY === 0) return;
    const isScrollable = el.scrollWidth > el.clientWidth;
    if (!isScrollable) return;
    e.preventDefault();
    el.scrollBy({ left: e.deltaY * 1.5, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = cwListRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleCwWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleCwWheel);
  }, [handleCwWheel]);

  const filteredLibrary = getFilteredLibrary();

  // Convert library items to MediaItem format for cinemeta
  const libraryItems: MediaItem[] = filteredLibrary.map((item) => ({
    id: item.imdbId,
    imdbId: item.imdbId,
    type: item.type,
    name: item.title,
    title: item.title,
    year: item.year,
    description: "",
    overview: "",
    poster: item.poster,
    background: item.backdrop,
    backdrop: item.backdrop,
    rating: item.rating || 0,
    genres: [],
  }));

  // Deduplicated continue watching (most recent episode per series)
  const continueItems = watchHistory
    .filter((item, index, self) => {
      // Skip finished items (≥95% watched)
      if (item.progress >= 95) return false;
      if (item.type === "movie") return true;
      return self.findIndex((h) => h.imdbId === item.imdbId) === index;
    })
    .slice(0, 10);

  return (
    <div className="library-page">
      {/* Header + controls */}
      <div className="library-top">
        <h1>My Library</h1>
        <div className="library-controls">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${activeFilter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`filter-btn ${activeFilter === "movies" ? "active" : ""}`}
              onClick={() => setFilter("movies")}
            >
              Movies
            </button>
            <button
              className={`filter-btn ${activeFilter === "series" ? "active" : ""}`}
              onClick={() => setFilter("series")}
            >
              Series
            </button>
            <button
              className={`filter-btn ${activeFilter === "favorites" ? "active" : ""}`}
              onClick={() => setFilter("favorites")}
            >
              <StarFilled size={14} /> Favorites
            </button>
            <button
              className={`filter-btn ${activeFilter === "watchlist" ? "active" : ""}`}
              onClick={() => setFilter("watchlist")}
            >
              <Clipboard size={14} /> Watchlist
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="sort-select"
          >
            <option value="recent">Recently Added</option>
            <option value="title">Title (A-Z)</option>
            <option value="rating">Rating</option>
            <option value="year">Year</option>
            <option value="runtime">Runtime</option>
          </select>
        </div>
      </div>

      {/* Stacked layout: Continue Watching on top, Library below */}
      <div className="library-sections">
        {/* Continue Watching — horizontal landscape cards */}
        <div className="library-cw-section">
          <div className="library-cw-header">
            <h2>Continue Watching</h2>
            {continueItems.length > 0 && (
              <button className="btn btn-ghost" onClick={clearWatchHistory}>
                Clear
              </button>
            )}
          </div>

          {continueItems.length > 0 ? (
            <div className="library-cw-scroll-wrapper">
              <button
                className="cw-scroll-btn cw-scroll-left"
                onClick={() => cwListRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
                aria-label="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="library-cw-list" ref={cwListRef}>
                {continueItems.map((item) => (
                  <LibraryCWCard key={item.id} item={item} />
                ))}
              </div>
              <button
                className="cw-scroll-btn cw-scroll-right"
                onClick={() => cwListRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
                aria-label="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <div className="library-cw-empty">
              <p>Nothing to continue</p>
            </div>
          )}
        </div>

        {/* Library grid */}
        <div className="library-grid-section">
          <div className="library-grid-header">
            <h2>Library</h2>
            <span className="library-count">
              {filteredLibrary.length}{" "}
              {filteredLibrary.length === 1 ? "item" : "items"}
            </span>
          </div>

          {libraryItems.length > 0 ? (
            <div className="library-grid">
              {libraryItems.map((item) => {
                const libItem = filteredLibrary.find((l) => l.imdbId === item.id);
                return (
                  <MediaCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    size="medium"
                    watched={libItem?.watched}
                    onRemove={(id) => removeFromLibrary(id)}
                  />
                );
              })}
            </div>
          ) : library.length > 0 ? (
            <div className="library-empty">
              <span className="empty-icon">
                <Search size={40} />
              </span>
              <h2>No items match your filters</h2>
              <p>Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="library-empty">
              <span className="empty-icon">
                <BookOpen size={40} />
              </span>
              <h2>Your library is empty</h2>
              <p>Add movies and shows to your library to watch them later</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Apple TV-style landscape card for Library's Continue Watching ── */

function LibraryCWCard({ item }: { item: WatchHistoryItem }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imgError, setImgError] = useState(false);
  // Prefer backdrop (landscape) over poster — matches Apple TV's style
  const validBackdrop = useValidatedImage(item.backdrop || null);
  const validPoster = useValidatedImage(item.poster || null);
  const displayImage = validBackdrop || validPoster;
  const { removeFromHistory } = useLibraryStore();
  const navigate = useNavigate();

  // Compute time left
  const timeLeft =
    item.duration && item.progress < 100
      ? Math.round((item.duration * (100 - item.progress)) / 100 / 60)
      : null;

  const percentLabel =
    timeLeft !== null && timeLeft > 0
      ? `${timeLeft}m left`
      : `${Math.round(item.progress)}% watched`;

  const playerUrl =
    item.type === "movie"
      ? `/player/movie/${item.imdbId}`
      : `/player/series/${item.imdbId}/${item.season}/${item.episode}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const state = item.torrentInfoHash
      ? {
          savedTorrent: {
            infoHash: item.torrentInfoHash,
            title: item.torrentTitle,
            quality: item.torrentQuality,
            provider: item.torrentProvider,
          },
        }
      : undefined;
    navigate(playerUrl, { state });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromHistory(item.id);
    setShowDeleteConfirm(false);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="lcw-card" onClick={handleClick}>
      {/* Landscape thumbnail with all info overlaid */}
      <div className="lcw-thumb">
        {displayImage && !imgError ? (
          <img
            src={displayImage}
            alt={item.title}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="lcw-placeholder">
            {item.type === "movie" ? <Film size={28} /> : <Tv size={28} />}
          </div>
        )}

        {/* Play overlay on hover */}
        <div className="lcw-overlay">
          <span className="lcw-play">
            <Play size={20} />
          </span>
        </div>

        {/* Badge — e.g. "10m left" or "77% watched" */}
        <span className="lcw-badge">{percentLabel}</span>

        {/* Text info inside tile — bottom with gradient scrim */}
        <div className="lcw-scrim">
          {item.type === "series" && item.season && item.episode && (
            <span className="lcw-episode">
              S{item.season}E{item.episode}
            </span>
          )}
          <h4 className="lcw-title">{item.title}</h4>
          {item.type === "series" && item.episodeTitle && (
            <span className="lcw-ep-title">{item.episodeTitle}</span>
          )}
        </div>

        {/* Progress bar at bottom of image */}
        <div className="lcw-progress">
          <div
            className="lcw-progress-fill"
            style={{ width: `${item.progress}%` }}
          />
        </div>

        {/* Delete button */}
        <button className="lcw-delete" onClick={handleDelete} title="Remove">
          <X size={14} />
        </button>
      </div>

      {showDeleteConfirm
        ? createPortal(
            <div className="delete-confirm-overlay" onClick={handleCancel}>
              <div
                className="delete-confirm-popup"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Remove from Continue Watching?</h3>
                <p>This will delete your progress for "{item.title}"</p>
                <div className="delete-confirm-buttons">
                  <button className="btn btn-ghost" onClick={handleCancel}>
                    Cancel
                  </button>
                  <button className="btn btn-danger" onClick={handleConfirm}>
                    Remove
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
