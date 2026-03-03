/**
 * Embedded MPV Service using tauri-plugin-libmpv
 *
 * This service provides true embedded MPV playback within the Tauri window
 * with full audio/subtitle track control via libmpv.
 */
import {
  init,
  destroy,
  command,
  setProperty,
  getProperty,
  observeProperties,
  setVideoMarginRatio,
  type MpvConfig,
  type MpvObservableProperty,
} from "tauri-plugin-libmpv-api";

// Properties we want to observe from MPV with their types
// Format: [property-name, type, optional 'none' if can be null]
const OBSERVED_PROPERTIES = [
  ["pause", "flag"],
  ["time-pos", "double", "none"],
  ["duration", "double", "none"],
  ["volume", "double"],
  ["mute", "flag"],
  ["aid", "int64", "none"],
  ["sid", "int64", "none"],
  ["filename", "string", "none"],
  ["eof-reached", "flag"],
] as const satisfies MpvObservableProperty[];

/** High-quality MPV property overrides applied on every init. */
const HIGH_QUALITY_PROFILE: Record<string, string> = {
  // Use the modern high-quality preset (replaces deprecated gpu-hq)
  profile: "high-quality",

  // --- Colour accuracy (match the browser <video> pipeline) ---
  //
  // The browser <video> element always:
  //  1. Expands limited-range (16-235) BT.709 video to full-range (0-255)
  //  2. Converts BT.709 primaries → sRGB
  //  3. Outputs gamma-encoded sRGB to the Windows compositor
  //
  // We replicate this by explicitly setting the display target:
  //   target-prim=bt.709  → assume a standard BT.709/sRGB display
  //   target-trc=srgb     → expect the display to apply sRGB gamma
  // Together they tell MPV to perform the same YCbCr→sRGB colour path
  // the Chromium/WebView2 video decoder uses.
  "target-prim": "bt.709",
  "target-trc": "srgb",

  // Disable Windows colour management passthrough.
  // target-colorspace-hint=yes hands colour decisions to the OS ICC
  // profile (often inaccurate EDID-derived), which shifts whites and
  // compresses contrast relative to the browser pipeline.
  // profile:high-quality silently enables this; override it explicitly.
  "target-colorspace-hint": "no",
  // Same rationale for icc-profile-auto.
  "icc-profile-auto": "no",

  // NOTE: do not set the "background" property via setProperty here.
  // Some libmpv builds expose it in a non-string format and reject
  // string writes with "unsupported format for accessing property".

  // --- Scaling ---
  scale: "ewa_lanczossharp",
  cscale: "ewa_lanczossharp",
  dscale: "mitchell",
  "correct-downscaling": "yes",
  "linear-downscaling": "yes",
  "sigmoid-upscaling": "yes",

  // --- Dithering & debanding ---
  "dither-depth": "auto",
  deband: "yes",

  // --- HDR → SDR tone-mapping ---
  // 'mobius' preserves shadow detail better than 'hable' on SDR displays.
  "tone-mapping": "mobius",

  // Brightness / gamma / contrast tweaks to lift crushed blacks
  // and reduce harsh contrast on typical SDR monitors.
  brightness: "5",
  gamma: "5",
  contrast: "-3",
};

export interface AudioTrack {
  id: number;
  title: string | null;
  lang: string | null;
  codec: string | null;
  channels: number | null;
  selected: boolean;
}

export interface SubtitleTrack {
  id: number;
  title: string | null;
  lang: string | null;
  codec: string | null;
  external: boolean;
  selected: boolean;
}

export interface EmbeddedPlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  currentAudioTrack: number;
  currentSubtitleTrack: number;
  filename: string | null;
  eofReached: boolean;
}

type PropertyCallback = (state: Partial<EmbeddedPlayerState>) => void;

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

class EmbeddedMpvService {
  private initialized = false;
  private unlisten: (() => void) | null = null;
  private propertyCallbacks: Set<PropertyCallback> = new Set();
  private currentState: EmbeddedPlayerState = this.getDefaultState();
  private trackRefreshTimers: ReturnType<typeof setTimeout>[] = [];
  private lastKnownTrackCount: number = 0;

  private getDefaultState(): EmbeddedPlayerState {
    return {
      isPlaying: false,
      isPaused: true,
      position: 0,
      duration: 0,
      volume: 100,
      muted: false,
      audioTracks: [],
      subtitleTracks: [],
      currentAudioTrack: 0,
      currentSubtitleTrack: 0,
      filename: null,
      eofReached: false,
    };
  }

  /**
   * Initialize the embedded MPV player
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("Embedded MPV already initialized");
      return;
    }

    const mpvConfig: MpvConfig = {
      initialOptions: {
        // Video output - use classic gpu backend for maximum compatibility.
        // Some libmpv builds show black frames with gpu-next in embedded mode.
        vo: "gpu",
        // Disable hw decode in embedded mode to avoid driver-specific black-frame issues.
        // (Audio + subtitles can continue while video stays black with buggy hwdec paths.)
        hwdec: "no",
        // Expand limited-range (16-235) content to full-range (0-255) before
        // writing to the HWND surface.  The Windows compositor does NOT do
        // this expansion on its own; 'auto' usually means limited output
        // which causes grey/raised blacks on a PC monitor expecting 0-255.
        "video-output-levels": "full",
        // Force D3D11 GPU context and explicitly set sRGB output colour space
        // so the D3D11 swapchain matches the sRGB pipeline used by WebView2's
        // built-in <video> element.  Without this, 'auto' can pick a
        // non-sRGB space (e.g. HDR) on HDR-capable displays, washing out SDR.
        "gpu-context": "d3d11",
        "d3d11-output-csp": "srgb",
        // Keep window open after playback ends
        "keep-open": "yes",
        // Force window to show
        "force-window": "yes",
        // Cache settings for streaming
        cache: "yes",
        "cache-secs": "30",
        "demuxer-max-bytes": "500MiB",
        "demuxer-max-back-bytes": "100MiB",
        // No border for embedding
        border: "no",
        // Disable mpv OSC (we provide our own React controls)
        osc: "no",
        // Subtitle settings — don't auto-select any track so our scoring logic handles it
        sid: "no",
        "sub-auto": "no",
        "sub-visibility": "yes",
        // Audio settings
        "audio-display": "no",
        // Don't quit on end
        idle: "yes",
      },
      observedProperties: OBSERVED_PROPERTIES,
    };

    try {
      console.log("Initializing embedded MPV with libmpv...");
      await init(mpvConfig);
      this.initialized = true;
      console.log("Embedded MPV initialized successfully");

      // Make left-click on the video toggle play/pause.
      // This is important because the mpv surface can capture mouse input
      // (so the webview may not receive click events on the blank video area).
      try {
        await command("define-section", [
          "FlowVid_mouse",
          "MBTN_LEFT cycle pause\n",
          "force",
        ]);
        await command("enable-section", ["FlowVid_mouse"]);
      } catch (error) {
        console.warn("Failed to set mpv mouse bindings:", error);
      }

      // Start observing properties
      await this.startPropertyObserver();

      // Apply high-quality video profile for best colour & sharpness
      await this.applyHighQualityProfile();
    } catch (error) {
      console.error("Failed to initialize embedded MPV:", error);
      throw error;
    }
  }

  /**
   * Set video margin ratio to avoid overlapping with UI elements
   * Values are percentages (0.0 to 1.0)
   */
  async setMargins(margins: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  }): Promise<void> {
    if (!this.initialized) return;

    try {
      await setVideoMarginRatio({
        top: margins.top ?? 0,
        bottom: margins.bottom ?? 0,
        left: margins.left ?? 0,
        right: margins.right ?? 0,
      });
    } catch (error) {
      console.warn("Failed to set video margins:", error);
    }
  }

  /**
   * Start observing MPV properties for state updates
   */
  private async startPropertyObserver(): Promise<void> {
    try {
      this.unlisten = await observeProperties(
        OBSERVED_PROPERTIES,
        ({ name, data }) => {
          const updates: Partial<EmbeddedPlayerState> = {};

          switch (name) {
            case "pause":
              updates.isPaused = data as boolean;
              updates.isPlaying = !(data as boolean);
              break;
            case "time-pos":
              if (data !== null) {
                updates.position = toNumberOrNull(data) ?? 0;
              }
              break;
            case "duration":
              if (data !== null) {
                updates.duration = toNumberOrNull(data) ?? 0;
              }
              break;
            case "volume":
              updates.volume = toNumberOrNull(data) ?? 100;
              break;
            case "mute":
              updates.muted = data as boolean;
              break;
            case "aid":
              updates.currentAudioTrack = toNumberOrNull(data) ?? 0;
              break;
            case "sid":
              updates.currentSubtitleTrack = toNumberOrNull(data) ?? 0;
              break;
            case "filename":
              updates.filename = data as string | null;
              break;
            case "eof-reached":
              updates.eofReached = data as boolean;
              break;
          }

          // Update current state
          Object.assign(this.currentState, updates);

          // Notify callbacks
          this.propertyCallbacks.forEach((cb) => cb(updates));
        },
      );
    } catch (error) {
      console.error("Failed to start property observer:", error);
    }
  }

  /**
   * Subscribe to property changes
   */
  onPropertyChange(callback: PropertyCallback): () => void {
    this.propertyCallbacks.add(callback);
    return () => {
      this.propertyCallbacks.delete(callback);
    };
  }

  /**
   * Fetch and update audio/subtitle tracks
   */
  async refreshTracks(): Promise<void> {
    try {
      // Get track count — may fail if MPV is between files or shutting down
      let trackCount = 0;
      try {
        const trackCountRaw = await getProperty("track-list/count", "int64");
        trackCount = toNumberOrNull(trackCountRaw) ?? 0;
      } catch {
        // MPV not ready yet or shutting down
        return;
      }

      const audioTracks: AudioTrack[] = [];
      const subtitleTracks: SubtitleTrack[] = [];

      for (let i = 0; i < trackCount; i++) {
        // Track indices can shift during progressive demux — guard every read
        let type: unknown;
        try {
          type = await getProperty(`track-list/${i}/type`, "string");
        } catch {
          // Track was removed/reindexed between count read and property read
          continue;
        }
        const idRaw = await getProperty(`track-list/${i}/id`, "int64").catch(() => null);
        const id = toNumberOrNull(idRaw);
        if (id === null) continue;
        const title = await getProperty(
          `track-list/${i}/title`,
          "string",
        ).catch(() => null);
        const lang = await getProperty(`track-list/${i}/lang`, "string").catch(
          () => null,
        );
        const codec = await getProperty(
          `track-list/${i}/codec`,
          "string",
        ).catch(() => null);
        const selected = await getProperty(
          `track-list/${i}/selected`,
          "flag",
        ).catch(() => false);

        if (type === "audio") {
          const channels = await getProperty(
            `track-list/${i}/audio-channels`,
            "int64",
          ).catch(() => null);
          const channelsNum =
            channels === null ? null : toNumberOrNull(channels);
          audioTracks.push({
            id,
            title: title as string | null,
            lang: lang as string | null,
            codec: codec as string | null,
            channels: channelsNum,
            selected: selected as boolean,
          });
        } else if (type === "sub") {
          const external = await getProperty(
            `track-list/${i}/external`,
            "flag",
          ).catch(() => false);
          subtitleTracks.push({
            id,
            title: title as string | null,
            lang: lang as string | null,
            codec: codec as string | null,
            external: external as boolean,
            selected: selected as boolean,
          });
        }
      }

      this.currentState.audioTracks = audioTracks;
      this.currentState.subtitleTracks = subtitleTracks;

      // Notify about track updates
      this.propertyCallbacks.forEach((cb) =>
        cb({
          audioTracks,
          subtitleTracks,
        }),
      );
    } catch (error) {
      console.error("Failed to refresh tracks:", error);
    }
  }

  /**
   * Get current player state
   */
  getState(): EmbeddedPlayerState {
    return { ...this.currentState };
  }

  /**
   * Load and play a video file/URL
   */
  async loadFile(url: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log("Loading file in embedded MPV:", url);
    await command("loadfile", [url]);

    // Explicitly request automatic video track selection.
    // Guards against rare cases where MPV remains on vid=no after previous media.
    await command("set", ["vid", "auto"]).catch(() => undefined);

    // Clear any pending track refresh timers from a previous file
    this.trackRefreshTimers.forEach(clearTimeout);
    this.trackRefreshTimers = [];
    this.lastKnownTrackCount = 0;

    // Staggered track refresh: MPV discovers tracks progressively during demux.
    // For streaming content this can take several seconds.
    const refreshDelays = [500, 1500, 3000, 5000, 8000];
    for (const delay of refreshDelays) {
      const timer = setTimeout(() => this.refreshTracks(), delay);
      this.trackRefreshTimers.push(timer);
    }

    // Also poll for new tracks: if track-list/count changes, refresh immediately
    this.startTrackCountPolling();
  }

  /**
   * Toggle play/pause
   */
  async togglePause(): Promise<void> {
    await command("cycle", ["pause"]);
  }

  /**
   * Play
   */
  async play(): Promise<void> {
    await setProperty("pause", false);
  }

  /**
   * Pause
   */
  async pause(): Promise<void> {
    await setProperty("pause", true);
  }

  /**
   * Stop playback
   */
  async stop(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    try {
      await command("stop", []);
    } catch (error) {
      console.warn("Stop command failed (MPV may already be stopped):", error);
    }
    this.currentState = this.getDefaultState();
    // Clear track refresh timers
    this.trackRefreshTimers.forEach(clearTimeout);
    this.trackRefreshTimers = [];
    this.lastKnownTrackCount = 0;
  }

  /**
   * Poll for track-list/count changes so we detect newly-discovered embedded tracks.
   * Stops after 15 seconds (streaming content should have tracks by then).
   */
  private startTrackCountPolling(): void {
    let elapsed = 0;
    const interval = 1000; // check every second
    const maxDuration = 15000;

    const poll = async () => {
      if (!this.initialized || elapsed >= maxDuration) return;
      elapsed += interval;

      try {
        const countRaw = await getProperty("track-list/count", "int64");
        const count = toNumberOrNull(countRaw) ?? 0;

        if (count > 0 && count !== this.lastKnownTrackCount) {
          console.log(
            `Track count changed: ${this.lastKnownTrackCount} → ${count}, refreshing tracks`,
          );
          this.lastKnownTrackCount = count;
          await this.refreshTracks();
        }
      } catch {
        // Ignore – MPV may not be ready yet
      }

      if (elapsed < maxDuration && this.initialized) {
        const timer = setTimeout(poll, interval);
        this.trackRefreshTimers.push(timer);
      }
    };

    const timer = setTimeout(poll, interval);
    this.trackRefreshTimers.push(timer);
  }

  /**
   * Seek to absolute position (in seconds)
   */
  async seek(position: number): Promise<void> {
    if (!this.initialized) return;
    try {
      await command("seek", [position.toString(), "absolute"]);
    } catch (err) {
      console.warn("MPV seek failed:", err);
    }
  }

  /**
   * Seek relative (in seconds, can be negative)
   */
  async seekRelative(seconds: number): Promise<void> {
    if (!this.initialized) return;
    try {
      await command("seek", [seconds.toString(), "relative"]);
    } catch (err) {
      console.warn("MPV seekRelative failed:", err);
    }
  }

  /**
   * Set volume (0-100)
   */
  async setVolume(volume: number): Promise<void> {
    await setProperty("volume", Math.max(0, Math.min(100, volume)));
  }

  /**
   * Toggle mute
   */
  async toggleMute(): Promise<void> {
    await command("cycle", ["mute"]);
  }

  /**
   * Set audio track by ID
   */
  async setAudioTrack(trackId: number): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const trackIdNum = toNumberOrNull(trackId) ?? 0;

    // Validate track exists
    const trackExists = this.currentState.audioTracks.some(
      (t) => t.id === trackIdNum,
    );
    if (trackIdNum !== 0 && !trackExists) {
      console.warn(`Audio track ${trackIdNum} does not exist, refreshing...`);
      await this.refreshTracks();
      // Check again after refresh
      const stillDoesNotExist = !this.currentState.audioTracks.some(
        (t) => t.id === trackIdNum,
      );
      if (stillDoesNotExist) {
        throw new Error(`Audio track ${trackIdNum} not found`);
      }
    }

    const apply = async () => {
      if (trackIdNum === 0) {
        // Disable audio track using MPV command
        await command("set", ["aid", "no"]);
      } else {
        // Set audio track using MPV command
        await command("set", ["aid", trackIdNum.toString()]);
      }
    };

    try {
      await apply();
      console.log(`Successfully set audio track to ${trackIdNum}`);
    } catch (error) {
      console.warn("Failed to set audio track, retrying...", error);
      await new Promise((r) => setTimeout(r, 250));
      await this.refreshTracks();
      await apply();
    }

    this.currentState.currentAudioTrack = trackIdNum;
    // Keep selected flags in sync for UI
    setTimeout(() => this.refreshTracks(), 200);
  }

  /**
   * Set subtitle track by ID (0 to disable)
   */
  async setSubtitleTrack(trackId: number | bigint): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const trackIdNum = toNumberOrNull(trackId) ?? 0;

    // Validate track exists (unless disabling) — but never throw.
    // The UI may show tracks before the service cache fully syncs.
    if (trackIdNum !== 0) {
      const trackExists = this.currentState.subtitleTracks.some(
        (t) => t.id === trackIdNum,
      );
      if (!trackExists) {
        console.warn(
          `Subtitle track ${trackIdNum} not in local cache, refreshing...`,
        );
        await this.refreshTracks();
        if (
          !this.currentState.subtitleTracks.some((t) => t.id === trackIdNum)
        ) {
          console.warn(
            `Subtitle track ${trackIdNum} still not in cache — attempting to set anyway`,
          );
        }
      }
    }

    const apply = async () => {
      if (trackIdNum === 0) {
        // Disable subtitles using MPV command
        await command("set", ["sid", "no"]);
        await command("set", ["sub-visibility", "no"]);
      } else {
        // Set subtitle track using MPV command
        await command("set", ["sid", trackIdNum.toString()]);
        await command("set", ["sub-visibility", "yes"]);
      }
    };

    try {
      await apply();
      console.log(`Successfully set subtitle track to ${trackIdNum}`);
    } catch (error) {
      // If tracks haven't finished loading yet, retry once after a short delay.
      console.warn("Failed to set subtitle track, retrying...", error);
      await new Promise((r) => setTimeout(r, 250));
      await this.refreshTracks();
      await apply();
    }

    this.currentState.currentSubtitleTrack = trackIdNum;
    // Keep selected flags in sync for UI
    setTimeout(() => this.refreshTracks(), 200);
  }

  /**
   * Add an external subtitle track from a URL (e.g. OpenSubtitles/Stremio URL).
   * Returns the selected subtitle track id (sid) when successful.
   */
  async addExternalSubtitle(
    url: string,
    select: boolean = true,
  ): Promise<number | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const subtitleUrl = (url || "").trim();
    if (!subtitleUrl) {
      return null;
    }

    try {
      // Some MPV/libmpv builds are picky about sub-add argument forms.
      // Try the preferred call first, then fallback to simpler forms.
      let added = false;
      const attempts: string[][] = [
        [subtitleUrl, select ? "select" : "auto"],
        [subtitleUrl],
      ];

      for (const args of attempts) {
        try {
          await command("sub-add", args);
          added = true;
          break;
        } catch {
          // Try next form silently.
        }
      }

      if (!added) {
        return null;
      }

      // Give mpv a moment to register the track, then refresh.
      await new Promise((r) => setTimeout(r, 250));
      await this.refreshTracks();

      const sidRaw = await getProperty("sid", "int64").catch(() => null);
      let selectedId = toNumberOrNull(sidRaw);

      // If MPV didn't auto-select, explicitly select the newest external track.
      if (selectedId === null && select) {
        const externalTracks = this.currentState.subtitleTracks.filter(
          (track) => track.external,
        );
        const newest = externalTracks.sort((a, b) => b.id - a.id)[0];
        if (newest) {
          await this.setSubtitleTrack(newest.id);
          selectedId = newest.id;
        }
      }

      if (selectedId !== null) {
        this.currentState.currentSubtitleTrack = selectedId;
        await setProperty("sub-visibility", true).catch(() => undefined);
      }

      return selectedId;
    } catch (error) {
      console.info(
        "External subtitle could not be added for this source:",
        error,
      );
      return null;
    }
  }

  /**
   * Set subtitle delay in seconds
   */
  async setSubtitleDelay(seconds: number): Promise<void> {
    await setProperty("sub-delay", seconds);
  }

  /**
   * Toggle fullscreen (handled by Tauri window, not MPV internally)
   */
  async toggleFullscreen(): Promise<void> {
    // This is now handled at the component level using Tauri's window API
    // MPV's internal fullscreen doesn't work well with embedded mode
    console.warn("toggleFullscreen should be handled by Tauri window API");
  }

  /**
   * Get a display name for a track
   */
  getTrackDisplayName(track: AudioTrack | SubtitleTrack): string {
    const parts: string[] = [];

    // Add title if available
    if (track.title) {
      parts.push(track.title);
    }

    // Add language
    if (track.lang) {
      const langName = this.getLanguageName(track.lang);
      if (
        !track.title ||
        !track.title.toLowerCase().includes(track.lang.toLowerCase())
      ) {
        parts.push(langName);
      }
    }

    // Add codec info
    if (track.codec) {
      parts.push(`[${track.codec.toUpperCase()}]`);
    }

    // Add channel info for audio tracks
    if ("channels" in track && track.channels) {
      const channelStr =
        track.channels === 2
          ? "Stereo"
          : track.channels === 6
            ? "5.1"
            : track.channels === 8
              ? "7.1"
              : `${track.channels}ch`;
      parts.push(channelStr);
    }

    // Add external marker for subtitles
    if ("external" in track && track.external) {
      parts.push("(External)");
    }

    return parts.length > 0 ? parts.join(" ") : `Track ${track.id}`;
  }

  /**
   * Convert language code to display name
   */
  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      eng: "English",
      en: "English",
      jpn: "Japanese",
      ja: "Japanese",
      spa: "Spanish",
      es: "Spanish",
      fre: "French",
      fr: "French",
      ger: "German",
      de: "German",
      ita: "Italian",
      it: "Italian",
      por: "Portuguese",
      pt: "Portuguese",
      rus: "Russian",
      ru: "Russian",
      chi: "Chinese",
      zh: "Chinese",
      kor: "Korean",
      ko: "Korean",
      ara: "Arabic",
      ar: "Arabic",
      hin: "Hindi",
      hi: "Hindi",
      und: "Unknown",
    };
    return languages[code.toLowerCase()] || code.toUpperCase();
  }

  /**
   * Apply the high-quality video profile for best colour & sharpness.
   */
  private async applyHighQualityProfile(): Promise<void> {
    for (const [key, value] of Object.entries(HIGH_QUALITY_PROFILE)) {
      try {
        if (key === "profile") {
          await command("apply-profile", [value]);
        } else {
          await setProperty(key, value);
        }
      } catch (err) {
        console.info(`Skipping unsupported MPV property ${key}=${value}`);
      }
    }
    console.log("Applied high-quality MPV video profile");
  }

  /**
   * Destroy the MPV instance
   */
  async destroy(): Promise<void> {
    // Clear all pending track refresh timers
    this.trackRefreshTimers.forEach(clearTimeout);
    this.trackRefreshTimers = [];
    this.lastKnownTrackCount = 0;

    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }

    if (this.initialized) {
      try {
        await destroy();
      } catch (error) {
        console.error("Error destroying MPV:", error);
      }
      this.initialized = false;
      this.currentState = this.getDefaultState();
    }
  }
}

// Export singleton instance
export const embeddedMpvService = new EmbeddedMpvService();
