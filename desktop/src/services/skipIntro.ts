/**
 * Skip Intro / Outro service.
 *
 * Uses the IntroHater API as the primary source:
 *   https://introhater.com/api.html
 *
 * Fallback: AniSkip for anime content.
 *   https://api.aniskip.com
 *
 * Returns skip segments (intro/outro/recap) with start & end timestamps.
 */

const INTROHATER_BASE = "https://api.introhater.com";

// ── Public types ────────────────────────────────────────────────────────

export interface SkipSegment {
  type: "intro" | "outro" | "recap" | "mixed-intro" | "mixed-outro";
  startTime: number; // seconds
  endTime: number; // seconds
  source: "introhater" | "aniskip";
}

// ── Raw response shapes ─────────────────────────────────────────────────

interface IntroHaterResponse {
  found: boolean;
  results?: IntroHaterSegment[];
}

interface IntroHaterSegment {
  start: number;
  end: number;
  type: string; // "intro", "outro", "recap", etc.
}

// AniSkip types reserved for future anime support
// interface AniSkipSegment {
//   interval: { startTime: number; endTime: number };
//   skipType: string;
//   skipId: string;
//   episodeLength: number;
// }

// ── Service ─────────────────────────────────────────────────────────────

class SkipIntroService {
  private cache = new Map<string, { data: SkipSegment[]; ts: number }>();
  private static CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

  /**
   * Get skip segments for an episode.
   * @param imdbId - IMDb ID of the series
   * @param season - Season number
   * @param episode - Episode number
   * @param episodeLength - Total episode duration in seconds (optional, for AniSkip)
   */
  async getSkipSegments(
    imdbId: string,
    season: number,
    episode: number,
    _episodeLength?: number,
  ): Promise<SkipSegment[]> {
    const key = `${imdbId}:${season}:${episode}`;

    // Cache hit?
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < SkipIntroService.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Try IntroHater first
      const segments = await this.fetchFromIntroHater(
        imdbId,
        season,
        episode,
      );

      if (segments.length > 0) {
        this.cache.set(key, { data: segments, ts: Date.now() });
        return segments;
      }

      // AniSkip doesn't use IMDb IDs (uses MAL IDs), so we skip it
      // unless the user provides a MAL ID in the future.

      this.cache.set(key, { data: [], ts: Date.now() });
      return [];
    } catch (err) {
      console.warn(`[SkipIntro] Failed to fetch for ${key}:`, err);
      return [];
    }
  }

  /**
   * Check if we have an intro skip segment for this episode.
   * Useful for showing the "Skip Intro" button.
   */
  async hasIntro(
    imdbId: string,
    season: number,
    episode: number,
  ): Promise<boolean> {
    const segments = await this.getSkipSegments(imdbId, season, episode);
    return segments.some((s) => s.type === "intro");
  }

  /**
   * Get the intro segment specifically (most common use case).
   * Returns null if no intro data is available.
   */
  async getIntro(
    imdbId: string,
    season: number,
    episode: number,
  ): Promise<SkipSegment | null> {
    const segments = await this.getSkipSegments(imdbId, season, episode);
    return segments.find((s) => s.type === "intro") || null;
  }

  // ── Fetchers ────────────────────────────────────────────────────────

  private async fetchFromIntroHater(
    imdbId: string,
    season: number,
    episode: number,
  ): Promise<SkipSegment[]> {
    try {
      const videoId = `${imdbId}:${season}:${episode}`;
      const url = `${INTROHATER_BASE}/v1/timestamps/${encodeURIComponent(videoId)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (!res.ok) return [];

      const data: IntroHaterResponse = await res.json();
      if (!data.found || !data.results) return [];

      return data.results
        .filter((s) => s.start != null && s.end != null && s.end > s.start)
        .map((s) => ({
          type: this.normalizeType(s.type),
          startTime: s.start,
          endTime: s.end,
          source: "introhater" as const,
        }));
    } catch {
      return [];
    }
  }

  private normalizeType(raw: string): SkipSegment["type"] {
    const lower = raw.toLowerCase();
    if (lower.includes("intro") || lower === "op") return "intro";
    if (lower.includes("outro") || lower === "ed") return "outro";
    if (lower.includes("recap")) return "recap";
    if (lower.includes("mixed") && lower.includes("intro"))
      return "mixed-intro";
    if (lower.includes("mixed") && lower.includes("outro"))
      return "mixed-outro";
    return "intro"; // default
  }
}

export const skipIntroService = new SkipIntroService();
