import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useAuthStore } from "./authStore";

export interface LibraryItem {
  id: string;
  imdbId: string;
  tmdbId?: number;
  type: "movie" | "series";
  title: string;
  year: number;
  poster?: string;
  backdrop?: string;
  rating?: number;
  addedAt: string;
  // New fields
  genres?: string[];
  runtime?: number;
  isFavorite?: boolean;
  watchlist?: boolean;
  userRating?: number; // 1-10
  notes?: string;
  tags?: string[];
  watched?: boolean;
}

export interface WatchHistoryItem {
  id: string;
  imdbId: string;
  type: "movie" | "series";
  title: string;
  poster?: string;
  backdrop?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  progress: number; // 0-100
  duration: number; // in seconds
  watchedAt: string;
  // Saved playback preferences
  currentTime?: number; // Resume position in seconds
  subtitleId?: string; // Selected subtitle ID
  subtitleOffset?: number; // Subtitle sync offset
  audioTrackId?: string; // Selected audio track ID
  // Saved torrent source
  torrentInfoHash?: string; // Torrent info hash to restore same source
  torrentTitle?: string; // Torrent title for reference
  torrentQuality?: string; // Quality (1080p, 720p, etc)
  torrentProvider?: string; // Provider (torrentio, yts, etc)
}

export interface LibraryCollection {
  id: string;
  name: string;
  description?: string;
  items: string[]; // Array of imdbIds
  createdAt: string;
  updatedAt: string;
}

export type LibraryFilter =
  | "all"
  | "movies"
  | "series"
  | "favorites"
  | "watchlist";
export type LibrarySortBy = "recent" | "title" | "year" | "rating" | "runtime";

interface ProfileLibraryData {
  library: LibraryItem[];
  watchHistory: WatchHistoryItem[];
  collections: LibraryCollection[];
}

interface LibraryState {
  // Active profile's data (what consumers read/write)
  library: LibraryItem[];
  watchHistory: WatchHistoryItem[];
  collections: LibraryCollection[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;

  // Per-profile storage
  profileData: Record<string, ProfileLibraryData>;
  currentProfileId: string | null;

  // Profile switching
  switchProfile: (profileId: string | null) => void;

  // Filter/Sort state
  activeFilter: LibraryFilter;
  sortBy: LibrarySortBy;
  searchQuery: string;

  // Actions
  addToLibrary: (item: Omit<LibraryItem, "id" | "addedAt">) => void;
  removeFromLibrary: (imdbId: string) => void;
  isInLibrary: (imdbId: string) => boolean;
  toggleFavorite: (imdbId: string) => void;
  toggleWatchlist: (imdbId: string) => void;
  markItemWatched: (imdbId: string) => void;
  setUserRating: (imdbId: string, rating: number) => void;
  updateNotes: (imdbId: string, notes: string) => void;
  addTag: (imdbId: string, tag: string) => void;
  removeTag: (imdbId: string, tag: string) => void;

  updateWatchProgress: (
    item: Omit<WatchHistoryItem, "id" | "watchedAt">,
    options?: { localOnly?: boolean },
  ) => void;
  getWatchProgress: (
    imdbId: string,
    season?: number,
    episode?: number,
  ) => WatchHistoryItem | undefined;
  clearWatchHistory: () => void;
  removeFromHistory: (id: string) => void;

  // Collections
  createCollection: (name: string, description?: string) => string;
  deleteCollection: (id: string) => void;
  addToCollection: (collectionId: string, imdbId: string) => void;
  removeFromCollection: (collectionId: string, imdbId: string) => void;
  renameCollection: (id: string, name: string) => void;

  // Filter/Sort
  setFilter: (filter: LibraryFilter) => void;
  setSortBy: (sortBy: LibrarySortBy) => void;
  setSearchQuery: (query: string) => void;
  getFilteredLibrary: () => LibraryItem[];

  syncWithServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Debounce timer for sync — prevents firing 3 full-sync POST requests on every button click
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced sync (2s). Calling again within the window resets the timer. */
function debouncedSync(syncFn: () => Promise<void>): void {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    syncFn();
  }, 2000);
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      library: [],
      watchHistory: [],
      collections: [],
      isLoading: false,
      isSyncing: false,
      lastSyncAt: null,
      activeFilter: "all",
      sortBy: "recent",
      searchQuery: "",
      profileData: {},
      currentProfileId: null,

      switchProfile: (profileId: string | null) => {
        const state = get();
        const prevId = state.currentProfileId;

        // Save current data to previous profile (if any)
        if (prevId) {
          const currentData: ProfileLibraryData = {
            library: state.library,
            watchHistory: state.watchHistory,
            collections: state.collections,
          };

          set((s) => ({
            profileData: {
              ...s.profileData,
              [prevId]: currentData,
            },
          }));
        }

        // Load data for new profile (or empty if first time)
        const newData = profileId
          ? state.profileData[profileId] || {
              library: [],
              watchHistory: [],
              collections: [],
            }
          : { library: [], watchHistory: [], collections: [] };

        set({
          currentProfileId: profileId,
          library: newData.library,
          watchHistory: newData.watchHistory,
          collections: newData.collections,
          activeFilter: "all",
          sortBy: "recent",
          searchQuery: "",
        });
      },

      addToLibrary: (item) => {
        const newItem: LibraryItem = {
          ...item,
          id: crypto.randomUUID(),
          addedAt: new Date().toISOString(),
          isFavorite: false,
          watchlist: false,
          tags: [],
        };

        set((state) => ({
          library: [newItem, ...state.library],
        }));

        // Sync in background
        debouncedSync(() => get().syncWithServer());
      },

      removeFromLibrary: (imdbId: string) => {
        set((state) => ({
          library: state.library.filter((item) => item.imdbId !== imdbId),
          // Also remove from all collections
          collections: state.collections.map((col) => ({
            ...col,
            items: col.items.filter((id) => id !== imdbId),
          })),
        }));

        // Sync in background
        debouncedSync(() => get().syncWithServer());
      },

      isInLibrary: (imdbId: string) => {
        return get().library.some((item) => item.imdbId === imdbId);
      },

      toggleFavorite: (imdbId: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, isFavorite: !item.isFavorite }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      toggleWatchlist: (imdbId: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, watchlist: !item.watchlist }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      markItemWatched: (imdbId: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, watched: true }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      setUserRating: (imdbId: string, rating: number) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, userRating: Math.max(1, Math.min(10, rating)) }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      updateNotes: (imdbId: string, notes: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId ? { ...item, notes } : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      addTag: (imdbId: string, tag: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, tags: [...(item.tags || []), tag] }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      removeTag: (imdbId: string, tag: string) => {
        set((state) => ({
          library: state.library.map((item) =>
            item.imdbId === imdbId
              ? { ...item, tags: (item.tags || []).filter((t) => t !== tag) }
              : item,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      updateWatchProgress: (item, options) => {
        const newItem: WatchHistoryItem = {
          ...item,
          id: crypto.randomUUID(),
          watchedAt: new Date().toISOString(),
        };

        set((state) => {
          // Remove existing entry for the same specific content
          // For series: only remove the entry for this specific episode
          // For movies: remove the existing movie entry
          const filtered = state.watchHistory.filter((h) => {
            if (h.imdbId !== item.imdbId) return true;
            if (item.type === "series") {
              // For series, only remove if it's the same episode
              return h.season !== item.season || h.episode !== item.episode;
            }
            // For movies, remove the existing entry
            return false;
          });

          return {
            watchHistory: [newItem, ...filtered].slice(0, 100), // Keep last 100
          };
        });

        // Only sync to server when not local-only (localStorage is updated
        // automatically by zustand persist middleware on every state change)
        if (!options?.localOnly) {
          debouncedSync(() => get().syncWithServer());
        }
      },

      getWatchProgress: (imdbId: string, season?: number, episode?: number) => {
        return get().watchHistory.find((h) => {
          if (h.imdbId !== imdbId) return false;
          if (season !== undefined && episode !== undefined) {
            return h.season === season && h.episode === episode;
          }
          return true;
        });
      },

      clearWatchHistory: () => {
        set({ watchHistory: [] });
        debouncedSync(() => get().syncWithServer());
      },

      removeFromHistory: (id: string) => {
        set((state) => ({
          watchHistory: state.watchHistory.filter((item) => item.id !== id),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      // Collections
      createCollection: (name: string, description?: string) => {
        const newCollection: LibraryCollection = {
          id: crypto.randomUUID(),
          name,
          description,
          items: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          collections: [...state.collections, newCollection],
        }));

        debouncedSync(() => get().syncWithServer());
        return newCollection.id;
      },

      deleteCollection: (id: string) => {
        set((state) => ({
          collections: state.collections.filter((col) => col.id !== id),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      addToCollection: (collectionId: string, imdbId: string) => {
        set((state) => ({
          collections: state.collections.map((col) =>
            col.id === collectionId && !col.items.includes(imdbId)
              ? { ...col, items: [...col.items, imdbId] }
              : col,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      removeFromCollection: (collectionId: string, imdbId: string) => {
        set((state) => ({
          collections: state.collections.map((col) =>
            col.id === collectionId
              ? { ...col, items: col.items.filter((id) => id !== imdbId) }
              : col,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      renameCollection: (id: string, name: string) => {
        set((state) => ({
          collections: state.collections.map((col) =>
            col.id === id ? { ...col, name } : col,
          ),
        }));
        debouncedSync(() => get().syncWithServer());
      },

      // Filter/Sort
      setFilter: (filter: LibraryFilter) => {
        set({ activeFilter: filter });
      },

      setSortBy: (sortBy: LibrarySortBy) => {
        set({ sortBy });
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      getFilteredLibrary: () => {
        const { library, activeFilter, sortBy, searchQuery } = get();
        let filtered = [...library];

        // Apply filter
        switch (activeFilter) {
          case "movies":
            filtered = filtered.filter((item) => item.type === "movie");
            break;
          case "series":
            filtered = filtered.filter((item) => item.type === "series");
            break;
          case "favorites":
            filtered = filtered.filter((item) => item.isFavorite);
            break;
          case "watchlist":
            filtered = filtered.filter((item) => item.watchlist);
            break;
          case "all":
          default:
            break;
        }

        // Apply search
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (item) =>
              item.title.toLowerCase().includes(query) ||
              item.genres?.some((g) => g.toLowerCase().includes(query)) ||
              item.tags?.some((t) => t.toLowerCase().includes(query)),
          );
        }

        // Apply sort
        switch (sortBy) {
          case "recent":
            filtered.sort(
              (a, b) =>
                new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
            );
            break;
          case "title":
            filtered.sort((a, b) => a.title.localeCompare(b.title));
            break;
          case "rating":
            filtered.sort((a, b) => {
              const ratingA = a.userRating || a.rating || 0;
              const ratingB = b.userRating || b.rating || 0;
              return ratingB - ratingA;
            });
            break;
          case "year":
            filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
            break;
          case "runtime":
            filtered.sort((a, b) => (b.runtime || 0) - (a.runtime || 0));
            break;
        }

        return filtered;
      },

      syncWithServer: async () => {
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        const state = get();
        if (state.isSyncing) return;

        set({ isSyncing: true });

        const profileId = state.currentProfileId;

        try {
          // Fire all three sync requests in parallel — ~3× faster than sequential
          await Promise.all([
            fetch(`${API_URL}/sync/library`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authState.token}`,
              },
              body: JSON.stringify({ profileId, library: state.library }),
            }),
            fetch(`${API_URL}/sync/history`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authState.token}`,
              },
              body: JSON.stringify({ profileId, history: state.watchHistory }),
            }),
            fetch(`${API_URL}/sync/collections`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authState.token}`,
              },
              body: JSON.stringify({
                profileId,
                collections: state.collections,
              }),
            }),
          ]);

          set({ lastSyncAt: new Date().toISOString() });
        } catch (error) {
          console.error("Failed to sync with server:", error);
        } finally {
          set({ isSyncing: false });
        }
      },

      loadFromServer: async () => {
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        set({ isLoading: true });

        const profileId = get().currentProfileId;
        const profileQuery = profileId
          ? `?profileId=${encodeURIComponent(profileId)}`
          : "";

        try {
          // Use the sync/all endpoint to load everything at once
          const res = await fetch(`${API_URL}/sync/all${profileQuery}`, {
            headers: {
              Authorization: `Bearer ${authState.token}`,
            },
          });

          if (res.ok) {
            const { data } = await res.json();
            set({
              library: data.library || [],
              watchHistory: data.history || [],
              collections: data.collections || [],
              lastSyncAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error("Failed to load from server:", error);
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: "FlowVid-library",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        library: state.library,
        watchHistory: state.watchHistory,
        collections: state.collections,
        profileData: state.profileData,
        currentProfileId: state.currentProfileId,
        activeFilter: state.activeFilter,
        sortBy: state.sortBy,
        lastSyncAt: state.lastSyncAt,
      }),
    },
  ),
);
