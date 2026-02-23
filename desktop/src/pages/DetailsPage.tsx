import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  cinemetaService,
  MovieDetails,
  SeriesDetails,
  Episode,
  searchTorrents,
  TorrentResult,
  debridService,
} from "../services";
import { useLibraryStore, useSettingsStore } from "../stores";
import { parseStreamInfo } from "../utils/streamParser";
import { useValidatedImage } from "../utils/useValidatedImage";
import { useFeatureGate } from "../hooks/useFeatureGate";
import {
  StarFilled,
  StarOutline,
  Play,
  Tv,
  Bolt,
  Check,
  X,
  DolbyVisionBadge,
  HDR10Badge,
  HDR10PlusBadge,
  DolbyAtmosBadge,
  HDRBadge,
} from "../components/Icons";
import "./DetailsPage.css";

type ContentType = "movie" | "series";

export function DetailsPage() {
  const { type, id } = useParams<{ type: ContentType; id: string }>();
  const navigate = useNavigate();

  const [details, setDetails] = useState<MovieDetails | SeriesDetails | null>(
    null,
  );
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [torrents, setTorrents] = useState<TorrentResult[]>([]);
  const [isSearchingTorrents, setIsSearchingTorrents] = useState(false);
  const [instantAvailability, setInstantAvailability] = useState<
    Map<string, boolean>
  >(new Map());
  const [selectedEpisode, setSelectedEpisode] = useState<{
    season: number;
    episode: number;
    name: string;
  } | null>(null);
  const [showEpisodePopup, setShowEpisodePopup] = useState(false);

  const torrentsRef = useRef<HTMLDivElement>(null);

  const {
    isInLibrary,
    addToLibrary,
    removeFromLibrary,
    toggleFavorite,
    toggleWatchlist,
    setUserRating,
    library,
    collections,
    addToCollection,
    removeFromCollection,
    getWatchProgress,
  } = useLibraryStore();
  const { activeDebridService, blurUnwatchedEpisodes } = useSettingsStore();
  const { canUseNativeScrapers } = useFeatureGate();

  const isMovie = type === "movie";
  const validLogo = useValidatedImage(details?.logo);
  const inLibrary = details?.imdbId ? isInLibrary(details.imdbId) : false;
  const libraryItem = details?.imdbId
    ? library.find((item) => item.imdbId === details.imdbId)
    : null;
  const isFavorite = libraryItem?.isFavorite || false;
  const isWatchlist = libraryItem?.watchlist || false;
  const userRating = libraryItem?.userRating;

  useEffect(() => {
    if (id) {
      loadDetails(id);
    }
  }, [id, type]);

  useEffect(() => {
    if (type === "series" && details && "seasons" in details && id) {
      loadEpisodes(id, selectedSeason);
    }
  }, [selectedSeason, details]);

  const loadDetails = async (imdbId: string) => {
    setIsLoading(true);
    try {
      if (isMovie) {
        const movieDetails = await cinemetaService.getMovieDetails(imdbId);
        setDetails(movieDetails);
      } else {
        const seriesDetails = await cinemetaService.getSeriesDetails(imdbId);
        setDetails(seriesDetails);

        // Set initial season
        const firstSeason = seriesDetails.seasons?.find(
          (s) => s.seasonNumber > 0,
        );
        if (firstSeason) {
          setSelectedSeason(firstSeason.seasonNumber);
        }
      }
    } catch (error) {
      console.error("Failed to load details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEpisodes = async (imdbId: string, seasonNumber: number) => {
    try {
      const eps = await cinemetaService.getSeasonEpisodes(imdbId, seasonNumber);
      setEpisodes(eps);
    } catch (error) {
      console.error("Failed to load episodes:", error);
      setEpisodes([]);
    }
  };

  const handleSearchTorrents = async (
    scrollAfter = false,
    episodeOverride?: { season: number; episode: number },
  ) => {
    if (!details?.imdbId) return;
    if (activeDebridService === "none") {
      alert(
        "Please configure a debrid service (Real-Debrid or AllDebrid) in Settings first.",
      );
      return;
    }
    setIsSearchingTorrents(true);
    try {
      const results = await searchTorrents({
        imdbId: details.imdbId,
        type: type as "movie" | "series",
        title: details.title,
        year: details.year,
        season: episodeOverride?.season,
        episode: episodeOverride?.episode,
      });
      setTorrents(results);
      if (results.length > 0) {
        try {
          const availability = await debridService.checkInstant(results);
          setInstantAvailability(availability);
        } catch (error) {
          console.error("Failed to check instant availability:", error);
        }
      }
      if (scrollAfter && results.length > 0) {
        setTimeout(() => {
          torrentsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    } catch (error) {
      console.error("Torrent search failed:", error);
    } finally {
      setIsSearchingTorrents(false);
    }
  };

  const handleEpisodeClick = (
    season: number,
    episode: number,
    name: string,
  ) => {
    setSelectedEpisode({ season, episode, name });
    setTorrents([]);
    setInstantAvailability(new Map());
    setShowEpisodePopup(true);
    handleSearchTorrents(false, { season, episode });
  };

  // Navigate to player with a chosen torrent
  const handleTorrentPlay = (
    torrent: TorrentResult,
    season?: number,
    episode?: number,
  ) => {
    if (isMovie) {
      navigate(`/player/${type}/${id}`, { state: { torrent, details } });
    } else {
      const s = season ?? selectedEpisode?.season ?? selectedSeason;
      const e = episode ?? selectedEpisode?.episode ?? 1;
      navigate(`/player/${type}/${id}/${s}/${e}`, {
        state: { torrent, details },
      });
    }
  };

  const handleLibraryToggle = () => {
    if (!details?.imdbId) return;

    if (inLibrary) {
      removeFromLibrary(details.imdbId);
    } else {
      addToLibrary({
        imdbId: details.imdbId,
        type: type as "movie" | "series",
        title: details.title,
        year: details.year || new Date().getFullYear(),
        poster: details.poster,
        backdrop: details.backdrop,
        rating: details.rating,
        genres: details.genres,
        runtime:
          isMovie && "runtime" in details
            ? Number(details.runtime) || undefined
            : undefined,
      });
    }
  };

  const handleFavoriteToggle = () => {
    if (!details?.imdbId || !inLibrary) return;
    toggleFavorite(details.imdbId);
  };

  const handleWatchlistToggle = () => {
    if (!details?.imdbId || !inLibrary) return;
    toggleWatchlist(details.imdbId);
  };

  const handleRatingChange = (rating: number) => {
    if (!details?.imdbId || !inLibrary) return;
    setUserRating(details.imdbId, rating);
  };

  const handleToggleCollectionItem = (collectionId: string) => {
    if (!details?.imdbId || !inLibrary) return;

    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;

    if (collection.items.includes(details.imdbId)) {
      removeFromCollection(collectionId, details.imdbId);
    } else {
      addToCollection(collectionId, details.imdbId);
    }
  };

  if (isLoading) {
    return (
      <div className="details-page details-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="details-page details-error">
        <h2>Content not found</h2>
        <Link to="/" className="btn btn-primary">
          Go Home
        </Link>
      </div>
    );
  }

  const seriesDetails = details as SeriesDetails;

  return (
    <div className="details-page">
      {/* Full-screen backdrop hero */}
      <div className="details-hero">
        <div
          className="details-backdrop"
          style={{
            backgroundImage: details.backdrop
              ? `url(${details.backdrop})`
              : "none",
          }}
        >
          <div className="details-backdrop-overlay"></div>
        </div>

        <div className="details-hero-content">
          <div className="details-heading">
            {validLogo ? (
              <img
                className="details-logo"
                src={validLogo}
                alt={details.title}
              />
            ) : (
              <h1 className="details-title">{details.title}</h1>
            )}
          </div>

          <div className="details-meta">
            <span className="meta-item">{details.year}</span>
            {details.rating > 0 && (
              <span className="meta-item">
                <span className="star">
                  <StarFilled size={14} />
                </span>{" "}
                {details.rating.toFixed(1)}
              </span>
            )}
            {isMovie &&
              (details as MovieDetails).runtime &&
              (() => {
                const totalMins = parseInt(
                  (details as MovieDetails).runtime!,
                  10,
                );
                if (isNaN(totalMins)) return null;
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;
                const label = [h > 0 ? `${h}h` : "", m > 0 ? `${m}m` : ""]
                  .filter(Boolean)
                  .join(" ");
                return <span className="meta-item">{label}</span>;
              })()}
            {!isMovie && seriesDetails.numberOfSeasons && (
              <span className="meta-item">
                {seriesDetails.numberOfSeasons} Season
                {seriesDetails.numberOfSeasons > 1 ? "s" : ""}
              </span>
            )}
            {details.genres &&
              details.genres.slice(0, 3).map((genre) => (
                <span key={genre} className="meta-item details-meta-genres">
                  {genre}
                </span>
              ))}
          </div>

          {details.cast && details.cast.length > 0 && (
            <div className="details-hero-cast">
              {details.cast.slice(0, 5).map((name, index) => (
                <span key={index} className="details-hero-cast-name">
                  {name}
                </span>
              ))}
            </div>
          )}

          <p className="details-overview">{details.overview}</p>

          <div className="details-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                if (isMovie) {
                  if (torrents.length > 0) {
                    torrentsRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  } else {
                    handleSearchTorrents(true);
                  }
                } else {
                  document
                    .querySelector(".details-episodes")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            >
              <Play size={14} /> Play
            </button>

            <button
              className={`btn ${inLibrary ? "btn-secondary" : "btn-ghost"}`}
              onClick={handleLibraryToggle}
            >
              {inLibrary ? (
                <>
                  <Check size={14} /> In Library
                </>
              ) : (
                "+ Add to Library"
              )}
            </button>

            {inLibrary && (
              <>
                <button
                  className={`btn ${isFavorite ? "btn-favorite" : "btn-ghost"}`}
                  onClick={handleFavoriteToggle}
                  title="Toggle favorite"
                >
                  {isFavorite ? (
                    <>
                      <StarFilled size={14} /> Favorite
                    </>
                  ) : (
                    <>
                      <StarOutline size={14} /> Favorite
                    </>
                  )}
                </button>

                <button
                  className={`btn ${isWatchlist ? "btn-watchlist" : "btn-ghost"}`}
                  onClick={handleWatchlistToggle}
                  title="Toggle watchlist"
                >
                  {isWatchlist ? (
                    <>
                      <Check size={14} /> Watchlist
                    </>
                  ) : (
                    "+ Watchlist"
                  )}
                </button>
              </>
            )}

            <button
              className="btn btn-ghost"
              onClick={() => handleSearchTorrents(true)}
              disabled={
                isSearchingTorrents ||
                activeDebridService === "none" ||
                !isMovie
              }
              title={
                activeDebridService === "none"
                  ? "Configure a debrid service in Settings first"
                  : !isMovie
                    ? "Select an episode below"
                    : ""
              }
            >
              {isSearchingTorrents
                ? "Searching..."
                : activeDebridService === "none"
                  ? "Setup Debrid First"
                  : !isMovie
                    ? "Select an Episode"
                    : "Find Sources"}
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content below the hero */}
      <div className="details-sections">
        {inLibrary && (
          <div className="details-section">
            <div className="details-user-content">
              <div className="user-rating">
                <h4>Your Rating</h4>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                    <button
                      key={star}
                      className={`star-btn ${userRating && userRating >= star ? "active" : ""}`}
                      onClick={() => handleRatingChange(star)}
                      title={`Rate ${star}/10`}
                    >
                      <StarFilled size={14} />
                    </button>
                  ))}
                  {userRating && (
                    <span className="rating-value">{userRating}/10</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collections - only show if in library */}
        {inLibrary && collections.length > 0 && (
          <div className="details-section">
            <div className="details-collections">
              <h4>Collections</h4>
              <div className="collections-checkboxes">
                {collections.map((collection) => {
                  const isInCollection = collection.items.includes(
                    details.imdbId!,
                  );
                  return (
                    <label key={collection.id} className="collection-checkbox">
                      <input
                        type="checkbox"
                        checked={isInCollection}
                        onChange={() =>
                          handleToggleCollectionItem(collection.id)
                        }
                      />
                      <span>{collection.name}</span>
                      <span className="collection-count">
                        ({collection.items.length})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Episodes for series */}
        {!isMovie &&
          seriesDetails.seasons &&
          seriesDetails.seasons.length > 0 && (
            <div className="details-section details-episodes">
              <div className="episodes-header">
                <h2>Episodes</h2>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
                  className="season-select"
                >
                  {seriesDetails.seasons
                    .filter((s) => s.seasonNumber > 0)
                    .map((season) => (
                      <option key={season.id} value={season.seasonNumber}>
                        Season {season.seasonNumber}
                      </option>
                    ))}
                </select>
              </div>

              <div className="episodes-list">
                {episodes.map((episode) => {
                  const watchProgress = id
                    ? getWatchProgress(
                        id,
                        selectedSeason,
                        episode.episodeNumber,
                      )
                    : undefined;
                  const isWatched = watchProgress && watchProgress.progress > 0;
                  const shouldBlur =
                    blurUnwatchedEpisodes && !isWatched && episode.still;

                  return (
                    <div
                      key={episode.id}
                      className={`episode-card${selectedEpisode?.season === selectedSeason && selectedEpisode?.episode === episode.episodeNumber ? " episode-card-selected" : ""}`}
                      onClick={() =>
                        handleEpisodeClick(
                          selectedSeason,
                          episode.episodeNumber,
                          episode.name,
                        )
                      }
                    >
                      <div
                        className={`episode-thumbnail ${shouldBlur ? "episode-thumbnail-blur" : ""}`}
                      >
                        {episode.still ? (
                          <img src={episode.still} alt={episode.name} />
                        ) : (
                          <div className="episode-placeholder">
                            <Tv size={28} />
                          </div>
                        )}
                        <div className="episode-play">
                          <Play size={20} />
                        </div>
                        {watchProgress && watchProgress.progress > 0 && (
                          <div className="episode-progress-bar">
                            <div
                              className="episode-progress-fill"
                              style={{ width: `${watchProgress.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="episode-info">
                        <span className="episode-number">
                          E{episode.episodeNumber}
                        </span>
                        <h4 className="episode-name">{episode.name}</h4>
                        {episode.overview && (
                          <p className="episode-overview">{episode.overview}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* Free tier upsell banner */}
        {!canUseNativeScrapers && torrents.length > 0 && (
          <div className="free-tier-upsell">
            <span>
              Found {torrents.length} result{torrents.length !== 1 ? "s" : ""}{" "}
              from 1 addon source
            </span>
            <Link to="/settings" className="upsell-link">
              FlowVid+ searches 12 sources →
            </Link>
          </div>
        )}

        {/* Torrent results — movies only; series uses the episode popup */}
        {isMovie && (torrents.length > 0 || isSearchingTorrents) && (
          <div className="details-section details-torrents" ref={torrentsRef}>
            <div className="torrents-header">
              <h2>
                {isSearchingTorrents
                  ? "Searching Sources..."
                  : `Available Sources (${torrents.length})`}
              </h2>
              {!isSearchingTorrents && torrents.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleSearchTorrents(false)}
                >
                  Refresh
                </button>
              )}
            </div>

            {isSearchingTorrents && (
              <div className="torrents-loading">
                <div className="spinner"></div>
                <span>Searching across providers...</span>
              </div>
            )}

            {!isSearchingTorrents && torrents.length > 0 && (
              <div className="torrents-list">
                {torrents.map((torrent) => {
                  const info = parseStreamInfo(torrent.title);
                  const isInstant = instantAvailability.get(torrent.infoHash);
                  return (
                    <div
                      key={torrent.id}
                      className={`torrent-card ${isInstant ? "torrent-card-instant" : ""}`}
                      onClick={() => handleTorrentPlay(torrent)}
                    >
                      <div className="torrent-card-left">
                        <div className="torrent-quality-col">
                          <span
                            className={`torrent-res-badge ${info.resolutionBadge === "4K" ? "res-4k" : info.resolutionBadge === "1080p" ? "res-1080p" : "res-other"}`}
                          >
                            {info.resolutionBadge}
                          </span>
                          {isInstant && (
                            <span className="instant-badge">
                              <Bolt size={10} /> Instant
                            </span>
                          )}
                        </div>
                        <div className="torrent-details-col">
                          <span className="torrent-title">{torrent.title}</span>
                          <div className="torrent-badges">
                            {info.hasDolbyVision && (
                              <DolbyVisionBadge height={16} />
                            )}
                            {info.hasHDR10Plus && (
                              <HDR10PlusBadge height={16} />
                            )}
                            {info.isHDR &&
                              !info.hasDolbyVision &&
                              !info.hasHDR10Plus &&
                              (info.hdrType === "HDR10" ? (
                                <HDR10Badge height={16} />
                              ) : (
                                <HDRBadge height={16} />
                              ))}
                            {info.hasAtmos && <DolbyAtmosBadge height={16} />}
                          </div>
                        </div>
                      </div>
                      <div className="torrent-card-right">
                        <div className="torrent-stats">
                          <span className="torrent-size">
                            {torrent.sizeFormatted}
                          </span>
                          <span className="torrent-seeds">
                            {torrent.seeds > 0 ? `${torrent.seeds} seeds` : ""}
                          </span>
                          <span className="torrent-provider">
                            {torrent.provider}
                          </span>
                        </div>
                        <button
                          className="btn btn-primary btn-sm torrent-play-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTorrentPlay(torrent);
                          }}
                        >
                          <Play size={12} /> Play
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Episode sources popup — series only */}
      {showEpisodePopup && selectedEpisode && (
        <div
          className="episode-popup-backdrop"
          onClick={() => setShowEpisodePopup(false)}
        >
          <div className="episode-popup" onClick={(e) => e.stopPropagation()}>
            <div className="episode-popup-header">
              <div>
                <div className="episode-popup-episode">
                  S{selectedEpisode.season}E{selectedEpisode.episode} &mdash;{" "}
                  {selectedEpisode.name}
                </div>
                <div className="episode-popup-subtitle">
                  {isSearchingTorrents
                    ? "Searching sources..."
                    : torrents.length > 0
                      ? `${torrents.length} source${torrents.length !== 1 ? "s" : ""} found`
                      : "No sources found"}
                </div>
              </div>
              <button
                className="episode-popup-close"
                onClick={() => setShowEpisodePopup(false)}
              >
                <X size={18} />
              </button>
            </div>

            {isSearchingTorrents && (
              <div className="torrents-loading">
                <div className="spinner"></div>
                <span>Searching across providers...</span>
              </div>
            )}

            {!isSearchingTorrents && torrents.length === 0 && (
              <div className="episode-popup-empty">
                No sources found for this episode.
              </div>
            )}

            {!isSearchingTorrents &&
              !canUseNativeScrapers &&
              torrents.length > 0 && (
                <div className="free-tier-upsell episode-popup-upsell">
                  <span>
                    Found {torrents.length} result
                    {torrents.length !== 1 ? "s" : ""} from 1 addon source
                  </span>
                  <Link to="/settings" className="upsell-link">
                    FlowVid+ searches 12 sources →
                  </Link>
                </div>
              )}

            {!isSearchingTorrents && torrents.length > 0 && (
              <div className="episode-popup-list">
                {torrents.map((torrent) => {
                  const info = parseStreamInfo(torrent.title);
                  const isInstant = instantAvailability.get(torrent.infoHash);
                  return (
                    <div
                      key={torrent.id}
                      className={`torrent-card ${isInstant ? "torrent-card-instant" : ""}`}
                      onClick={() => {
                        setShowEpisodePopup(false);
                        handleTorrentPlay(torrent);
                      }}
                    >
                      <div className="torrent-card-left">
                        <div className="torrent-quality-col">
                          <span
                            className={`torrent-res-badge ${info.resolutionBadge === "4K" ? "res-4k" : info.resolutionBadge === "1080p" ? "res-1080p" : "res-other"}`}
                          >
                            {info.resolutionBadge}
                          </span>
                          {isInstant && (
                            <span className="instant-badge">
                              <Bolt size={10} /> Instant
                            </span>
                          )}
                        </div>
                        <div className="torrent-details-col">
                          <span className="torrent-title">{torrent.title}</span>
                          <div className="torrent-badges">
                            {info.hasDolbyVision && (
                              <DolbyVisionBadge height={16} />
                            )}
                            {info.hasHDR10Plus && (
                              <HDR10PlusBadge height={16} />
                            )}
                            {info.isHDR &&
                              !info.hasDolbyVision &&
                              !info.hasHDR10Plus &&
                              (info.hdrType === "HDR10" ? (
                                <HDR10Badge height={16} />
                              ) : (
                                <HDRBadge height={16} />
                              ))}
                            {info.hasAtmos && <DolbyAtmosBadge height={16} />}
                          </div>
                        </div>
                      </div>
                      <div className="torrent-card-right">
                        <div className="torrent-stats">
                          <span className="torrent-size">
                            {torrent.sizeFormatted}
                          </span>
                          <span className="torrent-seeds">
                            {torrent.seeds > 0 ? `${torrent.seeds} seeds` : ""}
                          </span>
                          <span className="torrent-provider">
                            {torrent.provider}
                          </span>
                        </div>
                        <button
                          className="btn btn-primary btn-sm torrent-play-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowEpisodePopup(false);
                            handleTorrentPlay(torrent);
                          }}
                        >
                          <Play size={12} /> Play
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
