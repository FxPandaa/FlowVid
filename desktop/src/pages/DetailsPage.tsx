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
  tmdbService,
  TmdbEnrichedData,
  TmdbEpisodeRating,
} from "../services";
import { PersonModal } from "../components";
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
  ChevronLeft,
  ChevronRight,
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
  const [enrichedData, setEnrichedData] = useState<TmdbEnrichedData | null>(
    null,
  );
  const [episodeRatings, setEpisodeRatings] = useState<
    Map<number, TmdbEpisodeRating>
  >(new Map());
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [activeTrailer, setActiveTrailer] = useState<{ key: string; name: string } | null>(null);

  const trailersRef = useRef<HTMLDivElement>(null);
  const castRef = useRef<HTMLDivElement>(null);
  const recommendationsRef = useRef<HTMLDivElement>(null);

  const {
    isInLibrary,
    addToLibrary,
    removeFromLibrary,
    toggleFavorite,
    toggleWatchlist,
    library,
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

  useEffect(() => {
    if (id) {
      loadDetails(id);
    }
  }, [id, type]);

  // Fetch TMDB enrichment (cast photos, trailers) in parallel — non-blocking
  useEffect(() => {
    if (!id || !type) return;
    setEnrichedData(null);
    tmdbService
      .getEnrichedData(id, type as "movie" | "series")
      .then((data) => setEnrichedData(data))
      .catch(() => {});
  }, [id, type]);

  // Fetch episode ratings for current season from TMDB
  useEffect(() => {
    if (!id || type !== "series") return;
    setEpisodeRatings(new Map());
    tmdbService
      .getSeasonRatings(id, "series", selectedSeason)
      .then((ratings) => {
        const map = new Map<number, TmdbEpisodeRating>();
        for (const r of ratings) {
          map.set(r.episode, r);
        }
        setEpisodeRatings(map);
      })
      .catch(() => {});
  }, [id, type, selectedSeason]);

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
    _scrollAfter = false,
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

  // ── Helpers for rich metadata display ──
  const formatCurrency = (amount: number | null) => {
    if (!amount) return null;
    if (amount >= 1_000_000_000)
      return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

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
              <span className="meta-item meta-rating-imdb">
                <img
                  className="imdb-logo"
                  src="https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg"
                  alt="IMDb"
                />
                {details.rating.toFixed(1)}
              </span>
            )}

            {enrichedData?.runtime && (
              <span className="meta-item">
                {(() => {
                  const h = Math.floor(enrichedData.runtime / 60);
                  const m = enrichedData.runtime % 60;
                  return [h > 0 ? `${h}h` : "", m > 0 ? `${m}m` : ""]
                    .filter(Boolean)
                    .join(" ");
                })()}
              </span>
            )}
            {!enrichedData?.runtime &&
              isMovie &&
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
            {enrichedData?.numberOfEpisodes && (
              <span className="meta-item">
                {enrichedData.numberOfEpisodes} Episodes
              </span>
            )}
            {details.genres &&
              details.genres.slice(0, 3).map((genre) => (
                <span key={genre} className="meta-item details-meta-genres">
                  {genre}
                </span>
              ))}


          </div>

          {enrichedData?.tagline && (
            <p className="details-tagline">{enrichedData.tagline}</p>
          )}

          <p className="details-overview">{details.overview}</p>

          <div className="details-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                if (isMovie) {
                  setTorrents([]);
                  setInstantAvailability(new Map());
                  setShowEpisodePopup(true);
                  handleSearchTorrents(false);
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
              onClick={() => {
                if (isMovie) {
                  setTorrents([]);
                  setInstantAvailability(new Map());
                  setShowEpisodePopup(true);
                  handleSearchTorrents(false);
                }
              }}
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


        {/* Trailers — from TMDB */}
        {enrichedData &&
          enrichedData.trailers.length > 0 && (
            <div className="details-section">
              <h2 className="section-title">Trailers</h2>
              <div className="details-scroll-wrapper">
                <button
                  className="details-scroll-btn details-scroll-left"
                  onClick={() => trailersRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}
                  aria-label="Scroll left"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="trailers-row" ref={trailersRef}>
                  {enrichedData.trailers.map((trailer) => (
                  <div
                    key={trailer.id}
                    className="trailer-card"
                    onClick={() => setActiveTrailer({ key: trailer.key, name: trailer.name })}
                  >
                    <div className="trailer-thumb">
                      <img
                        src={`https://i.ytimg.com/vi/${trailer.key}/mqdefault.jpg`}
                        alt={trailer.name}
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="trailer-play-overlay trailer-play-always">
                        <Play size={24} />
                      </div>
                    </div>
                    <span className="trailer-name">{trailer.name}</span>
                    <span className="trailer-type">
                      {trailer.type}
                      {trailer.official ? " · Official" : ""}
                    </span>
                  </div>
                ))}
              </div>
                <button
                  className="details-scroll-btn details-scroll-right"
                  onClick={() => trailersRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}
                  aria-label="Scroll right"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

        {/* Cast & Crew — from TMDB (photos + character names) — clickable for person details */}
        {enrichedData &&
          enrichedData.cast.length > 0 && (
            <div className="details-section">
              <h2 className="section-title">Cast</h2>
              <div className="details-scroll-wrapper">
                <button
                  className="details-scroll-btn details-scroll-left"
                  onClick={() => castRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}
                  aria-label="Scroll left"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="cast-row" ref={castRef}>
                  {enrichedData.cast.map((member) => (
                  <div
                    key={member.id}
                    className="cast-card cast-card-clickable"
                    onClick={() => setSelectedPersonId(member.id)}
                  >
                    <div className="cast-photo">
                      {member.profilePhoto ? (
                        <img
                          src={member.profilePhoto}
                          alt={member.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="cast-photo-placeholder">
                          {member.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <span className="cast-name">{member.name}</span>
                    {member.character && (
                      <span className="cast-character">
                        {member.character}
                      </span>
                    )}
                  </div>
                ))}
              </div>
                <button
                  className="details-scroll-btn details-scroll-right"
                  onClick={() => castRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}
                  aria-label="Scroll right"
                >
                  <ChevronRight size={18} />
                </button>
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
                  const epRating = episodeRatings.get(episode.episodeNumber);

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
                          <img src={episode.still} alt={episode.name} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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
                        <div className="episode-info-header">
                          <span className="episode-number">
                            E{episode.episodeNumber}
                          </span>
                          {epRating && epRating.rating > 0 && (
                            <span className="episode-rating">
                              <StarFilled size={10} />{" "}
                              {epRating.rating.toFixed(1)}
                            </span>
                          )}
                          {epRating?.runtime && (
                            <span className="episode-runtime">
                              {epRating.runtime}m
                            </span>
                          )}
                        </div>
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

        {/* Networks (TV) — streaming platform logos */}
        {enrichedData &&
          enrichedData.networks.length > 0 && (
            <div className="details-section">
              <h2 className="section-title">Networks</h2>
              <div className="logos-row">
                {enrichedData.networks.map((network) => (
                  <div key={network.id} className="logo-chip">
                    {network.logoUrl ? (
                      <img
                        src={network.logoUrl}
                        alt={network.name}
                        title={network.name}
                        loading="lazy"
                      />
                    ) : (
                      <span className="logo-chip-text">{network.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Production Companies */}
        {enrichedData &&
          enrichedData.productionCompanies.length > 0 && (
            <div className="details-section">
              <h2 className="section-title">Production</h2>
              <div className="logos-row">
                {enrichedData.productionCompanies.map((company) => (
                  <div key={company.id} className="logo-chip">
                    {company.logoUrl ? (
                      <img
                        src={company.logoUrl}
                        alt={company.name}
                        title={company.name}
                        loading="lazy"
                      />
                    ) : (
                      <span className="logo-chip-text">{company.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Additional details — budget, revenue, origin, dates */}
        {enrichedData &&
          (enrichedData.budget ||
            enrichedData.revenue ||
            enrichedData.originCountry.length > 0 ||
            enrichedData.firstAirDate ||
            enrichedData.lastAirDate) && (
            <div className="details-section">
              <h2 className="section-title">Details</h2>
              <div className="details-facts-grid">
                {enrichedData.originCountry.length > 0 && (
                  <div className="fact-item">
                    <span className="fact-label">Origin</span>
                    <span className="fact-value">
                      {enrichedData.originCountry.join(", ")}
                    </span>
                  </div>
                )}
                {enrichedData.originalLanguage && (
                  <div className="fact-item">
                    <span className="fact-label">Language</span>
                    <span className="fact-value">
                      {enrichedData.originalLanguage.toUpperCase()}
                    </span>
                  </div>
                )}
                {enrichedData.firstAirDate && (
                  <div className="fact-item">
                    <span className="fact-label">First Aired</span>
                    <span className="fact-value">
                      {formatDate(enrichedData.firstAirDate)}
                    </span>
                  </div>
                )}
                {enrichedData.lastAirDate && (
                  <div className="fact-item">
                    <span className="fact-label">Last Aired</span>
                    <span className="fact-value">
                      {formatDate(enrichedData.lastAirDate)}
                    </span>
                  </div>
                )}
                {enrichedData.budget != null && enrichedData.budget > 0 && (
                  <div className="fact-item">
                    <span className="fact-label">Budget</span>
                    <span className="fact-value">
                      {formatCurrency(enrichedData.budget)}
                    </span>
                  </div>
                )}
                {enrichedData.revenue != null && enrichedData.revenue > 0 && (
                  <div className="fact-item">
                    <span className="fact-label">Revenue</span>
                    <span className="fact-value">
                      {formatCurrency(enrichedData.revenue)}
                    </span>
                  </div>
                )}
                {enrichedData.status && (
                  <div className="fact-item">
                    <span className="fact-label">Status</span>
                    <span
                      className={`fact-value fact-status-${enrichedData.status.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {enrichedData.status}
                    </span>
                  </div>
                )}
                {(() => {
                  const directors = enrichedData.crew?.filter(c => c.job === "Director") || [];
                  const directorNames = directors.length > 0
                    ? directors.map(d => d.name)
                    : (details.director || []);
                  if (directorNames.length > 0) {
                    return (
                      <div className="fact-item">
                        <span className="fact-label">
                          {directorNames.length > 1 ? "Directors" : "Director"}
                        </span>
                        <span className="fact-value">{directorNames.join(", ")}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}

        {/* More Like This — recommendations */}
        {enrichedData &&
          enrichedData.recommendations.length > 0 && (
            <div className="details-section">
              <h2 className="section-title">More Like This</h2>
              <div className="details-scroll-wrapper">
                <button
                  className="details-scroll-btn details-scroll-left"
                  onClick={() => recommendationsRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}
                  aria-label="Scroll left"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="recommendations-row" ref={recommendationsRef}>
                  {enrichedData.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="recommendation-card"
                    onClick={async () => {
                      const imdbId = await tmdbService.resolveImdbId(
                        rec.id,
                        rec.type,
                      );
                      if (imdbId) {
                        navigate(`/details/${rec.type}/${imdbId}`);
                      }
                    }}
                  >
                    <div className="recommendation-poster">
                      {rec.posterUrl ? (
                        <img
                          src={rec.posterUrl}
                          alt={rec.title}
                          loading="lazy"
                        />
                      ) : (
                        <div className="recommendation-poster-placeholder">
                          {rec.title.slice(0, 2)}
                        </div>
                      )}
                      {rec.rating > 0 && (
                        <span className="recommendation-rating">
                          <StarFilled size={10} /> {rec.rating}
                        </span>
                      )}
                    </div>
                    <span className="recommendation-title">{rec.title}</span>
                    {rec.releaseDate && (
                      <span className="recommendation-year">
                        {rec.releaseDate.split("-")[0]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
                <button
                  className="details-scroll-btn details-scroll-right"
                  onClick={() => recommendationsRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}
                  aria-label="Scroll right"
                >
                  <ChevronRight size={18} />
                </button>
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

      </div>

      {/* Sources popup — movies & series */}
      {showEpisodePopup && (selectedEpisode || isMovie) && (
        <div
          className="episode-popup-backdrop"
          onClick={() => setShowEpisodePopup(false)}
        >
          <div className="episode-popup" onClick={(e) => e.stopPropagation()}>
            <div className="episode-popup-header">
              <div>
                <div className="episode-popup-episode">
                  {isMovie
                    ? details?.title
                    : `S${selectedEpisode!.season}E${selectedEpisode!.episode} \u2014 ${selectedEpisode!.name}`}
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

      {/* YouTube trailer embed modal */}
      {activeTrailer && (
        <div
          className="trailer-modal-backdrop"
          onClick={() => setActiveTrailer(null)}
        >
          <div className="trailer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trailer-modal-header">
              <span className="trailer-modal-title">{activeTrailer.name}</span>
              <button
                className="trailer-modal-close"
                onClick={() => setActiveTrailer(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="trailer-modal-player">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeTrailer.key}?autoplay=1&rel=0&modestbranding=1`}
                title={activeTrailer.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* Person detail modal */}
      {selectedPersonId && (
        <PersonModal
          personId={selectedPersonId}
          onClose={() => setSelectedPersonId(null)}
        />
      )}
    </div>
  );
}
