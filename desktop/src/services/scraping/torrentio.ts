/**
 * Torrentio Scraper - Primary scraper using Stremio's Torrentio addon
 * This is the same source that Stremio uses
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { TorrentResult, MediaQuery } from "./types";

// All available providers in Torrentio (same as Stremio)
export const TORRENTIO_PROVIDERS = {
  yts: { name: "YTS", enabled: true, specialty: "movies" },
  eztv: { name: "EZTV", enabled: true, specialty: "series" },
  rarbg: { name: "RARBG", enabled: true, specialty: "general" },
  "1337x": { name: "1337x", enabled: true, specialty: "general" },
  thepiratebay: { name: "ThePirateBay", enabled: true, specialty: "general" },
  kickasstorrents: {
    name: "KickassTorrents",
    enabled: true,
    specialty: "general",
  },
  torrentgalaxy: { name: "TorrentGalaxy", enabled: true, specialty: "general" },
  magnetdl: { name: "MagnetDL", enabled: true, specialty: "general" },
  horriblesubs: { name: "HorribleSubs", enabled: true, specialty: "anime" },
  nyaasi: { name: "NyaaSi", enabled: true, specialty: "anime" },
  tokyotosho: { name: "TokyoTosho", enabled: true, specialty: "anime" },
  anidex: { name: "AniDex", enabled: true, specialty: "anime" },
  // Disabled by default (require special access or are less reliable)
  rutor: { name: "Rutor", enabled: false, specialty: "general" },
  rutracker: { name: "Rutracker", enabled: false, specialty: "general" },
  comando: { name: "Comando", enabled: false, specialty: "general" },
  bludv: { name: "BluDV", enabled: false, specialty: "general" },
  torrent9: { name: "Torrent9", enabled: false, specialty: "general" },
  ilcorsaronero: {
    name: "ilCorSaRoNeRo",
    enabled: false,
    specialty: "general",
  },
  mejortorrent: { name: "MejorTorrent", enabled: false, specialty: "general" },
  wolfmax4k: { name: "Wolfmax4k", enabled: false, specialty: "general" },
  cinecalidad: { name: "Cinecalidad", enabled: false, specialty: "general" },
} as const;

export type TorrentioProvider = keyof typeof TORRENTIO_PROVIDERS;

// Quality filter options
export type QualityFilter =
  | "all"
  | "4k"
  | "1080p"
  | "720p"
  | "480p"
  | "other"
  | "scr"
  | "cam";

export interface TorrentioConfig {
  providers: TorrentioProvider[];
  qualityFilter?: QualityFilter[];
  sortBy?: "quality" | "seeders" | "size";
  prioritizeDebrid?: boolean;
}

// Default config with all primary providers enabled
export const DEFAULT_TORRENTIO_CONFIG: TorrentioConfig = {
  providers: [
    "yts",
    "eztv",
    "rarbg",
    "1337x",
    "thepiratebay",
    "kickasstorrents",
    "torrentgalaxy",
    "magnetdl",
    "horriblesubs",
    "nyaasi",
    "tokyotosho",
    "anidex",
  ],
  sortBy: "quality",
  prioritizeDebrid: true,
};

class TorrentioService {
  private baseUrl = "https://torrentio.strem.fun";

  /**
   * Build the Torrentio URL with config
   */
  private buildConfigUrl(config: TorrentioConfig): string {
    const parts: string[] = [];

    // Add providers filter
    if (config.providers.length > 0) {
      parts.push(`providers=${config.providers.join(",")}`);
    }

    // Add quality filter
    if (config.qualityFilter && config.qualityFilter.length > 0) {
      parts.push(`qualityfilter=${config.qualityFilter.join(",")}`);
    }

    // Add sort option
    if (config.sortBy) {
      parts.push(`sort=${config.sortBy}`);
    }

    if (parts.length > 0) {
      return `${this.baseUrl}/${parts.join("|")}`;
    }

    return this.baseUrl;
  }

  /**
   * Search for streams using Torrentio
   */
  async search(
    query: MediaQuery,
    config: TorrentioConfig = DEFAULT_TORRENTIO_CONFIG,
  ): Promise<TorrentResult[]> {
    try {
      const baseUrl = this.buildConfigUrl(config);
      const type = query.type === "movie" ? "movie" : "series";

      let url = `${baseUrl}/stream/${type}/${query.imdbId}`;

      // Add season/episode for series
      if (
        query.type === "series" &&
        query.season !== undefined &&
        query.episode !== undefined
      ) {
        url += `:${query.season}:${query.episode}`;
      }

      url += ".json";

      console.log("Torrentio request:", url);

      const response = await tauriFetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "FlowVid/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Torrentio returned ${response.status}`);
      }

      const data = await response.json();
      const streams = data.streams || [];

      if (streams.length === 0) {
        console.log("No streams found from Torrentio");
        return [];
      }

      console.log(`Found ${streams.length} streams from Torrentio`);

      return streams.map((stream: any, index: number) =>
        this.parseStream(stream, index),
      );
    } catch (error) {
      console.error("Torrentio search failed:", error);
      return [];
    }
  }

  /**
   * Parse a Torrentio stream into our TorrentResult format
   */
  private parseStream(stream: any, index: number): TorrentResult {
    const title = stream.title || stream.name || "Unknown";
    const infoHash = this.extractInfoHash(stream.infoHash || stream.url || "");

    // Parse quality from title
    const quality = this.parseQuality(title);
    const codec = this.parseCodec(title);
    const source = this.parseSource(title);

    // Extract provider from title (format: "[Provider] Quality...")
    const providerMatch = title.match(/\[([^\]]+)\]/);
    const provider = providerMatch ? providerMatch[1] : "Torrentio";

    // Always build magnet URI from infoHash - stream.url may be a debrid URL, not a magnet
    const magnetUri = infoHash ? this.buildMagnetUri(infoHash, title) : "";

    return {
      id: `torrentio-${index}-${infoHash.slice(0, 8)}`,
      title: this.cleanTitle(title),
      size: this.parseSize(title),
      sizeFormatted: this.extractSizeString(title),
      seeds: this.extractSeeds(title),
      peers: 0,
      quality,
      codec,
      source,
      infoHash,
      magnetUri,
      provider,
    };
  }

  private extractInfoHash(url: string): string {
    // Extract from magnet link
    const magnetMatch = url.match(/btih:([a-fA-F0-9]{40})/i);
    if (magnetMatch) return magnetMatch[1].toLowerCase();

    // Check if it's a raw hash
    if (/^[a-fA-F0-9]{40}$/i.test(url)) return url.toLowerCase();

    return url;
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/[🎬📺👤💾🔊⚡]/g, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private parseQuality(title: string): string {
    const t = title.toUpperCase();
    if (t.includes("2160P") || t.includes("4K") || t.includes("UHD"))
      return "4K";
    if (t.includes("1080P")) return "1080p";
    if (t.includes("720P")) return "720p";
    if (t.includes("480P")) return "480p";
    if (t.includes("HDTV")) return "HDTV";
    if (t.includes("CAM") || t.includes("TS")) return "CAM";
    return "Unknown";
  }

  private parseCodec(title: string): string {
    const t = title.toUpperCase();
    if (
      t.includes("HEVC") ||
      t.includes("X265") ||
      t.includes("H.265") ||
      t.includes("H265")
    )
      return "HEVC";
    if (t.includes("X264") || t.includes("H.264") || t.includes("H264"))
      return "x264";
    if (t.includes("AV1")) return "AV1";
    return "";
  }

  private parseSource(title: string): string {
    const t = title.toUpperCase();
    if (t.includes("REMUX")) return "Remux";
    if (t.includes("BLURAY") || t.includes("BDRIP")) return "BluRay";
    if (t.includes("WEB-DL")) return "WEB-DL";
    if (t.includes("WEBRIP")) return "WEBRip";
    if (t.includes("HDTV")) return "HDTV";
    return "";
  }

  private parseSize(title: string): number {
    const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
    if (!sizeMatch) return 0;
    const value = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    switch (unit) {
      case "TB":
        return value * 1024 * 1024 * 1024 * 1024;
      case "GB":
        return value * 1024 * 1024 * 1024;
      case "MB":
        return value * 1024 * 1024;
      default:
        return value;
    }
  }

  private extractSizeString(title: string): string {
    const sizeMatch = title.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i);
    return sizeMatch ? sizeMatch[1] : "Unknown";
  }

  private extractSeeds(title: string): number {
    const seedMatch = title.match(/👤\s*(\d+)/);
    return seedMatch ? parseInt(seedMatch[1], 10) : 0;
  }

  private buildMagnetUri(hash: string, title: string): string {
    const trackers = [
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://open.demonii.com:1337/announce",
      "udp://tracker.openbittorrent.com:80",
      "udp://tracker.torrent.eu.org:451/announce",
    ];
    const trackersParam = trackers
      .map((t) => `&tr=${encodeURIComponent(t)}`)
      .join("");
    return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackersParam}`;
  }
}

export const torrentioService = new TorrentioService();
