import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type DebridService =
  | "realdebrid"
  | "alldebrid"
  | "torbox"
  | "premiumize"
  | "none";
export type DebridServiceKey = Exclude<DebridService, "none">;
export type VideoQuality = "4k" | "1080p" | "720p" | "480p" | "auto";
export type Theme = "dark" | "light" | "system";
export type PlayerType = "default" | "embedded-mpv";

type DebridCredentials = Partial<Record<DebridServiceKey, string>>;

export interface SubtitlePreferences {
  autoLoad: boolean;
  defaultLanguage: string; // ISO 639-2 code (e.g., 'eng', 'nld', 'spa')
  secondaryLanguages: string[]; // Fallback languages
  preferHearingImpaired: boolean;
  syncOffsets: Record<string, number>; // Per-video sync offsets (videoId -> offset in seconds)
}

interface SettingsState {
  // Debrid settings
  activeDebridService: DebridService;
  debridCredentials: DebridCredentials;

  // Playback settings
  preferredQuality: VideoQuality;
  autoPlay: boolean;
  autoPlayNext: boolean;
  skipIntro: boolean;
  skipOutro: boolean;
  playerType: PlayerType;
  preferredAudioLanguage: string;
  preferredSubtitleLanguage: string;

  // UI settings
  theme: Theme;
  showWatchedIndicator: boolean;
  showRatings: boolean;

  // Scraping settings
  enabledScrapers: string[];
  useTorrentioBackup: boolean;
  scrapingTimeout: number;

  // Subtitle settings
  subtitles: SubtitlePreferences;

  // TMDB settings
  tmdbCustomApiKey: string;
  tmdbUseCustomKey: boolean;

  // Actions
  setDebridApiKey: (service: DebridService, apiKey: string) => void;
  removeDebridApiKey: (service: DebridService) => void;
  setActiveDebridService: (service: DebridService) => void;
  setPreferredQuality: (quality: VideoQuality) => void;
  setAutoPlay: (enabled: boolean) => void;
  setAutoPlayNext: (enabled: boolean) => void;
  setSkipIntro: (enabled: boolean) => void;
  setSkipOutro: (enabled: boolean) => void;
  setPlayerType: (playerType: PlayerType) => void;
  setPreferredAudioLanguage: (lang: string) => void;
  setPreferredSubtitleLanguage: (lang: string) => void;
  setTheme: (theme: Theme) => void;
  setShowWatchedIndicator: (show: boolean) => void;
  setShowRatings: (show: boolean) => void;
  toggleScraper: (scraperId: string) => void;
  setUseTorrentioBackup: (enabled: boolean) => void;
  setScrapingTimeout: (timeout: number) => void;
  getActiveApiKey: () => string | undefined;
  resetSettings: () => void;

  // Subtitle actions
  setSubtitleAutoLoad: (enabled: boolean) => void;
  setSubtitleLanguage: (language: string) => void;
  setSecondaryLanguages: (languages: string[]) => void;
  setPreferHearingImpaired: (enabled: boolean) => void;
  setSyncOffset: (videoId: string, offset: number) => void;
  getSyncOffset: (videoId: string) => number;

  // Episode thumbnail blur
  blurUnwatchedEpisodes: boolean;
  setBlurUnwatchedEpisodes: (enabled: boolean) => void;

  // TMDB actions
  setTmdbCustomApiKey: (key: string) => void;
  setTmdbUseCustomKey: (enabled: boolean) => void;
  clearTmdbCache: () => void;

  // Subtitle appearance
  subtitleAppearance: SubtitleAppearance;
  setSubtitleAppearance: (appearance: Partial<SubtitleAppearance>) => void;

  // Sync
  syncWithServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
}

export interface SubtitleAppearance {
  fontSize: number; // 16-32
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number; // 0-1
  textShadow: boolean;
  lineHeight: number; // 1.2-2.0
  bottomPosition: number; // 5-25 (percentage from bottom)
}

const defaultSubtitleAppearance: SubtitleAppearance = {
  fontSize: 28,
  fontFamily: "sans-serif",
  textColor: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 0.6,
  textShadow: true,
  lineHeight: 1.5,
  bottomPosition: 8,
};

const defaultSettings = {
  activeDebridService: "none" as DebridService,
  debridCredentials: {},
  preferredQuality: "1080p" as VideoQuality,
  autoPlay: true,
  autoPlayNext: true,
  skipIntro: false,
  skipOutro: false,
  playerType: "embedded-mpv" as PlayerType,
  preferredAudioLanguage: "eng",
  preferredSubtitleLanguage: "eng",
  theme: "dark" as Theme,
  showWatchedIndicator: true,
  showRatings: true,
  // Enable all scrapers by default for maximum coverage
  enabledScrapers: [
    // Tier 1 - Primary scrapers (most reliable)
    "yts", // Movies - working API
    "eztv", // TV Shows - working API
    "1337x", // General - HTML scraping
    "tpb", // General - API via apibay.org

    // Tier 2 - General scrapers (API-based, more reliable)
    "bitsearch", // General - Modern search engine
    "solidtorrents", // General - JSON API

    // Tier 2 - Anime scrapers
    "nyaa", // Anime - RSS feed
    "anidex", // Anime - RSS feed

    // Tier 3 - Regional scrapers
    "rutor", // Russian/International - HTML scraping

    // Tier 4 - Backup/Meta-scrapers (most reliable for overall coverage)
    "torrentio", // Backup - Stremio addon (aggregates 25+ sources)

    // Note: torrentgalaxy and limetorrents are disabled by default due to
    // Cloudflare protection causing network errors. Users can enable them
    // in settings if they work in their region.
  ],
  // Torrentio as primary backup - most reliable for 4K content
  useTorrentioBackup: true,
  scrapingTimeout: 30000,
  subtitles: {
    autoLoad: true, // Uses Stremio's OpenSubtitles addon API
    defaultLanguage: "eng", // English
    secondaryLanguages: ["nld"], // Dutch as fallback
    preferHearingImpaired: false,
    syncOffsets: {},
  },
  // Blur episode thumbnails for unwatched episodes (spoiler protection)
  blurUnwatchedEpisodes: true,
  // TMDB metadata enrichment
  tmdbCustomApiKey: "",
  tmdbUseCustomKey: false,
  // Subtitle appearance
  subtitleAppearance: defaultSubtitleAppearance,
};

// Debounced sync to avoid excessive API calls
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const debouncedSync = (syncFn: () => Promise<void>) => {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncFn();
  }, 2000); // Sync 2 seconds after last change
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setDebridApiKey: (service: DebridService, apiKey: string) => {
        if (service === "none") return;

        set((state) => ({
          debridCredentials: {
            ...state.debridCredentials,
            [service]: apiKey,
          },
          activeDebridService: service,
        }));
        debouncedSync(() => get().syncWithServer());
      },

      removeDebridApiKey: (service: DebridService) => {
        if (service === "none") return;

        set((state) => {
          const newCredentials = { ...state.debridCredentials };
          delete newCredentials[service];

          // If removing active service, switch to another or none
          let newActiveService = state.activeDebridService;
          if (state.activeDebridService === service) {
            const remaining = Object.keys(newCredentials) as DebridService[];
            newActiveService = remaining.length > 0 ? remaining[0] : "none";
          }

          return {
            debridCredentials: newCredentials,
            activeDebridService: newActiveService,
          };
        });
        debouncedSync(() => get().syncWithServer());
      },

      setActiveDebridService: (service: DebridService) => {
        set({ activeDebridService: service });
        debouncedSync(() => get().syncWithServer());
      },

      setPreferredQuality: (quality: VideoQuality) => {
        set({ preferredQuality: quality });
      },

      setAutoPlay: (enabled: boolean) => {
        set({ autoPlay: enabled });
      },

      setAutoPlayNext: (enabled: boolean) => {
        set({ autoPlayNext: enabled });
      },

      setSkipIntro: (enabled: boolean) => {
        set({ skipIntro: enabled });
      },

      setSkipOutro: (enabled: boolean) => {
        set({ skipOutro: enabled });
      },

      setPlayerType: (playerType: PlayerType) => {
        set({ playerType });
      },

      setPreferredAudioLanguage: (lang: string) => {
        set({ preferredAudioLanguage: lang });
      },

      setPreferredSubtitleLanguage: (lang: string) => {
        set({ preferredSubtitleLanguage: lang });
      },

      setTheme: (theme: Theme) => {
        set({ theme });
      },

      setShowWatchedIndicator: (show: boolean) => {
        set({ showWatchedIndicator: show });
      },

      setShowRatings: (show: boolean) => {
        set({ showRatings: show });
      },

      toggleScraper: (scraperId: string) => {
        set((state) => {
          const enabled = state.enabledScrapers.includes(scraperId);
          return {
            enabledScrapers: enabled
              ? state.enabledScrapers.filter((id) => id !== scraperId)
              : [...state.enabledScrapers, scraperId],
          };
        });
        debouncedSync(() => get().syncWithServer());
      },

      setUseTorrentioBackup: (enabled: boolean) => {
        set({ useTorrentioBackup: enabled });
        debouncedSync(() => get().syncWithServer());
      },

      setScrapingTimeout: (timeout: number) => {
        set({ scrapingTimeout: Math.max(5000, Math.min(120000, timeout)) });
      },

      getActiveApiKey: () => {
        const state = get();
        if (state.activeDebridService === "none") return undefined;
        return state.debridCredentials[state.activeDebridService];
      },

      resetSettings: () => {
        set(defaultSettings);
        debouncedSync(() => get().syncWithServer());
      },

      // Subtitle actions
      setSubtitleAutoLoad: (enabled: boolean) =>
        set((state) => ({
          subtitles: { ...state.subtitles, autoLoad: enabled },
        })),

      setSubtitleLanguage: (language: string) =>
        set((state) => ({
          subtitles: { ...state.subtitles, defaultLanguage: language },
        })),

      setSecondaryLanguages: (languages: string[]) =>
        set((state) => ({
          subtitles: { ...state.subtitles, secondaryLanguages: languages },
        })),

      setPreferHearingImpaired: (enabled: boolean) =>
        set((state) => ({
          subtitles: { ...state.subtitles, preferHearingImpaired: enabled },
        })),

      setSyncOffset: (videoId: string, offset: number) =>
        set((state) => ({
          subtitles: {
            ...state.subtitles,
            syncOffsets: { ...state.subtitles.syncOffsets, [videoId]: offset },
          },
        })),

      getSyncOffset: (videoId: string) => {
        return get().subtitles.syncOffsets[videoId] || 0;
      },

      // Episode thumbnail blur
      setBlurUnwatchedEpisodes: (enabled: boolean) => {
        set({ blurUnwatchedEpisodes: enabled });
      },

      // TMDB settings
      setTmdbCustomApiKey: (key: string) => {
        set({ tmdbCustomApiKey: key });
      },
      setTmdbUseCustomKey: (enabled: boolean) => {
        set({ tmdbUseCustomKey: enabled });
      },
      clearTmdbCache: () => {
        // Dynamic import to avoid circular dependency
        import("../services/metadata/tmdb").then(({ tmdbService }) => {
          tmdbService.clearCache();
        });
      },

      // Subtitle appearance
      setSubtitleAppearance: (appearance: Partial<SubtitleAppearance>) =>
        set((state) => ({
          subtitleAppearance: { ...state.subtitleAppearance, ...appearance },
        })),

      // Sync settings with server
      syncWithServer: async () => {
        const { useAuthStore } = await import("./authStore");
        const { useProfileStore } = await import("./profileStore");
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        const state = get();
        const profileId = useProfileStore.getState().activeProfileId;
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

        try {
          await fetch(`${API_URL}/sync/settings`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authState.token}`,
            },
            body: JSON.stringify({
              profileId,
              settings: {
                activeDebridService: state.activeDebridService,
                debridCredentials: state.debridCredentials,
                preferredQuality: state.preferredQuality,
                autoPlay: state.autoPlay,
                autoPlayNext: state.autoPlayNext,
                skipIntro: state.skipIntro,
                skipOutro: state.skipOutro,
                theme: state.theme,
                showWatchedIndicator: state.showWatchedIndicator,
                showRatings: state.showRatings,
                enabledScrapers: state.enabledScrapers,
                useTorrentioBackup: state.useTorrentioBackup,
                scrapingTimeout: state.scrapingTimeout,
                subtitles: state.subtitles,
                blurUnwatchedEpisodes: state.blurUnwatchedEpisodes,
                subtitleAppearance: state.subtitleAppearance,
              },
            }),
          });
        } catch (error) {
          console.error("Failed to sync settings with server:", error);
        }
      },

      loadFromServer: async () => {
        const { useAuthStore } = await import("./authStore");
        const { useProfileStore } = await import("./profileStore");
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        const profileId = useProfileStore.getState().activeProfileId;
        const profileQuery = profileId
          ? `?profileId=${encodeURIComponent(profileId)}`
          : "";
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

        try {
          const res = await fetch(`${API_URL}/sync/settings${profileQuery}`, {
            headers: {
              Authorization: `Bearer ${authState.token}`,
            },
          });

          if (res.ok) {
            const { settings } = await res.json();
            if (settings && Object.keys(settings).length > 0) {
              set(settings);
            }
          }
        } catch (error) {
          console.error("Failed to load settings from server:", error);
        }
      },
    }),
    {
      name: "FlowVid-settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
