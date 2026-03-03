import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { WatchHistoryItem, useLibraryStore } from "../stores/libraryStore";
import { useValidatedImage } from "../utils/useValidatedImage";
import { Film, Tv, Play, X } from "./Icons";
import "./ContinueWatching.css";

interface ContinueWatchingProps {
  items: WatchHistoryItem[];
}

export function ContinueWatching({ items }: ContinueWatchingProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    const el = listRef.current;
    if (!el || e.deltaY === 0) return;
    // Only hijack scroll when the list is actually scrollable
    const isScrollable = el.scrollWidth > el.clientWidth;
    if (!isScrollable) return;
    e.preventDefault();
    el.scrollBy({ left: e.deltaY * 1.5, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  if (items.length === 0) return null;

  return (
    <div className="continue-watching">
      <div className="continue-watching-header">
        <h2>Continue Watching</h2>
      </div>
      <div className="continue-watching-list" ref={listRef}>
        {items.slice(0, 10).map((item) => (
          <ContinueWatchingCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ContinueWatchingCard({ item }: { item: WatchHistoryItem }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const validatedPoster = useValidatedImage(item.poster || null);
  const { removeFromHistory } = useLibraryStore();
  const navigate = useNavigate();

  const remainingMinutes = Math.ceil(
    (item.duration * (100 - item.progress)) / 100 / 60,
  );

  const playerUrl =
    item.type === "movie"
      ? `/player/movie/${item.imdbId}`
      : `/player/series/${item.imdbId}/${item.season}/${item.episode}`;

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Pass saved torrent preferences if available
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

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromHistory(item.id);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="continue-card-wrapper">
      <div
        className="continue-card"
        onClick={handleCardClick}
        style={{ cursor: "pointer" }}
      >
        <div className="continue-card-poster">
          {validatedPoster && !posterError ? (
            <img
              src={validatedPoster}
              alt={item.title}
              onError={() => setPosterError(true)}
            />
          ) : (
            <div className="continue-card-placeholder">
              {item.type === "movie" ? <Film size={28} /> : <Tv size={28} />}
            </div>
          )}
          <div className="continue-card-overlay">
            <span className="play-button">
              <Play size={20} />
            </span>
          </div>
          {item.type === "series" && item.season && item.episode && (
            <span className="continue-card-season-tag">
              S{item.season}E{item.episode}
            </span>
          )}
          <span className="continue-card-percent">
            {Math.round(item.progress)}%
          </span>
          <div className="continue-progress">
            <div
              className="continue-progress-fill"
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <button
            className="delete-button"
            onClick={handleDeleteClick}
            title="Remove from Continue Watching"
          >
            <X size={14} />
          </button>
        </div>
        <div className="continue-card-info">
          <h3 className="continue-card-title">{item.title}</h3>
          {item.type === "series" && item.season && item.episode && (
            <span className="continue-card-episode">
              S{item.season}:E{item.episode}
              {item.episodeTitle && ` - ${item.episodeTitle}`}
            </span>
          )}
          <span className="continue-card-remaining">
            {remainingMinutes} min remaining
          </span>
        </div>
      </div>

      {showDeleteConfirm
        ? createPortal(
            <div
              className="delete-confirm-overlay"
              onClick={handleCancelDelete}
            >
              <div
                className="delete-confirm-popup"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Remove from Continue Watching?</h3>
                <p>This will delete your progress for "{item.title}"</p>
                <div className="delete-confirm-buttons">
                  <button
                    className="btn btn-ghost"
                    onClick={handleCancelDelete}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleConfirmDelete}
                  >
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
