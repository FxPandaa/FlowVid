import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components";
import {
  HomePage,
  SearchPage,
  DetailsPage,
  PlayerPage,
  LibraryPage,
  SettingsPage,
  LoginPage,
  ProfileSelectPage,
} from "./pages";
import { useProfileStore } from "./stores";
import { useFeatureGate } from "./hooks/useFeatureGate";
import { useSubscriptionStore } from "./stores/subscriptionStore";
import { useAuthStore } from "./stores/authStore";
import { useLibraryStore } from "./stores/libraryStore";
import { useEffect } from "react";

function ProfileGuard({ children }: { children: React.ReactNode }) {
  const { profiles, activeProfileId } = useProfileStore();
  const { canUseProfiles } = useFeatureGate();

  // Free users bypass profile selection entirely — profiles are a FlowVid+ feature
  if (!canUseProfiles) {
    return <>{children}</>;
  }

  // Paid users: if there are profiles but none is selected, redirect to profile select
  if (profiles.length > 0 && !activeProfileId) {
    return <Navigate to="/profiles" replace />;
  }

  // If the active profile no longer exists, redirect
  if (activeProfileId && !profiles.find((p) => p.id === activeProfileId)) {
    return <Navigate to="/profiles" replace />;
  }

  return <>{children}</>;
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchStatus = useSubscriptionStore((s) => s.fetchStatus);
  const loadFromServer = useLibraryStore((s) => s.loadFromServer);

  // Fetch subscription status when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus();
    }
  }, [isAuthenticated, fetchStatus]);

  // Silently refresh library/history/collections from server on login.
  // localStorage data is already shown immediately via Zustand persist,
  // so this runs in the background and updates the UI once the response arrives.
  useEffect(() => {
    if (isAuthenticated) {
      loadFromServer();
    }
  }, [isAuthenticated, loadFromServer]);

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AppInitializer>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profiles" element={<ProfileSelectPage />} />
          <Route
            path="/"
            element={
              <ProfileGuard>
                <Layout />
              </ProfileGuard>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="details/:type/:id" element={<DetailsPage />} />
            <Route path="player/:type/:id" element={<PlayerPage />} />
            <Route
              path="player/:type/:id/:season/:episode"
              element={<PlayerPage />}
            />
            <Route path="library" element={<LibraryPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AppInitializer>
    </BrowserRouter>
  );
}

export default App;
