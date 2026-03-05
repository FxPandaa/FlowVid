import { useState, useEffect } from "react";
import {
  useSettingsStore,
  useSubscriptionStore,
  DebridService,
  DebridServiceKey,
  PlayerType,
} from "../stores";
import { useAuthStore } from "../stores/authStore";
import { debridService } from "../services/debrid";
import { tmdbService } from "../services/metadata/tmdb";
import { SUBTITLE_LANGUAGES } from "../utils/subtitleLanguages";
import { scrapers } from "../services/scraping/scrapers";
import { useFeatureGate } from "../hooks/useFeatureGate";
import { useUpdateChecker } from "../hooks/useUpdateChecker";
import { UpgradePrompt } from "../components/UpgradePrompt";
import {
  Globe,
  Flag,
  X,
  Lock,
  Check,
  XCircle,
  Mail,
  Clock,
} from "../components/Icons";
import "./SettingsPage.css";

// In-app scrapers grouped by category
const SCRAPER_CATEGORIES: Record<
  string,
  { name: string; icon: React.ReactNode }
> = {
  general: { name: "General", icon: <Globe size={16} /> },
  anime: { name: "Anime", icon: <Flag size={16} /> },
};

// Font options for subtitles
const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans Serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
  { value: "'Arial', sans-serif", label: "Arial" },
  { value: "'Roboto', sans-serif", label: "Roboto" },
  { value: "'Open Sans', sans-serif", label: "Open Sans" },
];

export function SettingsPage() {
  const {
    activeDebridService,
    debridCredentials,
    autoPlay,
    autoPlayNext,
    skipIntro,
    skipOutro,
    playerType,
    enabledScrapers,
    useTorrentioBackup,
    scrapingTimeout,
    subtitles,
    subtitleAppearance,
    blurUnwatchedEpisodes,
    showForYou,
    setDebridApiKey,
    removeDebridApiKey,
    setActiveDebridService,
    setAutoPlay,
    setAutoPlayNext,
    setSkipIntro,
    setSkipOutro,
    setPlayerType,
    toggleScraper,
    setUseTorrentioBackup,
    setScrapingTimeout,
    setSubtitleAutoLoad,
    setSubtitleLanguage,
    setPreferHearingImpaired,
    setSubtitleAppearance,
    setBlurUnwatchedEpisodes,
    setShowForYou,
    tmdbCustomApiKey,
    tmdbUseCustomKey,
    setTmdbCustomApiKey,
    setTmdbUseCustomKey,
    clearTmdbCache,
    resetSettings,
  } = useSettingsStore();

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [validatingService, setValidatingService] = useState<string | null>(
    null,
  );
  const [validationResult, setValidationResult] = useState<
    Record<string, boolean | null>
  >({});
  const [showDebridModal, setShowDebridModal] = useState(false);
  const [selectedDebridService, setSelectedDebridService] =
    useState<DebridServiceKey>("realdebrid");
  const [showScraperModal, setShowScraperModal] = useState(false);
  const [showScraperUpgrade, setShowScraperUpgrade] = useState(false);
  const { canUseNativeScrapers } = useFeatureGate();
  const { subscription } = useSubscriptionStore();
  const hasManagedTorBox =
    subscription?.tier === "FlowVid_plus" &&
    subscription?.torbox?.status === "active";

  // TMDB custom key state
  const [tmdbKeyInput, setTmdbKeyInput] = useState(tmdbCustomApiKey || "");
  const [tmdbValidating, setTmdbValidating] = useState(false);
  const [tmdbValidation, setTmdbValidation] = useState<boolean | null>(null);
  const [tmdbCacheCleared, setTmdbCacheCleared] = useState(false);

  const handleTmdbSaveKey = async () => {
    if (!tmdbKeyInput.trim()) return;
    setTmdbValidating(true);
    setTmdbValidation(null);
    try {
      const valid = await tmdbService.validateApiKey(tmdbKeyInput.trim());
      setTmdbValidation(valid);
      if (valid) {
        setTmdbCustomApiKey(tmdbKeyInput.trim());
        setTmdbUseCustomKey(true);
        tmdbService.clearCache();
      }
    } catch {
      setTmdbValidation(false);
    } finally {
      setTmdbValidating(false);
    }
  };

  const handleTmdbRemoveKey = () => {
    setTmdbCustomApiKey("");
    setTmdbUseCustomKey(false);
    setTmdbKeyInput("");
    setTmdbValidation(null);
    tmdbService.clearCache();
  };

  const handleTmdbClearCache = () => {
    clearTmdbCache();
    setTmdbCacheCleared(true);
    setTimeout(() => setTmdbCacheCleared(false), 2000);
  };

  const handleApiKeyChange = (service: string, value: string) => {
    setApiKeyInputs((prev) => ({ ...prev, [service]: value }));
  };

  const handleSaveApiKey = async (service: DebridService) => {
    const apiKey = apiKeyInputs[service];
    if (!apiKey?.trim()) return;

    setValidatingService(service);
    setValidationResult((prev) => ({ ...prev, [service]: null }));

    try {
      const isValid = await debridService.validateApiKey(
        service,
        apiKey.trim(),
      );
      setValidationResult((prev) => ({ ...prev, [service]: isValid }));

      if (isValid) {
        setDebridApiKey(service, apiKey.trim());
        setApiKeyInputs((prev) => ({ ...prev, [service]: "" }));
      }
    } catch (error) {
      setValidationResult((prev) => ({ ...prev, [service]: false }));
    } finally {
      setValidatingService(null);
    }
  };

  const handleRemoveApiKey = (service: DebridService) => {
    removeDebridApiKey(service);
    setValidationResult((prev) => ({ ...prev, [service]: null }));
  };

  // Get in-app scrapers (exclude torrentio - that's separate backup)
  const inAppScrapers = scrapers.filter(
    (s) => s.id !== "torrentio" && s.id !== "jackett",
  );

  // Enable/disable all scrapers in a category
  const toggleCategory = (category: string, enable: boolean) => {
    inAppScrapers.forEach((scraper) => {
      const isAnime = scraper.specialty === "anime";
      const matchesCategory = category === "anime" ? isAnime : !isAnime;

      if (matchesCategory) {
        const isEnabled = enabledScrapers.includes(scraper.id);
        if (enable && !isEnabled) {
          toggleScraper(scraper.id);
        } else if (!enable && isEnabled) {
          toggleScraper(scraper.id);
        }
      }
    });
  };

  // Group scrapers by category (General vs Anime)
  const getScrapersByCategory = () => {
    const grouped: Record<
      string,
      { id: string; name: string; enabled: boolean }[]
    > = {
      general: [],
      anime: [],
    };

    inAppScrapers.forEach((scraper) => {
      const category = scraper.specialty === "anime" ? "anime" : "general";
      grouped[category].push({
        id: scraper.id,
        name: scraper.name,
        enabled: enabledScrapers.includes(scraper.id),
      });
    });

    return grouped;
  };

  const debridServices: {
    id: DebridServiceKey;
    name: string;
    website: string;
  }[] = [
    {
      id: "realdebrid",
      name: "Real-Debrid",
      website: "https://real-debrid.com",
    },
    { id: "alldebrid", name: "AllDebrid", website: "https://alldebrid.com" },
    { id: "torbox", name: "TorBox", website: "https://torbox.app" },
    { id: "premiumize", name: "Premiumize", website: "https://premiumize.me" },
  ];

  const configuredDebridServices = debridServices.filter((service) => {
    const isManagedTorBox = service.id === "torbox" && hasManagedTorBox;
    return !!debridCredentials[service.id] || isManagedTorBox;
  });

  const selectedService =
    debridServices.find((service) => service.id === selectedDebridService) ||
    debridServices[0];
  const selectedIsManagedTorBox =
    selectedService.id === "torbox" && hasManagedTorBox;
  const selectedIsConfigured =
    !!debridCredentials[selectedService.id] || selectedIsManagedTorBox;
  const selectedIsActive = activeDebridService === selectedService.id;
  const selectedIsValidating = validatingService === selectedService.id;
  const selectedValidation = validationResult[selectedService.id];

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      {/* Subscription / Billing */}
      <SubscriptionSection />

      {/* Debrid Services */}
      <section className="settings-section">
        <h2>Debrid Services</h2>
        <p className="section-description">
          Connect a debrid service to stream torrents instantly without
          downloading.
        </p>

        <div className="debrid-compact-row">
          <div className="debrid-compact-info">
            <label>Configured providers</label>
            <p>
              {configuredDebridServices.length} of {debridServices.length}{" "}
              connected
              {activeDebridService !== "none" && (
                <>
                  {" "}
                  · Active:{" "}
                  {debridServices.find((s) => s.id === activeDebridService)
                    ?.name || "None"}
                </>
              )}
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setShowDebridModal(true)}
          >
            Configure Debrid
          </button>
        </div>

        {configuredDebridServices.length > 0 && (
          <div className="debrid-chip-list">
            {configuredDebridServices.map((service) => {
              const isManaged = service.id === "torbox" && hasManagedTorBox;
              const isActive = activeDebridService === service.id;
              return (
                <span key={service.id} className="debrid-chip">
                  {service.name}
                  {isManaged ? " · Managed" : ""}
                  {isActive ? " · Active" : ""}
                </span>
              );
            })}
          </div>
        )}
      </section>

      <div
        className={`modal-overlay debrid-modal-overlay ${showDebridModal ? "open" : ""}`}
        onClick={() => setShowDebridModal(false)}
        aria-hidden={!showDebridModal}
      >
        <div
          className="modal-content debrid-modal debrid-modal-content"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>Configure Debrid</h2>
            <button
              className="modal-close"
              onClick={() => setShowDebridModal(false)}
            >
              <X size={14} />
            </button>
          </div>

          <div className="modal-body">
            <p className="modal-description">
              Select a provider, paste your API key, and activate it.
            </p>

            <div className="debrid-picker-row">
              <select
                className="select debrid-provider-select"
                value={selectedDebridService}
                onChange={(e) =>
                  setSelectedDebridService(e.target.value as DebridServiceKey)
                }
              >
                {debridServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedIsManagedTorBox ? (
              <div className="debrid-managed-note">
                Managed by your FlowVid+ subscription — no API key setup needed.
              </div>
            ) : selectedIsConfigured ? (
              <div className="debrid-configured">
                <p>API key is configured for {selectedService.name}</p>
                <div className="debrid-actions">
                  {!selectedIsActive && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setActiveDebridService(selectedService.id)}
                    >
                      Set as Active
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    onClick={() => handleRemoveApiKey(selectedService.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="debrid-setup">
                <div className="api-key-input">
                  <input
                    type="password"
                    className="input"
                    placeholder={`Enter ${selectedService.name} API key`}
                    value={apiKeyInputs[selectedService.id] || ""}
                    onChange={(e) =>
                      handleApiKeyChange(selectedService.id, e.target.value)
                    }
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSaveApiKey(selectedService.id)}
                    disabled={
                      selectedIsValidating ||
                      !apiKeyInputs[selectedService.id]?.trim()
                    }
                  >
                    {selectedIsValidating ? "Validating..." : "Save"}
                  </button>
                </div>
                {selectedValidation === false && (
                  <p className="validation-error">Invalid API key</p>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              className="btn btn-primary"
              onClick={() => setShowDebridModal(false)}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Playback Settings */}
      <section className="settings-section">
        <h2>Playback</h2>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto Play</label>
            <p>Automatically start playing when a source is found</p>
          </div>
          <button
            className={`toggle ${autoPlay ? "active" : ""}`}
            onClick={() => setAutoPlay(!autoPlay)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto Play Next Episode</label>
            <p>Automatically play the next episode when one ends</p>
          </div>
          <button
            className={`toggle ${autoPlayNext ? "active" : ""}`}
            onClick={() => setAutoPlayNext(!autoPlayNext)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Skip Intro</label>
            <p>Automatically skip intros when available</p>
          </div>
          <button
            className={`toggle ${skipIntro ? "active" : ""}`}
            onClick={() => setSkipIntro(!skipIntro)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Skip Outro</label>
            <p>Automatically skip outros when available</p>
          </div>
          <button
            className={`toggle ${skipOutro ? "active" : ""}`}
            onClick={() => setSkipOutro(!skipOutro)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Video Player</label>
            <p>
              Choose your preferred video player. MPV offers better codec
              support.
            </p>
          </div>
          <select
            className="select"
            value={playerType}
            onChange={(e) => setPlayerType(e.target.value as PlayerType)}
          >
            <option value="default">Built-in Player</option>
            <option value="embedded-mpv">
              MPV Player (Better codec support)
            </option>
          </select>
        </div>
      </section>

      {/* TMDB Metadata */}
      <section className="settings-section">
        <h2>TMDB Metadata</h2>
        <p className="section-description">
          TMDB provides rich metadata like cast photos, trailers, production
          companies, and recommendations. A built-in API key is included —
          provide your own for better rate limits.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>Use Custom API Key</label>
            <p>
              {tmdbUseCustomKey && tmdbCustomApiKey
                ? "Using your custom TMDB API key"
                : "Currently using built-in API key"}
            </p>
          </div>
          <button
            className={`toggle ${tmdbUseCustomKey ? "active" : ""}`}
            onClick={() => {
              if (tmdbUseCustomKey) {
                handleTmdbRemoveKey();
              } else if (tmdbCustomApiKey) {
                setTmdbUseCustomKey(true);
                tmdbService.clearCache();
              }
            }}
            disabled={!tmdbUseCustomKey && !tmdbCustomApiKey}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Custom API Key</label>
            <p>
              Get a free key at{" "}
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--primary)" }}
              >
                themoviedb.org
              </a>
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              className="input"
              placeholder="Enter TMDB API key (v3)"
              value={tmdbKeyInput}
              onChange={(e) => {
                setTmdbKeyInput(e.target.value);
                setTmdbValidation(null);
              }}
              style={{ width: "260px" }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleTmdbSaveKey}
              disabled={tmdbValidating || !tmdbKeyInput.trim()}
            >
              {tmdbValidating ? "Validating..." : "Save"}
            </button>
            {tmdbUseCustomKey && tmdbCustomApiKey && (
              <button
                className="btn btn-ghost btn-sm danger"
                onClick={handleTmdbRemoveKey}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {tmdbValidation === true && (
          <div className="update-status update-current">
            <Check size={14} />
            <span>API key is valid and saved</span>
          </div>
        )}
        {tmdbValidation === false && (
          <div className="update-status update-error">
            <XCircle size={14} />
            <span>Invalid API key — please check and try again</span>
          </div>
        )}

        <div className="setting-item">
          <div className="setting-info">
            <label>Clear Metadata Cache</label>
            <p>Force reload all TMDB data on next visit</p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleTmdbClearCache}
          >
            {tmdbCacheCleared ? "Cleared!" : "Clear Cache"}
          </button>
        </div>
      </section>

      {/* Subtitles */}
      <section className="settings-section">
        <h2>Subtitles</h2>
        <p className="section-description">
          Configure automatic subtitle loading and language preferences.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>Auto-load Subtitles</label>
            <p>Automatically fetch and load subtitles when playing content</p>
          </div>
          <button
            className={`toggle ${subtitles.autoLoad ? "active" : ""}`}
            onClick={() => setSubtitleAutoLoad(!subtitles.autoLoad)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Default Subtitle Language</label>
            <p>Primary language for automatic subtitle loading</p>
          </div>
          <select
            className="input select-input"
            value={subtitles.defaultLanguage}
            onChange={(e) => setSubtitleLanguage(e.target.value)}
          >
            {SUBTITLE_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name} ({lang.nativeName})
              </option>
            ))}
          </select>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Prefer Hearing Impaired</label>
            <p>Prefer subtitles with sound effect descriptions [door slams]</p>
          </div>
          <button
            className={`toggle ${subtitles.preferHearingImpaired ? "active" : ""}`}
            onClick={() =>
              setPreferHearingImpaired(!subtitles.preferHearingImpaired)
            }
          >
            <span className="toggle-handle" />
          </button>
        </div>

        {/* Subtitle Appearance */}
        <div className="subtitle-appearance-section">
          <h3>Subtitle Appearance</h3>

          {/* Preview - matches SubtitleOverlay exactly */}
          <div className="subtitle-preview">
            <div className="subtitle-preview-video">
              <div
                className="subtitle-preview-text"
                style={{
                  fontSize: `${subtitleAppearance.fontSize ?? 22}px`,
                  fontFamily: subtitleAppearance.fontFamily ?? "sans-serif",
                  color: subtitleAppearance.textColor ?? "#FFFFFF",
                  backgroundColor: (() => {
                    const hex = (
                      subtitleAppearance.backgroundColor ?? "#000000"
                    ).replace("#", "");
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    return `rgba(${r}, ${g}, ${b}, ${subtitleAppearance.backgroundOpacity ?? 0.75})`;
                  })(),
                  textShadow:
                    (subtitleAppearance.textShadow ?? false)
                      ? "2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.6)"
                      : "none",
                  lineHeight: subtitleAppearance.lineHeight ?? 1.4,
                  bottom: `${subtitleAppearance.bottomPosition ?? 10}%`,
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  textAlign: "center",
                  whiteSpace: "pre-wrap",
                  fontWeight: 500,
                  maxWidth: "80%",
                }}
              >
                This is how your subtitles will look
                <br />
                Second line of subtitle text
              </div>
            </div>
          </div>

          <div className="appearance-controls">
            <div className="appearance-row">
              <label>Font Size</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="16"
                  max="36"
                  value={subtitleAppearance.fontSize}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      fontSize: parseInt(e.target.value),
                    })
                  }
                />
                <span>{subtitleAppearance.fontSize}px</span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Font Family</label>
              <select
                className="input select-input"
                value={subtitleAppearance.fontFamily}
                onChange={(e) =>
                  setSubtitleAppearance({ fontFamily: e.target.value })
                }
              >
                {FONT_FAMILIES.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="appearance-row">
              <label>Text Color</label>
              <input
                type="color"
                value={subtitleAppearance.textColor}
                onChange={(e) =>
                  setSubtitleAppearance({ textColor: e.target.value })
                }
                className="color-input"
              />
            </div>

            <div className="appearance-row">
              <label>Background Color</label>
              <input
                type="color"
                value={subtitleAppearance.backgroundColor}
                onChange={(e) =>
                  setSubtitleAppearance({ backgroundColor: e.target.value })
                }
                className="color-input"
              />
            </div>

            <div className="appearance-row">
              <label>Background Opacity</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(subtitleAppearance.backgroundOpacity * 100)}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      backgroundOpacity: parseInt(e.target.value) / 100,
                    })
                  }
                />
                <span>
                  {Math.round(subtitleAppearance.backgroundOpacity * 100)}%
                </span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Text Shadow</label>
              <button
                className={`toggle ${subtitleAppearance.textShadow ? "active" : ""}`}
                onClick={() =>
                  setSubtitleAppearance({
                    textShadow: !subtitleAppearance.textShadow,
                  })
                }
              >
                <span className="toggle-handle" />
              </button>
            </div>

            <div className="appearance-row">
              <label>Line Spacing</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="12"
                  max="20"
                  step="1"
                  value={Math.round(
                    (subtitleAppearance.lineHeight ?? 1.4) * 10,
                  )}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      lineHeight: parseInt(e.target.value) / 10,
                    })
                  }
                />
                <span>
                  {(subtitleAppearance.lineHeight ?? 1.4).toFixed(1)}x
                </span>
              </div>
            </div>

            <div className="appearance-row">
              <label>Bottom Position</label>
              <div className="slider-with-value">
                <input
                  type="range"
                  min="5"
                  max="25"
                  value={subtitleAppearance.bottomPosition ?? 10}
                  onChange={(e) =>
                    setSubtitleAppearance({
                      bottomPosition: parseInt(e.target.value),
                    })
                  }
                />
                <span>{subtitleAppearance.bottomPosition ?? 10}%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Display Settings */}
      <section className="settings-section">
        <h2>Display</h2>
        <p className="section-description">
          Customize how content is displayed.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>Blur Unwatched Episode Thumbnails</label>
            <p>
              Blur episode images to avoid spoilers until you start watching
            </p>
          </div>
          <button
            className={`toggle ${blurUnwatchedEpisodes ? "active" : ""}`}
            onClick={() => setBlurUnwatchedEpisodes(!blurUnwatchedEpisodes)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Show "For You" Recommendations</label>
            <p>
              Display personalized recommendations on the home page based on
              your library
            </p>
          </div>
          <button
            className={`toggle ${showForYou ? "active" : ""}`}
            onClick={() => setShowForYou(!showForYou)}
          >
            <span className="toggle-handle" />
          </button>
        </div>
      </section>

      {/* Scraping Settings */}
      <section className="settings-section">
        <h2>Scrapers</h2>
        <p className="section-description">
          Configure which torrent sources to search. In-app scrapers search
          directly from torrent sites.
        </p>

        <div className="setting-item">
          <div className="setting-info">
            <label>
              In-App Scrapers
              {!canUseNativeScrapers && (
                <span className="FlowVid-plus-badge">FlowVid+</span>
              )}
            </label>
            {canUseNativeScrapers ? (
              <p>
                {
                  inAppScrapers.filter((s) => enabledScrapers.includes(s.id))
                    .length
                }{" "}
                of {inAppScrapers.length} scrapers enabled
              </p>
            ) : (
              <p>Unlock {inAppScrapers.length} in-app scrapers with FlowVid+</p>
            )}
          </div>
          <button
            className="btn btn-secondary"
            onClick={() =>
              canUseNativeScrapers
                ? setShowScraperModal(true)
                : setShowScraperUpgrade(true)
            }
          >
            {canUseNativeScrapers ? (
              "Manage Scrapers"
            ) : (
              <>
                <Lock size={14} /> Upgrade
              </>
            )}
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Torrentio Addon</label>
            <p>
              {canUseNativeScrapers
                ? "Use Torrentio as a backup when in-app scrapers don't find results"
                : "Torrentio searches torrent sources via addon"}
            </p>
          </div>
          <button
            className={`toggle ${useTorrentioBackup ? "active" : ""}`}
            onClick={() => setUseTorrentioBackup(!useTorrentioBackup)}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Scraping Timeout</label>
            <p>Maximum time to wait for scrapers (in seconds)</p>
          </div>
          <input
            type="number"
            className="input number-input"
            min="5"
            max="120"
            value={scrapingTimeout / 1000}
            onChange={(e) =>
              setScrapingTimeout(parseInt(e.target.value) * 1000)
            }
          />
        </div>
      </section>

      {/* About & Updates */}
      <section className="settings-section">
        <h2>About</h2>
        <AboutSection />
      </section>

      {/* Reset */}
      <section className="settings-section">
        <h2>Reset</h2>
        <button className="btn btn-ghost danger" onClick={resetSettings}>
          Reset All Settings
        </button>
      </section>

      {/* Scraper Upgrade Prompt */}
      {showScraperUpgrade && (
        <UpgradePrompt
          feature="native_scrapers"
          onClose={() => setShowScraperUpgrade(false)}
        />
      )}

      {/* Scraper Modal */}
      {showScraperModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowScraperModal(false)}
        >
          <div
            className="modal-content scraper-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Manage Scrapers</h2>
              <button
                className="modal-close"
                onClick={() => setShowScraperModal(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-description">
                Select which torrent sources to search. More sources = more
                results but slower search.
              </p>

              {Object.entries(SCRAPER_CATEGORIES).map(
                ([categoryKey, category]) => {
                  const scrapers = getScrapersByCategory()[categoryKey] || [];
                  if (scrapers.length === 0) return null;

                  const enabledCount = scrapers.filter((s) => s.enabled).length;
                  const allEnabled = enabledCount === scrapers.length;

                  return (
                    <div key={categoryKey} className="scraper-category">
                      <div className="category-header">
                        <span className="category-icon">{category.icon}</span>
                        <span className="category-name">{category.name}</span>
                        <span className="category-count">
                          {enabledCount}/{scrapers.length}
                        </span>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() =>
                            toggleCategory(categoryKey, !allEnabled)
                          }
                        >
                          {allEnabled ? "Disable All" : "Enable All"}
                        </button>
                      </div>
                      <div className="scraper-list-grid">
                        {scrapers.map((scraper) => (
                          <label key={scraper.id} className="scraper-checkbox">
                            <input
                              type="checkbox"
                              checked={scraper.enabled}
                              onChange={() => toggleScraper(scraper.id)}
                            />
                            <span className="scraper-name">{scraper.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={() => setShowScraperModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUBSCRIPTION SECTION
// ============================================================================

function AboutSection() {
  const { checkForUpdates, isChecking, result, error, currentVersion } =
    useUpdateChecker();

  return (
    <>
      <div className="settings-row">
        <div className="settings-row-info">
          <label>Version</label>
          <p>FlowVid v{currentVersion}</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={checkForUpdates}
          disabled={isChecking}
        >
          {isChecking ? "Checking..." : "Check for Updates"}
        </button>
      </div>

      {result && !result.hasUpdate && (
        <div className="update-status update-current">
          <Check size={14} />
          <span>You're up to date!</span>
        </div>
      )}

      {result && result.hasUpdate && (
        <div
          className={`update-status ${result.forceUpdate ? "update-force" : "update-available"}`}
        >
          <span>
            {result.forceUpdate
              ? `⚠️ Critical update required: v${result.latestVersion}`
              : `Update available: v${result.latestVersion}`}
          </span>
          {result.notes && (
            <p className="update-notes">{result.notes}</p>
          )}
          {result.storeUrl && (
            <a
              href={result.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Download Update
            </a>
          )}
        </div>
      )}

      {error && (
        <div className="update-status update-error">
          <XCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </>
  );
}

function SubscriptionSection() {
  const { isAuthenticated } = useAuthStore();
  const {
    subscription,
    isLoading,
    error,
    checkoutLoading,
    fetchStatus,
    startCheckout,
    openPortal,
    refreshTorBox,
    clearError,
  } = useSubscriptionStore();

  const isPaid = subscription?.tier === "FlowVid_plus";

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus();
    }
  }, [isAuthenticated, fetchStatus]);

  if (!isAuthenticated) {
    return (
      <section className="settings-section">
        <h2>Subscription</h2>
        <p className="section-description">
          Log in to manage your FlowVid subscription and TorBox access.
        </p>
      </section>
    );
  }

  const status = subscription?.status ?? "not_subscribed";

  const handleCheckout = async () => {
    const url = await startCheckout();
    if (url) {
      window.open(url, "_blank");
    }
  };

  const handlePortal = async () => {
    const url = await openPortal();
    if (url && url !== "#mock-portal") {
      window.open(url, "_blank");
    }
  };

  const handleRefreshTorBox = async () => {
    const confirmed = await refreshTorBox();
    if (confirmed) {
      fetchStatus();
    }
  };

  return (
    <section className="settings-section">
      <h2>Subscription</h2>

      {/* Tier Badge */}
      <div className="tier-display">
        <span className={`tier-badge ${isPaid ? "tier-plus" : "tier-free"}`}>
          {isPaid ? "FlowVid+" : "FlowVid Free"}
        </span>
        {isPaid && subscription?.currentPeriodEnd && (
          <span className="tier-renews">
            Renews{" "}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </span>
        )}
        {subscription?.cancelAtPeriodEnd && (
          <span className="tier-canceling">Cancels at end of period</span>
        )}
      </div>

      {error && (
        <div className="subscription-error">
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={clearError}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Feature comparison */}
      <div className="tier-features">
        <div className="tier-feature">
          <span className="tier-feature-icon">
            <Check size={14} />
          </span>
          <span>Stream any movie or show</span>
        </div>
        <div className="tier-feature">
          <span className="tier-feature-icon">
            <Check size={14} />
          </span>
          <span>BYO debrid (Real-Debrid, AllDebrid, TorBox, Premiumize)</span>
        </div>
        <div className="tier-feature">
          <span className="tier-feature-icon">
            <Check size={14} />
          </span>
          <span>Torrentio addon scraper</span>
        </div>
        <div className="tier-feature">
          <span className="tier-feature-icon">
            <Check size={14} />
          </span>
          <span>Built-in player, subtitles, library & sync</span>
        </div>
        <div className={`tier-feature ${!isPaid ? "tier-feature-locked" : ""}`}>
          <span className="tier-feature-icon">
            {isPaid ? <Check size={14} /> : <Lock size={14} />}
          </span>
          <span>11 native scrapers (zero-downtime)</span>
          {!isPaid && <span className="FlowVid-plus-badge">FlowVid+</span>}
        </div>
        <div className={`tier-feature ${!isPaid ? "tier-feature-locked" : ""}`}>
          <span className="tier-feature-icon">
            {isPaid ? <Check size={14} /> : <Lock size={14} />}
          </span>
          <span>Family profiles</span>
          {!isPaid && <span className="FlowVid-plus-badge">FlowVid+</span>}
        </div>
        <div className={`tier-feature ${!isPaid ? "tier-feature-locked" : ""}`}>
          <span className="tier-feature-icon">
            {isPaid ? <Check size={14} /> : <Lock size={14} />}
          </span>
          <span>Managed TorBox (zero-setup streaming)</span>
          {!isPaid && <span className="FlowVid-plus-badge">FlowVid+</span>}
        </div>
      </div>

      {/* TorBox details (paid only) */}
      {isPaid && subscription?.torbox.email && (
        <div className="subscription-card">
          <div className="subscription-status-row">
            <span className="subscription-label">TorBox Account</span>
            <span className="subscription-value">
              {subscription.torbox.email}
            </span>
          </div>
          {subscription.torbox.status && (
            <div className="subscription-status-row">
              <span className="subscription-label">TorBox Status</span>
              <span className="subscription-value">
                {subscription.torbox.status === "active" ? (
                  <>
                    <Check size={14} /> Connected
                  </>
                ) : subscription.torbox.status === "pending_email_confirm" ? (
                  <>
                    <Mail size={14} /> Awaiting email confirmation
                  </>
                ) : subscription.torbox.status === "pending_provision" ? (
                  <>
                    <Clock size={14} /> Setting up...
                  </>
                ) : (
                  <>
                    <XCircle size={14} /> Revoked
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="subscription-actions">
        {status === "not_subscribed" ||
        status === "canceled" ||
        status === "expired" ? (
          <button
            className="btn btn-primary"
            onClick={handleCheckout}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? "Starting..." : "Upgrade to FlowVid+"}
          </button>
        ) : null}

        {status === "active" || status === "past_due" ? (
          <button className="btn btn-secondary" onClick={handlePortal}>
            Manage Subscription
          </button>
        ) : null}

        {status === "provisioned_pending_confirm" ? (
          <button
            className="btn btn-secondary"
            onClick={handleRefreshTorBox}
            disabled={isLoading}
          >
            {isLoading ? "Checking..." : "I've Confirmed My Email"}
          </button>
        ) : null}

        {status === "paid_pending_provision" && (
          <p className="subscription-hint">
            We're setting up your TorBox account. This usually takes less than a
            minute.
          </p>
        )}
      </div>
    </section>
  );
}
