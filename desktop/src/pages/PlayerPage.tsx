import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  cinemetaService,
  searchTorrents,
  debridService,
  TorrentResult,
  openSubtitlesService,
  Subtitle,
  createSubtitleBlobUrl,
  adjustSubtitleTiming,
  skipIntroService,
} from "../services";
import type { SkipSegment } from "../services";
import { useLibraryStore, useSettingsStore } from "../stores";
import {
  SubtitleSelector,
  SubtitleOverlay,
  AudioTrackSelector,
  AudioTrack,
  EmbeddedMpvPlayer,
} from "../components";
import { parseStreamInfo } from "../utils/streamParser";
import { embeddedMpvService } from "../services/embeddedMpvService";
import {
  AlertTriangle,
  ArrowLeft,
  Play,
  Pause,
  VolumeX,
  Volume1,
  Volume2,
  SkipForward,
  Maximize,
  Minimize,
  X,
  Tv,
  DolbyVisionBadge,
  HDR10Badge,
  HDR10PlusBadge,
  DolbyAtmosBadge,
  HDRBadge,
} from "../components/Icons";
import "./PlayerPage.css";

export function PlayerPage() {
  const { type, id, season, episode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [torrents, setTorrents] = useState<TorrentResult[]>([]);
  const [selectedTorrent, setSelectedTorrent] = useState<TorrentResult | null>(
    null,
  );
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showStreamInfo, setShowStreamInfo] = useState(false);
  const [useEmbeddedMpv, setUseEmbeddedMpv] = useState(false);

  // Subtitle state
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<Subtitle | null>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
  const [hasEmbeddedSubtitleTracks, setHasEmbeddedSubtitleTracks] =
    useState(false);
  const [mpvSubtitleId, setMpvSubtitleId] = useState<string | null>(null);
  const [mpvSubtitleOffset, setMpvSubtitleOffset] = useState(0);

  // Audio track state
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<string | null>(null);

  // Player controls — default to true since we autoplay
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [contentDetails, setContentDetails] = useState<any>(null);
  const [showEpisodeMenu, setShowEpisodeMenu] = useState(false);
  const [seriesEpisodes, setSeriesEpisodes] = useState<any[]>([]);

  // Tracks how many times we've retried fetching the stream URL (to detect expired links)
  const [streamRetryCount, setStreamRetryCount] = useState(0);

  // Ref: fire stream-info overlay exactly once per load
  const playbackReadyFiredRef = useRef(false);

  // Skip intro state
  const [skipSegments, setSkipSegments] = useState<SkipSegment[]>([]);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const activeSkipRef = useRef<SkipSegment | null>(null);

  const { updateWatchProgress, getWatchProgress, removeFromHistory, addToLibrary, isInLibrary, markItemWatched } = useLibraryStore();
  const {
    activeDebridService,
    autoPlay,
    subtitleAppearance,
    blurUnwatchedEpisodes,
    playerType,
    preferredAudioLanguage,
    preferredSubtitleLanguage,
  } = useSettingsStore();

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  // ── Local-first sync refs ──────────────────────────────────────────────
  // Always-fresh position/duration for server sync interval (avoids stale closures)
  const latestPosRef = useRef({ pos: 0, dur: 0 });
  // Server sync interval handle
  const serverSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable ref to latest saveProgress function (for setInterval / event listeners)
  const saveProgressRef = useRef<(localOnly?: boolean) => void>(() => {});
  // Track last MPV local save position
  const lastMpvLocalSavePos = useRef(0);

  // Generate CSS custom properties for subtitle styling (with fallbacks for older settings)
  const subtitleStyles = {
    "--subtitle-font-size": `${subtitleAppearance.fontSize ?? 22}px`,
    "--subtitle-font-family": subtitleAppearance.fontFamily ?? "sans-serif",
    "--subtitle-text-color": subtitleAppearance.textColor ?? "#FFFFFF",
    "--subtitle-bg-color": subtitleAppearance.backgroundColor ?? "#000000",
    "--subtitle-bg-opacity": subtitleAppearance.backgroundOpacity ?? 0.75,
    "--subtitle-text-shadow": subtitleAppearance.textShadow
      ? "2px 2px 4px rgba(0,0,0,0.8)"
      : "none",
    "--subtitle-line-height": subtitleAppearance.lineHeight ?? 1.4,
    "--subtitle-bottom-position": `${subtitleAppearance.bottomPosition ?? 10}%`,
  } as React.CSSProperties;

  // Track whether we already marked this content as finished (prevent duplicate calls)
  const markedFinishedRef = useRef(false);

  // Mark content as fully watched: save 100%, remove from CW, add to library
  const markAsFinished = () => {
    if (markedFinishedRef.current || !contentDetails || !id) return;
    markedFinishedRef.current = true;

    // Save final progress = 100
    updateWatchProgress({
      imdbId: id,
      type: type as "movie" | "series",
      title: contentDetails.title,
      poster: contentDetails.poster,
      backdrop: contentDetails.backdrop || contentDetails.background,
      season: season ? parseInt(season) : undefined,
      episode: episode ? parseInt(episode) : undefined,
      progress: 100,
      duration: Math.round(latestPosRef.current.dur || duration),
      currentTime: Math.round(latestPosRef.current.dur || duration),
    });

    // Remove from continue watching
    const existing = getWatchProgress(
      id,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined,
    );
    if (existing) removeFromHistory(existing.id);

    // Auto-add to library if not already there
    if (!isInLibrary(id)) {
      addToLibrary({
        imdbId: id,
        type: type as "movie" | "series",
        title: contentDetails.title,
        year: contentDetails.year || new Date().getFullYear(),
        poster: contentDetails.poster,
        backdrop: contentDetails.backdrop || contentDetails.background,
        rating: contentDetails.rating,
        genres: contentDetails.genres,
        runtime: type === "movie" ? Number(contentDetails.runtime) || undefined : undefined,
      });
    }

    // Mark as watched in library
    markItemWatched(id);
  };

  // Save progress with all preferences
  // localOnly = true  → saves to localStorage only (via zustand persist), no server sync
  // localOnly = false → saves to localStorage AND triggers debounced server sync
  const saveProgress = (localOnly = false) => {
    // Prefer ref values (always fresh) over state (may be stale in intervals)
    const pos = latestPosRef.current.pos || currentTime;
    const dur = latestPosRef.current.dur || duration;

    if (!contentDetails || !id || dur === 0) return;

    const progress = Math.round((pos / dur) * 100);
    if (progress < 1) return; // Don't save if barely started

    // Auto-mark as finished when reaching ~95%
    if (progress >= 95) {
      markAsFinished();
      return;
    }

    updateWatchProgress(
      {
        imdbId: id,
        type: type as "movie" | "series",
        title: contentDetails.title,
        poster: contentDetails.poster,
        backdrop: contentDetails.backdrop || contentDetails.background,
        season: season ? parseInt(season) : undefined,
        episode: episode ? parseInt(episode) : undefined,
        progress,
        duration: Math.round(dur),
        // Save playback preferences for resuming
        currentTime: Math.round(pos),
        subtitleId: activeSubtitle?.id,
        subtitleOffset: subtitleOffset,
        audioTrackId: activeAudioTrack || undefined,
        // Save torrent source info for instant resume
        torrentInfoHash: selectedTorrent?.infoHash,
        torrentTitle: selectedTorrent?.title,
        torrentQuality: selectedTorrent?.quality,
        torrentProvider: selectedTorrent?.provider,
      },
      { localOnly },
    );
  };

  // Keep the ref always pointing at the latest version of saveProgress
  saveProgressRef.current = saveProgress;

  useEffect(() => {
    initializePlayer();

    // ── Server sync interval (60 s) ──────────────────────────────────────
    // Local saves happen every 5 s (free / instant).
    // This interval pushes to server every 60 s as a safety-net so
    // cross-device resume is never more than ~1 minute behind.
    serverSyncIntervalRef.current = setInterval(() => {
      saveProgressRef.current(false); // false = server sync
    }, 60_000);

    // ── Visibility-change handler ────────────────────────────────────────
    // Sync to server when the user switches away (alt-tab, minimize, etc.)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveProgressRef.current(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Save progress to server when leaving the player
      saveProgress();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (serverSyncIntervalRef.current)
        clearInterval(serverSyncIntervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [id, season, episode]);

  useEffect(() => {
    if (!id) return;

    const savedProgress = getWatchProgress(
      id,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined,
    );

    setMpvSubtitleId(savedProgress?.subtitleId || null);
    setMpvSubtitleOffset(savedProgress?.subtitleOffset || 0);
  }, [id, season, episode, getWatchProgress]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (videoRef.current) {
            if (videoRef.current.paused) {
              videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(
              0,
              videoRef.current.currentTime - 10,
            );
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.min(
              videoRef.current.duration || 0,
              videoRef.current.currentTime + 10,
            );
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = newVol;
            setVolume(newVol);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = newVol;
            setVolume(newVol);
          }
          break;
        case "KeyM":
          if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(videoRef.current.muted);
          }
          break;
        case "KeyF":
          if (document.fullscreenElement) {
            document.exitFullscreen();
            setIsFullscreen(false);
          } else {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
          }
          break;
        case "Escape":
          if (document.fullscreenElement) {
            document.exitFullscreen();
            setIsFullscreen(false);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Keep playing ref in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    // Hide controls after 3 seconds of inactivity
    if (showControls && isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }

    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls, isPlaying]);

  const waitForVideoMetadata = async () => {
    const video = videoRef.current;
    if (!video || video.readyState >= 1) {
      if (video) {
        setHasEmbeddedSubtitleTracks(video.textTracks.length > 0);
      }
      return;
    }

    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("loadeddata", done);
        resolve();
      };

      video.addEventListener("loadedmetadata", done, { once: true });
      video.addEventListener("loadeddata", done, { once: true });

      // Generous timeout for slow streaming connections
      setTimeout(() => {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("loadeddata", done);
        resolve();
      }, 3000);
    });

    if (videoRef.current) {
      setHasEmbeddedSubtitleTracks(videoRef.current.textTracks.length > 0);
    }
  };

  const initializePlayer = async () => {
    setIsLoading(true);
    setError(null);
    playbackReadyFiredRef.current = false;

    // Pre-initialize MPV in background while we fetch metadata & search
    if (playerType === "embedded-mpv") {
      embeddedMpvService.initialize().catch(() => {});
    }

    // Check if debrid is configured first
    if (activeDebridService === "none") {
      setError(
        "No debrid service configured. Please add an API key in Settings to stream content safely through Real-Debrid or AllDebrid.",
      );
      setIsLoading(false);
      return;
    }

    try {
      // Get content details - id is now IMDB ID
      const imdbId = id!;
      let details;
      let contentTitle = "";

      if (type === "movie") {
        details = await cinemetaService.getMovieDetails(imdbId);
        contentTitle = `${details.title} (${details.year})`;
      } else {
        details = await cinemetaService.getSeriesDetails(imdbId);
        const seasonNum = parseInt(season || "1");
        const episodeNum = parseInt(episode || "1");
        const episodes = await cinemetaService.getSeasonEpisodes(
          imdbId,
          seasonNum,
        );
        setSeriesEpisodes(episodes); // Store episodes for episode menu
        const currentEpisode = episodes.find(
          (e) => e.episodeNumber === episodeNum,
        );
        contentTitle = `${details.title} - S${seasonNum.toString().padStart(2, "0")}E${episodeNum.toString().padStart(2, "0")}`;
        if (currentEpisode) {
          contentTitle += ` - ${currentEpisode.name}`;
        }
      }

      setTitle(contentTitle);
      setContentDetails(details); // Save for progress tracking

      // Check if a torrent was passed in navigation state
      const stateTorrent = location.state?.torrent as TorrentResult | undefined;
      // Check for torrent preferences (used when switching episodes)
      const torrentPrefs = location.state?.torrentPrefs as
        | { quality: string; provider: string }
        | undefined;
      // Check for saved torrent from continue watching
      const savedTorrent = location.state?.savedTorrent as
        | {
            infoHash: string;
            title?: string;
            quality?: string;
            provider?: string;
          }
        | undefined;

      // Always search for alternative sources in background
      const searchPromise = searchTorrents({
        imdbId,
        type: type as "movie" | "series",
        title: details.title,
        year: details.year,
        season: season ? parseInt(season) : undefined,
        episode: episode ? parseInt(episode) : undefined,
      }).then((results) => {
        setTorrents(results);
        return results;
      });

      if (stateTorrent) {
        // Play the passed torrent immediately
        await loadStream(stateTorrent, details);
        // Wait for alternative sources to load in background
        searchPromise.catch(console.error);
      } else if (savedTorrent && imdbId) {
        // Continue watching: wait for search results and find the exact same torrent by infoHash
        const results = await searchPromise;

        if (results.length > 0) {
          // Find the exact torrent by infoHash
          let matchingTorrent = results.find(
            (t) => t.infoHash === savedTorrent.infoHash,
          );

          // If exact torrent not found, try matching quality + provider
          if (
            !matchingTorrent &&
            savedTorrent.quality &&
            savedTorrent.provider
          ) {
            matchingTorrent = results.find(
              (t) =>
                t.quality === savedTorrent.quality &&
                t.provider === savedTorrent.provider,
            );
          }

          // If still no match, try just matching quality
          if (!matchingTorrent && savedTorrent.quality) {
            matchingTorrent = results.find(
              (t) => t.quality === savedTorrent.quality,
            );
          }

          // If still no match, just pick the first one
          if (!matchingTorrent) {
            matchingTorrent = results[0];
          }

          // Auto-play the matching torrent
          await loadStream(matchingTorrent, details);
        } else {
          setError("No sources found for this content");
          setIsLoading(false);
        }
      } else if (torrentPrefs && imdbId) {
        // Episode switch: wait for search results and auto-select matching torrent
        const results = await searchPromise;

        if (results.length > 0) {
          // Find a torrent matching the previous preferences
          let matchingTorrent = results.find(
            (t) =>
              t.quality === torrentPrefs.quality &&
              t.provider === torrentPrefs.provider,
          );

          // If no exact match, try just matching quality
          if (!matchingTorrent) {
            matchingTorrent = results.find(
              (t) => t.quality === torrentPrefs.quality,
            );
          }

          // If still no match, just pick the first one
          if (!matchingTorrent) {
            matchingTorrent = results[0];
          }

          // Auto-play the matching torrent
          await loadStream(matchingTorrent, details);
        } else {
          setError("No sources found for this episode");
          setIsLoading(false);
        }
      } else if (imdbId) {
        // Wait for search results
        const results = await searchPromise;

        if (results.length > 0) {
          // Always show source picker so user can choose which torrent to watch
          setShowSourcePicker(true);
          setIsLoading(false);
        } else {
          setError("No sources found for this content");
          setIsLoading(false);
        }
      } else {
        setError("Content not available");
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Player initialization failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load content");
      setIsLoading(false);
    }
  };

  const loadStream = async (torrent: TorrentResult, _details?: any, forceRefresh = false) => {
    setSelectedTorrent(torrent);
    setShowSourcePicker(false);
    if (!forceRefresh) setStreamRetryCount(0);

    if (activeDebridService === "none") {
      setError(
        "No debrid service configured. Please add an API key in settings.",
      );
      setIsLoading(false);
      return;
    }

    try {
      const streamLink = await debridService.getStreamLink(torrent, forceRefresh);
      setStreamUrl(streamLink.url);
      playbackReadyFiredRef.current = false;

      // Check if we should use embedded MPV
      if (playerType === "embedded-mpv") {
        setUseEmbeddedMpv(true);
        // Keep isLoading true — cinematic loading screen stays until MPV
        // sends its first progress update (prevents black flash)
        // Safety timeout in case onProgress is slow (e.g. very large file)
        setTimeout(() => {
          if (!playbackReadyFiredRef.current) {
            playbackReadyFiredRef.current = true;
            setIsLoading(false);
          }
        }, 15_000);
        return;
      }

      // For built-in player: keep isLoading true — stays until onCanPlay fires

      // Load subtitles after getting stream
      loadSubtitles();

      if (autoPlay) {
        setTimeout(() => {
          videoRef.current?.play().catch((err) => {
            console.error("Auto-play failed:", err);
            // NotSupportedError on retry = genuine codec issue → switch to MPV
            if (err.name === "NotSupportedError" && streamRetryCount > 0) {
              console.warn("Built-in player cannot decode this format, switching to MPV...");
              setUseEmbeddedMpv(true);
            }
          });
        }, 100);
      }

      // Safety timeout: dismiss loading if playback never starts (e.g. very slow CDN)
      setTimeout(() => {
        if (!playbackReadyFiredRef.current) {
          playbackReadyFiredRef.current = true;
          setIsLoading(false);
        }
      }, 20_000);
    } catch (err) {
      console.error("Failed to get stream:", err);
      setError(
        err instanceof Error ? err.message : "Failed to get stream link",
      );
      setIsLoading(false);
    }
  };

  // Load subtitles from OpenSubtitles
  const loadSubtitles = async () => {
    if (!id) return;

    const { subtitles: subPrefs } = useSettingsStore.getState();

    // Check if auto-load is enabled
    if (!subPrefs.autoLoad) {
      console.log("Subtitle auto-load disabled");
      return;
    }

    setIsLoadingSubtitles(true);
    try {
      // Build language list: primary + secondaries
      const languages = [
        subPrefs.defaultLanguage,
        ...subPrefs.secondaryLanguages,
      ];

      const subs = await openSubtitlesService.search({
        imdbId: id,
        season: season ? parseInt(season) : undefined,
        episode: episode ? parseInt(episode) : undefined,
        languages: languages,
      });

      if (subs.length === 0) {
        console.log("No subtitles found for this content");
        setSubtitles([]);
        return;
      }

      setSubtitles(subs);

      await waitForVideoMetadata();

      const hasEmbeddedSubtitleTracks =
        !!videoRef.current?.textTracks &&
        videoRef.current.textTracks.length > 0;

      if (hasEmbeddedSubtitleTracks) {
        console.log(
          "Embedded subtitles detected; prioritizing embedded tracks over addon autoload.",
        );
        return;
      }

      // Check for saved subtitle preference
      const savedProgress = getWatchProgress(
        id,
        season ? parseInt(season) : undefined,
        episode ? parseInt(episode) : undefined,
      );

      // First try to restore previously selected subtitle
      if (savedProgress?.subtitleId) {
        const savedSubtitle = subs.find(
          (s) => s.id === savedProgress.subtitleId,
        );
        if (savedSubtitle) {
          console.log("Restoring saved subtitle:", savedSubtitle.fileName);
          // Restore saved offset
          if (savedProgress.subtitleOffset) {
            setSubtitleOffset(savedProgress.subtitleOffset);
          }
          await handleSubtitleSelect(savedSubtitle, true);
          return;
        }
      }

      // Otherwise, auto-load best rated subtitle (already sorted by rating, 10-star first)
      let bestSubtitle = subs[0];

      // Filter to default language first
      const defaultLangSubs = subs.filter(
        (s) => s.languageCode === subPrefs.defaultLanguage,
      );

      if (defaultLangSubs.length > 0) {
        // Prefer perfect 10-star rating in default language
        const perfectRatingSub = defaultLangSubs.find((s) => s.rating === 10);
        if (perfectRatingSub) {
          bestSubtitle = perfectRatingSub;
        } else {
          // Otherwise take the highest rated in default language
          bestSubtitle = defaultLangSubs[0];
        }

        // Override with hearing impaired if preferred
        if (subPrefs.preferHearingImpaired) {
          const hiSub = defaultLangSubs.find((s) => s.hearing_impaired);
          if (hiSub) {
            bestSubtitle = hiSub;
          }
        }
      }

      // Auto-load the best subtitle
      console.log(
        "Auto-loading best rated subtitle:",
        bestSubtitle.fileName,
        "Rating:",
        bestSubtitle.rating,
      );
      await handleSubtitleSelect(bestSubtitle, true);
    } catch (error) {
      console.error("Failed to load subtitles:", error);
      // Don't show error to user, subtitles are optional
    } finally {
      setIsLoadingSubtitles(false);
    }
  };

  // Handle subtitle selection
  const handleSubtitleSelect = async (
    subtitle: Subtitle | null,
    isAutoLoad: boolean = false,
  ) => {
    // Clean up previous subtitle URL
    if (subtitleUrl) {
      URL.revokeObjectURL(subtitleUrl);
      setSubtitleUrl(null);
    }

    if (!subtitle) {
      setActiveSubtitle(null);
      if (trackRef.current && videoRef.current) {
        const textTrack = videoRef.current.textTracks[0];
        if (textTrack) {
          textTrack.mode = "hidden";
        }
      }
      return;
    }

    try {
      // Download subtitle content
      const content = await openSubtitlesService.download(subtitle);

      // Apply saved sync offset if exists
      const videoId = `${id}-${season || "0"}-${episode || "0"}`;
      const savedOffset = useSettingsStore.getState().getSyncOffset(videoId);

      let vttContent = createSubtitleBlobUrl(content, subtitle.format);

      // If we have a saved offset, apply it
      if (savedOffset !== 0) {
        const response = await fetch(vttContent);
        const originalVtt = await response.text();
        const adjustedContent = adjustSubtitleTiming(originalVtt, savedOffset);

        URL.revokeObjectURL(vttContent);
        const newBlob = new Blob([adjustedContent], { type: "text/vtt" });
        vttContent = URL.createObjectURL(newBlob);
        setSubtitleOffset(savedOffset);
      }

      setSubtitleUrl(vttContent);
      setActiveSubtitle(subtitle);

      // Keep the native track hidden - we use custom SubtitleOverlay instead
      if (trackRef.current && videoRef.current) {
        const textTrack = videoRef.current.textTracks[0];
        if (textTrack) {
          textTrack.mode = "hidden";
        }
      }

      if (!isAutoLoad) {
        console.log("Subtitle loaded:", subtitle.fileName);
      }
    } catch (error) {
      console.error("Failed to load subtitle:", error);
    }
  };

  // Handle subtitle timing adjustment
  const handleSubtitleTimingAdjust = async (offsetSeconds: number) => {
    if (!activeSubtitle || !subtitleUrl) return;

    setSubtitleOffset(offsetSeconds);

    // Save offset to settings
    const videoId = `${id}-${season || "0"}-${episode || "0"}`;
    useSettingsStore.getState().setSyncOffset(videoId, offsetSeconds);

    try {
      // Re-download and adjust timing
      const content = await openSubtitlesService.download(activeSubtitle);
      const blobUrl = createSubtitleBlobUrl(content, activeSubtitle.format);

      // Adjust timing
      const response = await fetch(blobUrl);
      const vttContent = await response.text();
      const adjustedContent = adjustSubtitleTiming(vttContent, offsetSeconds);

      // Create new blob URL with adjusted content
      URL.revokeObjectURL(subtitleUrl);
      URL.revokeObjectURL(blobUrl);
      const newBlob = new Blob([adjustedContent], { type: "text/vtt" });
      const newBlobUrl = URL.createObjectURL(newBlob);

      setSubtitleUrl(newBlobUrl);

      // Keep native track hidden - we use custom SubtitleOverlay
      if (trackRef.current && videoRef.current) {
        trackRef.current.src = newBlobUrl;
        const textTrack = videoRef.current.textTracks[0];
        if (textTrack) {
          textTrack.mode = "hidden";
        }
      }
    } catch (error) {
      console.error("Failed to adjust subtitle timing:", error);
    }
  };

  // Detect and load audio tracks from video element
  const loadAudioTracks = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    // Wait for metadata to be loaded
    const handleLoadedMetadata = () => {
      // Check for native HTML5 audioTracks
      if (video.audioTracks && video.audioTracks.length > 0) {
        const tracks: AudioTrack[] = [];

        for (let i = 0; i < video.audioTracks.length; i++) {
          const track = video.audioTracks[i];
          tracks.push({
            id: track.id || i.toString(),
            label: track.label || `Audio Track ${i + 1}`,
            language: track.language || "und",
            kind: track.kind || "main",
            enabled: track.enabled,
          });
        }

        setAudioTracks(tracks);

        // Find active track
        const activeTrack = tracks.find((t) => t.enabled);
        if (activeTrack) {
          setActiveAudioTrack(activeTrack.id);
        }
      }
    };

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    } else {
      video.addEventListener("loadedmetadata", handleLoadedMetadata, {
        once: true,
      });
    }
  };

  // Handle audio track selection
  const handleAudioTrackSelect = (trackId: string) => {
    if (!videoRef.current || !videoRef.current.audioTracks) return;

    const video = videoRef.current;
    const audioTracks = video.audioTracks!;

    // Disable all tracks and enable selected one
    for (let i = 0; i < audioTracks.length; i++) {
      const track = audioTracks[i];
      const id = track.id || i.toString();
      track.enabled = id === trackId;
    }

    setActiveAudioTrack(trackId);
    console.log("Audio track switched to:", trackId);
  };

  const handleSelectSource = (torrent: TorrentResult) => {
    setIsLoading(true);
    setStreamRetryCount(0);
    loadStream(torrent, location.state?.details);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  // Track time updates — local save every 5 seconds, server sync is handled
  // by the 60-second interval + pause/unmount/visibility-change events
  const lastSaveRef = { current: 0 };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const newTime = videoRef.current.currentTime;
      const dur = videoRef.current.duration || 0;
      setCurrentTime(newTime);

      // Keep the position ref fresh for server-sync interval
      latestPosRef.current = { pos: newTime, dur };

      // Local-only save every 5 seconds of playback
      if (Math.floor(newTime) - lastSaveRef.current >= 5) {
        lastSaveRef.current = Math.floor(newTime);
        saveProgress(true); // true = local only
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        setShowControls(false);
      }
    }, 3000);
  }, []);

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Skip Intro ──────────────────────────────────────────────────────────
  // Fetch skip segments for series episodes
  useEffect(() => {
    if (type !== "series" || !id || !season || !episode) {
      setSkipSegments([]);
      return;
    }
    skipIntroService
      .getSkipSegments(id, parseInt(season), parseInt(episode))
      .then((segs) => setSkipSegments(segs))
      .catch(() => setSkipSegments([]));
  }, [id, type, season, episode]);

  // Show/hide the skip button based on current playback position
  useEffect(() => {
    if (skipSegments.length === 0) {
      setShowSkipButton(false);
      activeSkipRef.current = null;
      return;
    }
    const intro = skipSegments.find(
      (s) => s.type === "intro" || s.type === "mixed-intro",
    );
    if (!intro) {
      setShowSkipButton(false);
      activeSkipRef.current = null;
      return;
    }
    const inRange = currentTime >= intro.startTime && currentTime < intro.endTime;
    if (inRange) {
      activeSkipRef.current = intro;
      setShowSkipButton(true);
    } else {
      activeSkipRef.current = null;
      setShowSkipButton(false);
    }
  }, [currentTime, skipSegments]);

  const handleSkipIntro = () => {
    const seg = activeSkipRef.current;
    if (!seg) return;
    if (useEmbeddedMpv) {
      embeddedMpvService.seek(seg.endTime);
      setCurrentTime(seg.endTime);
    } else if (videoRef.current) {
      videoRef.current.currentTime = seg.endTime;
      setCurrentTime(seg.endTime);
    }
    setShowSkipButton(false);
  };

  const handleBack = () => {
    // Navigate back to the details page instead of going back in history
    if (id && type) {
      navigate(`/details/${type}/${id}`);
    } else {
      navigate("/");
    }
  };

  // Navigate to next episode (for series only)
  const handleNextEpisode = async () => {
    if (type !== "series" || !id || !season || !episode) return;

    const currentSeason = parseInt(season);
    const currentEpisode = parseInt(episode);

    try {
      // Get episodes for current season
      const episodes = await cinemetaService.getSeasonEpisodes(
        id,
        currentSeason,
      );
      const nextEpisodeNum = currentEpisode + 1;

      // Check if there's a next episode in current season
      const nextEp = episodes.find((e) => e.episodeNumber === nextEpisodeNum);

      if (nextEp) {
        // Navigate to next episode, passing the same torrent source pattern
        navigate(`/player/series/${id}/${currentSeason}/${nextEpisodeNum}`, {
          state: { torrent: selectedTorrent },
        });
      } else {
        // Try next season
        const details = await cinemetaService.getSeriesDetails(id);
        const nextSeasonNum = currentSeason + 1;
        const nextSeason = details.seasons?.find(
          (s) => s.seasonNumber === nextSeasonNum,
        );

        if (nextSeason) {
          navigate(`/player/series/${id}/${nextSeasonNum}/1`, {
            state: { torrent: selectedTorrent },
          });
        }
      }
    } catch (err) {
      console.error("Failed to load next episode:", err);
    }
  };

  return (
    <div
      className={`player-page${!showControls && !useEmbeddedMpv ? " cursor-hidden" : ""}`}
      onMouseMove={handleMouseMove}
      style={subtitleStyles}
    >
      {/* Embedded MPV Player - fullscreen when active */}
      {useEmbeddedMpv && streamUrl && (
        <EmbeddedMpvPlayer
          url={streamUrl}
          title={title}
          imdbId={id || undefined}
          season={season ? parseInt(season) : undefined}
          episode={episode ? parseInt(episode) : undefined}
          autoPlay={autoPlay}
          preferredAudioLang={preferredAudioLanguage}
          preferredSubtitleLang={preferredSubtitleLanguage}
          initialPosition={(() => {
            // Check for saved progress
            const saved = getWatchProgress(
              id!,
              season ? parseInt(season) : undefined,
              episode ? parseInt(episode) : undefined,
            );
            return saved?.currentTime;
          })()}
          onClose={() => {
            setUseEmbeddedMpv(false);
            navigate(-1);
          }}
          onEnded={() => {
            markAsFinished();
            // Auto-play next episode if enabled
            if (type === "series" && seriesEpisodes.length > 0) {
              const currentEpNum = parseInt(episode || "1");
              const nextEp = seriesEpisodes.find(
                (e) => e.episodeNumber === currentEpNum + 1,
              );
              if (nextEp) {
                markedFinishedRef.current = false; // Reset for next episode
                navigate(
                  `/player/${type}/${id}/${season}/${currentEpNum + 1}`,
                  {
                    state: {
                      torrentPrefs: selectedTorrent
                        ? {
                            quality: selectedTorrent.quality,
                            provider: selectedTorrent.provider,
                          }
                        : undefined,
                    },
                  },
                );
                return;
              }
            }
            navigate(-1);
          }}
          onProgress={(position, dur) => {
            // Dismiss cinematic loading screen once MPV is actually playing
            // (position > 0 means frames are decoding, or dur > 0 means demux started)
            if (!playbackReadyFiredRef.current && (position > 0 || dur > 0)) {
              playbackReadyFiredRef.current = true;
              setIsLoading(false);
              setShowStreamInfo(true);
              setTimeout(() => setShowStreamInfo(false), 4000);
            }

            // Update state for display
            setCurrentTime(position);
            setDuration(dur);

            // Keep the position ref fresh for server-sync interval
            latestPosRef.current = { pos: position, dur };

            // Local-only save every 5 seconds of playback position
            if (Math.floor(position) - lastMpvLocalSavePos.current >= 5) {
              lastMpvLocalSavePos.current = Math.floor(position);
              if (!contentDetails || !id || dur === 0) return;
              const progress = Math.round((position / dur) * 100);
              if (progress < 1) return;
              // Auto-mark as finished at ~95%
              if (progress >= 95) {
                markAsFinished();
                return;
              }
              updateWatchProgress(
                {
                  imdbId: id,
                  type: type as "movie" | "series",
                  title: contentDetails.title,
                  poster: contentDetails.poster,
                  backdrop: contentDetails.backdrop || contentDetails.background,
                  season: season ? parseInt(season) : undefined,
                  episode: episode ? parseInt(episode) : undefined,
                  progress,
                  duration: Math.round(dur),
                  currentTime: Math.round(position),
                  subtitleId: mpvSubtitleId || undefined,
                  subtitleOffset: mpvSubtitleOffset,
                  torrentInfoHash: selectedTorrent?.infoHash,
                  torrentTitle: selectedTorrent?.title,
                  torrentQuality: selectedTorrent?.quality,
                  torrentProvider: selectedTorrent?.provider,
                },
                { localOnly: true },
              );
            }
          }}
          onError={(err) => {
            console.error("Embedded MPV error:", err);
            setError(err);
            setUseEmbeddedMpv(false);
          }}
          // Episode navigation for series
          isSeries={type === "series"}
          currentEpisode={episode ? parseInt(episode) : undefined}
          episodes={seriesEpisodes.map((ep) => {
            const watchProgress = id
              ? getWatchProgress(id, parseInt(season || "1"), ep.episodeNumber)
              : undefined;
            return {
              id: ep.id,
              episodeNumber: ep.episodeNumber,
              name: ep.name,
              still: ep.still,
              progress: watchProgress?.progress,
            };
          })}
          onEpisodeSelect={(epNum) => {
            if (selectedTorrent) {
              navigate(`/player/series/${id}/${season}/${epNum}`, {
                state: {
                  torrentPrefs: {
                    quality: selectedTorrent.quality,
                    provider: selectedTorrent.provider,
                  },
                },
              });
            }
          }}
          onNextEpisode={() => {
            const currentEpNum = parseInt(episode || "1");
            const nextEp = seriesEpisodes.find(
              (e) => e.episodeNumber === currentEpNum + 1,
            );
            if (nextEp && selectedTorrent) {
              navigate(`/player/series/${id}/${season}/${currentEpNum + 1}`, {
                state: {
                  torrentPrefs: {
                    quality: selectedTorrent.quality,
                    provider: selectedTorrent.provider,
                  },
                },
              });
            }
          }}
          blurUnwatched={blurUnwatchedEpisodes}
          initialSubtitleId={mpvSubtitleId}
          initialSubtitleOffset={mpvSubtitleOffset}
          onSubtitleSelectionChange={setMpvSubtitleId}
          onSubtitleOffsetChange={setMpvSubtitleOffset}
        />
      )}

      {/* Skip Intro button for MPV player */}
      {useEmbeddedMpv && showSkipButton && (
        <button className="skip-intro-btn" onClick={handleSkipIntro}>
          <SkipForward size={14} /> Skip Intro
        </button>
      )}

      {isLoading && (
        <div className="player-loading">
          {/* Fluid aurora background */}
          <div className="aurora-container">
            <div className="aurora-blob aurora-blob-1" />
            <div className="aurora-blob aurora-blob-2" />
            <div className="aurora-blob aurora-blob-3" />
            <div className="aurora-blob aurora-blob-4" />
          </div>

          {/* Movie/series poster that breathes in and out through the aurora */}
          {contentDetails?.background || contentDetails?.backdrop ? (
            <div className="aurora-poster-wrap">
              <img
                className="aurora-poster"
                src={contentDetails.background || contentDetails.backdrop}
                alt=""
              />
            </div>
          ) : null}

          {/* Floating light particles */}
          <div className="aurora-particles">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="aurora-particle" style={{
                '--i': i,
                '--x': `${10 + Math.random() * 80}%`,
                '--y': `${10 + Math.random() * 80}%`,
                '--d': `${4 + Math.random() * 6}s`,
                '--s': `${2 + Math.random() * 3}px`,
              } as React.CSSProperties} />
            ))}
          </div>

          {/* Logo / title */}
          <div className="aurora-title-wrap">
            {contentDetails?.logo ? (
              <img
                className="aurora-logo"
                src={contentDetails.logo}
                alt={contentDetails.title || ""}
              />
            ) : (
              <p className="aurora-title">{title || "Loading stream..."}</p>
            )}
            <div className="aurora-loader-bar">
              <div className="aurora-loader-fill" />
            </div>
          </div>
        </div>
      )}

      {/* Stream Info Overlay – shows for both built-in and MPV player */}
      {showStreamInfo && selectedTorrent && (
        <div className="stream-info-overlay">
          {(() => {
            const info = parseStreamInfo(selectedTorrent.title);
            return (
              <div className="stream-info-content">
                <div className="stream-info-badges">
                  <span
                    className={`stream-badge badge-resolution ${info.resolutionBadge === "4K" ? "badge-4k" : ""}`}
                  >
                    {info.resolutionBadge}
                  </span>
                  {info.hasDolbyVision && <DolbyVisionBadge height={24} />}
                  {info.hasHDR10Plus && <HDR10PlusBadge height={24} />}
                  {info.isHDR &&
                    !info.hasDolbyVision &&
                    !info.hasHDR10Plus &&
                    (info.hdrType === "HDR10" ? (
                      <HDR10Badge height={24} />
                    ) : (
                      <HDRBadge height={24} />
                    ))}
                  {info.hasAtmos && <DolbyAtmosBadge height={24} />}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {error && (
        <div className="player-error">
          <span className="error-icon">
            <AlertTriangle size={40} />
          </span>
          <h2>Playback Error</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button
              className="btn btn-primary"
              onClick={() => setShowSourcePicker(true)}
            >
              Try Another Source
            </button>
            <button className="btn btn-secondary" onClick={handleBack}>
              Go Back
            </button>
          </div>
        </div>
      )}

      {showSourcePicker && torrents.length > 0 && (
        <div className="source-picker">
          <div className="source-picker-header">
            <button
              className="btn btn-ghost source-back-top"
              onClick={handleBack}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <h2>Select Source</h2>
            <p>{title}</p>
          </div>
          <div className="source-list">
            {torrents.map((torrent) => {
              const info = parseStreamInfo(torrent.title);
              return (
                <div key={torrent.id} className="source-item">
                  <div
                    className="source-info"
                    onClick={() => handleSelectSource(torrent)}
                  >
                    <span className="source-title">{torrent.title}</span>
                    <div className="source-meta">
                      <span
                        className={`badge badge-resolution ${info.resolutionBadge === "4K" ? "badge-4k" : ""}`}
                      >
                        {info.resolutionBadge}
                      </span>
                      {info.hasDolbyVision && <DolbyVisionBadge height={16} />}
                      {info.hasHDR10Plus && <HDR10PlusBadge height={16} />}
                      {info.isHDR &&
                        !info.hasDolbyVision &&
                        !info.hasHDR10Plus &&
                        (info.hdrType === "HDR10" ? (
                          <HDR10Badge height={16} />
                        ) : (
                          <HDRBadge height={16} />
                        ))}
                      {info.hasAtmos && <DolbyAtmosBadge height={16} />}
                      <span className="source-size">
                        {torrent.sizeFormatted}
                      </span>
                      <span className="source-seeds">↑ {torrent.seeds}</span>
                      <span className="source-provider">
                        {torrent.provider}
                      </span>
                    </div>
                  </div>
                  <div className="source-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSource(torrent);
                      }}
                      title={
                        playerType === "embedded-mpv"
                          ? "Play in MPV"
                          : "Play in built-in player"
                      }
                    >
                      <Play size={14} /> Play
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {streamUrl && !useEmbeddedMpv && (
        <>
          <video
            ref={videoRef}
            className="video-player"
            src={streamUrl}
            onClick={togglePlay}
            onPlay={() => {
              setIsPlaying(true);
              // Dismiss loading screen on play start (backup for onCanPlay)
              if (!playbackReadyFiredRef.current) {
                playbackReadyFiredRef.current = true;
                setIsLoading(false);
                setShowStreamInfo(true);
                setTimeout(() => setShowStreamInfo(false), 4000);
              }
            }}
            onCanPlay={() => {
              // Dismiss loading screen once enough data is buffered to play
              if (!playbackReadyFiredRef.current) {
                playbackReadyFiredRef.current = true;
                setIsLoading(false);
                setShowStreamInfo(true);
                setTimeout(() => setShowStreamInfo(false), 4000);
              }
            }}
            onPause={() => {
              setIsPlaying(false);
              // Sync to server on pause so cross-device resume is accurate
              saveProgress();
            }}
            onError={(e) => {
              const video = e.currentTarget;
              const mediaError = video.error;
              console.error("Video element error:", mediaError?.code, mediaError?.message);

              if (!selectedTorrent) return;

              if (streamRetryCount === 0) {
                // First failure — the cached URL is likely expired.
                // Clear cache and re-fetch a fresh link from debrid.
                console.warn("Stream error, retrying with fresh URL (attempt 1)...");
                setStreamRetryCount(1);
                setIsLoading(true);
                loadStream(selectedTorrent, contentDetails, true);
              } else if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                // Second failure and format/codec error → switch to MPV
                console.warn("Format not supported by built-in player after retry, switching to MPV...");
                setUseEmbeddedMpv(true);
              } else {
                // Second failure, not codec-related → show error
                setError(`Playback failed. The stream link may be unavailable. ${mediaError?.message || ""}`);
              }
            }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              const videoDuration = videoRef.current?.duration || 0;
              setDuration(videoDuration);
              loadAudioTracks();
              setHasEmbeddedSubtitleTracks(
                (videoRef.current?.textTracks.length || 0) > 0,
              );

              // Resume from saved position
              if (id && videoRef.current) {
                const savedProgress = getWatchProgress(
                  id,
                  season ? parseInt(season) : undefined,
                  episode ? parseInt(episode) : undefined,
                );

                if (
                  savedProgress?.currentTime &&
                  savedProgress.currentTime > 0
                ) {
                  // Don't resume if almost finished (>95%)
                  if (savedProgress.progress < 95) {
                    console.log(
                      "Resuming from",
                      savedProgress.currentTime,
                      "seconds",
                    );
                    videoRef.current.currentTime = savedProgress.currentTime;
                    setCurrentTime(savedProgress.currentTime);
                  }
                }

                // Restore saved audio track
                if (
                  savedProgress?.audioTrackId &&
                  videoRef.current.audioTracks
                ) {
                  for (
                    let i = 0;
                    i < videoRef.current.audioTracks.length;
                    i++
                  ) {
                    const track = videoRef.current.audioTracks[i];
                    const trackId = track.id || i.toString();
                    if (trackId === savedProgress.audioTrackId) {
                      track.enabled = true;
                      setActiveAudioTrack(trackId);
                    } else {
                      track.enabled = false;
                    }
                  }
                }
              }
            }}
            onEnded={() => {
              markAsFinished();
            }}
          >
            {/* Subtitle track */}
            {subtitleUrl && (
              <track
                ref={trackRef}
                kind="subtitles"
                src={subtitleUrl}
                srcLang={activeSubtitle?.languageCode || "en"}
                label={activeSubtitle?.language || "Subtitles"}
              />
            )}
          </video>

          {/* Custom Subtitle Overlay with full CSS control */}
          <SubtitleOverlay
            subtitleUrl={subtitleUrl}
            currentTime={currentTime}
            isVisible={!!activeSubtitle}
            fontSize={subtitleAppearance.fontSize ?? 22}
            fontFamily={subtitleAppearance.fontFamily ?? "sans-serif"}
            textColor={subtitleAppearance.textColor ?? "#FFFFFF"}
            backgroundColor={subtitleAppearance.backgroundColor ?? "#000000"}
            backgroundOpacity={subtitleAppearance.backgroundOpacity ?? 0.75}
            textShadow={subtitleAppearance.textShadow ?? false}
            lineHeight={subtitleAppearance.lineHeight ?? 1.4}
            bottomPosition={subtitleAppearance.bottomPosition ?? 10}
          />

          {/* Skip Intro button overlay */}
          {showSkipButton && (
            <button
              className="skip-intro-btn"
              onClick={handleSkipIntro}
            >
              <SkipForward size={14} /> Skip Intro
            </button>
          )}

          <div
            className={`player-controls ${showControls ? "visible" : ""}`}
            onClick={(e) => {
              // Only toggle play if clicking directly on the controls overlay, not on buttons/controls
              if (e.target === e.currentTarget) {
                togglePlay();
              }
            }}
          >
            <div className="controls-top">
              <button className="back-btn" onClick={handleBack}>
                <ArrowLeft size={16} /> Back
              </button>
              <span className="player-title">{title}</span>
              {/* Episode menu button for series only */}
              {type === "series" && (
                <button
                  className="episodes-btn"
                  onClick={() => setShowEpisodeMenu(true)}
                >
                  Episodes
                </button>
              )}
            </div>

            {/* Clickable middle area for play/pause */}
            <div className="controls-middle" onClick={togglePlay} />

            <div className="controls-bottom">
              <div className="progress-bar">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="progress-slider"
                />
                <div
                  className="progress-fill"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>

              <div className="controls-row">
                <div className="controls-left">
                  <button className="control-btn" onClick={togglePlay}>
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>

                  <div className="volume-control">
                    <button className="control-btn" onClick={toggleMute}>
                      {isMuted || volume === 0 ? (
                        <VolumeX size={20} />
                      ) : volume < 0.5 ? (
                        <Volume1 size={20} />
                      ) : (
                        <Volume2 size={20} />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="volume-slider"
                    />
                  </div>

                  <span className="time-display">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="controls-right">
                  {/* Next episode button (series only) */}
                  {type === "series" && (
                    <button
                      className="control-btn next-episode-btn"
                      onClick={handleNextEpisode}
                      title="Next Episode"
                    >
                      <SkipForward size={20} />
                    </button>
                  )}

                  {/* Audio track selector */}
                  {audioTracks.length > 1 && (
                    <AudioTrackSelector
                      tracks={audioTracks}
                      activeTrackId={activeAudioTrack}
                      onSelect={handleAudioTrackSelect}
                    />
                  )}

                  {/* Subtitle selector */}
                  {isLoadingSubtitles && (
                    <span className="subtitle-loading">
                      <span className="subtitle-loading-spinner" />
                    </span>
                  )}
                  {!isLoadingSubtitles &&
                    (subtitles.length > 0 || hasEmbeddedSubtitleTracks) && (
                      <SubtitleSelector
                        subtitles={subtitles}
                        activeSubtitleId={activeSubtitle?.id || null}
                        activeSource={
                          activeSubtitle
                            ? "addon"
                            : hasEmbeddedSubtitleTracks
                              ? "embedded"
                              : null
                        }
                        onSelect={handleSubtitleSelect}
                        onTimingAdjust={handleSubtitleTimingAdjust}
                        currentOffset={subtitleOffset}
                      />
                    )}

                  <button className="control-btn" onClick={toggleFullscreen}>
                    {isFullscreen ? (
                      <Minimize size={20} />
                    ) : (
                      <Maximize size={20} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Episode Slide Menu */}
          {showEpisodeMenu && type === "series" && (
            <div
              className="episode-menu-overlay"
              onClick={() => setShowEpisodeMenu(false)}
            >
              <div
                className="episode-menu"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="episode-menu-header">
                  <h3>Season {season}</h3>
                  <button
                    className="close-btn"
                    onClick={() => setShowEpisodeMenu(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="episode-menu-list">
                  {seriesEpisodes.map((ep) => {
                    const isCurrentEpisode =
                      ep.episodeNumber === parseInt(episode || "1");
                    const watchProgress = id
                      ? getWatchProgress(
                          id,
                          parseInt(season || "1"),
                          ep.episodeNumber,
                        )
                      : undefined;
                    // Episode is considered watched if it has any progress (including finished episodes)
                    const isWatched =
                      watchProgress && watchProgress.progress > 0;
                    const shouldBlur =
                      blurUnwatchedEpisodes && !isWatched && ep.still;

                    return (
                      <div
                        key={ep.id}
                        className={`episode-menu-item ${isCurrentEpisode ? "current" : ""}`}
                        onClick={() => {
                          if (!isCurrentEpisode && selectedTorrent) {
                            navigate(
                              `/player/series/${id}/${season}/${ep.episodeNumber}`,
                              {
                                state: {
                                  torrentPrefs: {
                                    quality: selectedTorrent.quality,
                                    provider: selectedTorrent.provider,
                                  },
                                },
                              },
                            );
                            setShowEpisodeMenu(false);
                          }
                        }}
                      >
                        <div
                          className={`episode-menu-thumbnail ${shouldBlur ? "blur" : ""}`}
                        >
                          {ep.still ? (
                            <img src={ep.still} alt={ep.name} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div className="episode-placeholder">
                              <Tv size={28} />
                            </div>
                          )}
                          {isCurrentEpisode && (
                            <div className="now-playing">
                              <Play size={14} /> Now Playing
                            </div>
                          )}
                          {watchProgress &&
                            watchProgress.progress > 0 &&
                            !isCurrentEpisode && (
                              <div className="episode-progress">
                                <div
                                  className="episode-progress-fill"
                                  style={{
                                    width: `${watchProgress.progress}%`,
                                  }}
                                />
                              </div>
                            )}
                        </div>
                        <div className="episode-menu-info">
                          <span className="episode-num">
                            E{ep.episodeNumber}
                          </span>
                          <span className="episode-title">{ep.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
