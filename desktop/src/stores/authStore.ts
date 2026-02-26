import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || data.message || "Login failed");
          }

          // API returns { success, data: { user, tokens: { accessToken, refreshToken } } }
          const userData = data.data?.user || data.user;
          const token = data.data?.tokens?.accessToken || data.token;

          set({
            user: userData,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Login failed",
          });
          throw error;
        }
      },

      register: async (email: string, username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, username, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error || data.message || "Registration failed",
            );
          }

          // API returns { success, data: { user, tokens: { accessToken, refreshToken } } }
          const userData = data.data?.user || data.user;
          const token = data.data?.tokens?.accessToken || data.token;

          set({
            user: userData,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error:
              error instanceof Error ? error.message : "Registration failed",
          });
          throw error;
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });

        // Clear profile and library data on logout
        import("./profileStore").then(({ useProfileStore }) =>
          useProfileStore.getState().clearAll(),
        );
        import("./libraryStore").then(({ useLibraryStore }) =>
          useLibraryStore.getState().switchProfile(null),
        );
      },

      setError: (error: string | null) => set({ error }),
      clearError: () => set({ error: null }),
    }),
    {
      name: "FlowVid-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
