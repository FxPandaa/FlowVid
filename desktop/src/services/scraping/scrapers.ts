import { TorrentResult, MediaQuery } from "./types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// Base scraper interface
export interface Scraper {
  id: string;
  name: string;
  tier: number;
  /** "native" = built-in scraper (FlowVid+ only), "addon" = external addon (free) */
  type: "native" | "addon";
  region?: string;
  specialty?: "anime" | "movies" | "series" | "general";
  search(query: MediaQuery): Promise<TorrentResult[]>;
}

// Helper functions
function buildMagnetUri(
  hash: string,
  title: string,
  trackers?: string[],
): string {
  const defaultTrackers = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:80",
    "udp://9.rarbg.com:2810/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.tiny-vps.com:6969/announce",
  ];

  const allTrackers = trackers || defaultTrackers;
  const trackersParam = allTrackers
    .map((t) => `&tr=${encodeURIComponent(t)}`)
    .join("");
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackersParam}`;
}

function parseQuality(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd"))
    return "4K";
  if (lower.includes("1080p")) return "1080p";
  if (lower.includes("720p")) return "720p";
  if (lower.includes("480p")) return "480p";
  return "Unknown";
}

function parseCodec(title: string): string {
  const lower = title.toLowerCase();
  if (
    lower.includes("hevc") ||
    lower.includes("x265") ||
    lower.includes("h.265")
  )
    return "HEVC";
  if (lower.includes("x264") || lower.includes("h.264")) return "x264";
  if (lower.includes("av1")) return "AV1";
  return "";
}

function parseSource(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("remux")) return "Remux";
  if (lower.includes("bluray") || lower.includes("bdrip")) return "BluRay";
  if (lower.includes("web-dl")) return "WEB-DL";
  if (lower.includes("webrip")) return "WEBRip";
  if (lower.includes("hdtv")) return "HDTV";
  return "";
}

// Helper for future scrapers that report file size
function _parseSize(sizeStr: string): number {
  const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB|GiB|MiB|TiB)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  switch (unit) {
    case "TB":
    case "TIB":
      return value * 1024 * 1024 * 1024 * 1024;
    case "GB":
    case "GIB":
      return value * 1024 * 1024 * 1024;
    case "MB":
    case "MIB":
      return value * 1024 * 1024;
    default:
      return value;
  }
}

// Export to prevent unused warning
export { _parseSize as parseSize };

// ============================================================================
// TIER 1 - PRIMARY SCRAPERS (Always use first)
// ============================================================================

// Torrentio - Meta-scraper backup
class TorrentioScraper implements Scraper {
  id = "torrentio";
  name = "Torrentio";
  tier = 4; // Backup only
  type = "addon" as const;
  specialty = "general" as const;

  private baseUrl = "https://torrentio.strem.fun";

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    try {
      const type = query.type === "movie" ? "movie" : "series";
      let url = `${this.baseUrl}/stream/${type}/${query.imdbId}`;

      if (
        query.type === "series" &&
        query.season !== undefined &&
        query.episode !== undefined
      ) {
        url += `:${query.season}:${query.episode}`;
      }

      url += ".json";

      console.log("Torrentio request URL:", url);

      const response = await tauriFetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "FlowVid/1.0",
        },
      });

      if (!response.ok) {
        console.error(`Torrentio HTTP error: ${response.status}`);
        throw new Error(`Torrentio returned ${response.status}`);
      }

      const data = await response.json();
      const streams = data.streams || [];

      console.log(`Torrentio found ${streams.length} streams`);

      return streams.map((stream: any, index: number) => {
        const title = stream.title || stream.name || "Unknown";
        // Torrentio provides infoHash directly in the stream object
        const infoHash =
          stream.infoHash || this.extractInfoHash(stream.url || "");

        // Always build magnet URI from infoHash - stream.url may be a debrid URL, not a magnet
        const magnetUri = infoHash ? this.buildMagnetUri(infoHash, title) : "";

        return {
          id: `torrentio-${index}-${infoHash.slice(0, 8)}`,
          title: title
            .replace(/[🎬📺👤💾🔊⚡]/g, "")
            .replace(/\n/g, " ")
            .trim(),
          size: this.parseSize(title),
          sizeFormatted: this.extractSizeString(title),
          seeds: this.extractSeeds(title),
          peers: 0,
          quality: parseQuality(title),
          codec: parseCodec(title),
          source: parseSource(title),
          infoHash,
          magnetUri,
          provider: this.name,
        };
      });
    } catch (error) {
      console.error("Torrentio search failed:", error);
      return [];
    }
  }

  private extractInfoHash(url: string): string {
    // Handle magnet links
    const magnetMatch = url.match(/btih:([a-fA-F0-9]{40})/i);
    if (magnetMatch) return magnetMatch[1].toLowerCase();
    // Handle raw hashes
    if (/^[a-fA-F0-9]{40}$/i.test(url)) return url.toLowerCase();
    return "";
  }

  private buildMagnetUri(hash: string, title: string): string {
    const trackers = [
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://open.demonii.com:1337/announce",
      "udp://tracker.openbittorrent.com:80",
    ];
    const trackersParam = trackers
      .map((t) => `&tr=${encodeURIComponent(t)}`)
      .join("");
    return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackersParam}`;
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
}

// YTS - Movies specialist
class YTSScraper implements Scraper {
  id = "yts";
  name = "YTS";
  tier = 1;
  type = "native" as const;
  specialty = "movies" as const;

  private mirrors = ["https://yts.mx", "https://yts.lt", "https://yts.am"];

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    if (query.type !== "movie") return [];

    for (const baseUrl of this.mirrors) {
      try {
        const url = `${baseUrl}/api/v2/list_movies.json?query_term=${encodeURIComponent(query.imdbId)}`;
        const response = await tauriFetch(url, { method: "GET" });
        if (!response.ok) continue;

        const data = await response.json();
        const movies = data.data?.movies || [];
        const results: TorrentResult[] = [];

        for (const movie of movies) {
          if (movie.imdb_code !== query.imdbId) continue;

          for (const torrent of movie.torrents || []) {
            results.push({
              id: `yts-${torrent.hash}`,
              title: `${movie.title} (${movie.year}) [${torrent.quality}] [YTS]`,
              size: torrent.size_bytes,
              sizeFormatted: torrent.size,
              seeds: torrent.seeds,
              peers: torrent.peers,
              quality: torrent.quality,
              codec: torrent.video_codec || "x264",
              source: "YTS",
              infoHash: torrent.hash.toLowerCase(),
              magnetUri: buildMagnetUri(
                torrent.hash,
                `${movie.title} ${movie.year}`,
              ),
              provider: this.name,
            });
          }
        }

        if (results.length > 0) return results;
      } catch (error) {
        continue;
      }
    }

    return [];
  }
}

// EZTV - TV Shows specialist
class EZTVScraper implements Scraper {
  id = "eztv";
  name = "EZTV";
  tier = 1;
  type = "native" as const;
  specialty = "series" as const;

  private mirrors = ["https://eztvx.to", "https://eztv.re", "https://eztv.tf"];

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    if (query.type !== "series") return [];

    for (const baseUrl of this.mirrors) {
      try {
        const url = `${baseUrl}/api/get-torrents?imdb_id=${query.imdbId.replace("tt", "")}`;
        const response = await tauriFetch(url, { method: "GET" });
        if (!response.ok) continue;

        const data = await response.json();
        const torrents = data.torrents || [];
        const results: TorrentResult[] = [];

        for (const torrent of torrents) {
          if (query.season && torrent.season !== query.season) continue;
          if (query.episode && torrent.episode !== query.episode) continue;

          results.push({
            id: `eztv-${torrent.id}`,
            title: torrent.title,
            size: torrent.size_bytes,
            sizeFormatted: this.formatBytes(torrent.size_bytes),
            seeds: torrent.seeds,
            peers: torrent.peers,
            quality: parseQuality(torrent.title),
            codec: parseCodec(torrent.title),
            source: "EZTV",
            infoHash: torrent.hash.toLowerCase(),
            magnetUri: torrent.magnet_url,
            provider: this.name,
          });
        }

        if (results.length > 0) return results;
      } catch (error) {
        continue;
      }
    }

    return [];
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${bytes} B`;
  }
}

// ============================================================================
// TIER 1 - PRIMARY SCRAPERS (Extended)
// ============================================================================

// 1337x - General purpose
class The1337xScraper implements Scraper {
  id = "1337x";
  name = "1337x";
  tier = 1;
  type = "native" as const;
  specialty = "general" as const;

  private mirrors = [
    "https://1337x.to",
    "https://1337x.st",
    "https://x1337x.ws",
  ];

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    const searchTerm =
      query.type === "movie"
        ? `${query.title} ${query.year || ""}`
        : `${query.title} S${String(query.season).padStart(2, "0")}E${String(query.episode).padStart(2, "0")}`;

    for (const baseUrl of this.mirrors) {
      try {
        const url = `${baseUrl}/search/${encodeURIComponent(searchTerm)}/1/`;
        const response = await tauriFetch(url, { method: "GET" });
        if (!response.ok) continue;

        const html = await response.text();
        return this.parseHTML(html);
      } catch (error) {
        continue;
      }
    }
    return [];
  }

  private parseHTML(html: string): TorrentResult[] {
    const results: TorrentResult[] = [];
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];

    for (const row of rows) {
      const titleMatch = row.match(
        /<a href="\/torrent\/\d+\/[^"]*">([^<]+)<\/a>/,
      );
      const seedMatch = row.match(/<td class="coll-2 seeds">(\d+)<\/td>/);
      const sizeMatch = row.match(/<td class="coll-4 size[^>]*>([^<]+)<\/td>/);
      const linkMatch = row.match(/\/torrent\/(\d+)\//);

      if (titleMatch && linkMatch) {
        const title = titleMatch[1].trim();
        const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;

        results.push({
          id: `1337x-${linkMatch[1]}`,
          title,
          size: 0,
          sizeFormatted: sizeMatch ? sizeMatch[1].trim() : "Unknown",
          seeds,
          peers: 0,
          quality: parseQuality(title),
          codec: parseCodec(title),
          source: parseSource(title),
          infoHash: "",
          magnetUri: ``, // Would need second request to get magnet
          provider: this.name,
        });
      }
    }

    return results.sort((a, b) => b.seeds - a.seeds).slice(0, 10);
  }
}

// The Pirate Bay
class TPBScraper implements Scraper {
  id = "tpb";
  name = "The Pirate Bay";
  tier = 1;
  type = "native" as const;
  specialty = "general" as const;

  // Use apibay.org which is the working API
  private apiUrl = "https://apibay.org";

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    const searchTerm =
      query.type === "movie"
        ? `${query.title} ${query.year || ""}`
        : `${query.title} S${String(query.season).padStart(2, "0")}E${String(query.episode).padStart(2, "0")}`;

    try {
      const url = `${this.apiUrl}/q.php?q=${encodeURIComponent(searchTerm)}&cat=`;
      console.log("TPB search URL:", url);

      const response = await tauriFetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "FlowVid/1.0",
        },
      });

      if (!response.ok) {
        console.error("TPB API error:", response.status);
        return [];
      }

      const data = await response.json();

      // API returns [{"id":"0","name":"No results returned"}] when no results
      if (!Array.isArray(data) || data.length === 0 || data[0]?.id === "0") {
        console.log("TPB: No results found");
        return [];
      }

      console.log(`TPB found ${data.length} results`);

      return data.slice(0, 25).map((t: any) => ({
        id: `tpb-${t.id}`,
        title: t.name,
        size: parseInt(t.size) || 0,
        sizeFormatted: this.formatBytes(parseInt(t.size) || 0),
        seeds: parseInt(t.seeders) || 0,
        peers: parseInt(t.leechers) || 0,
        quality: parseQuality(t.name),
        codec: parseCodec(t.name),
        source: parseSource(t.name),
        infoHash: t.info_hash,
        magnetUri: buildMagnetUri(t.info_hash, t.name),
        provider: this.name,
      }));
    } catch (error) {
      console.error("TPB search failed:", error);
      return [];
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${bytes} B`;
  }
}

// LimeTorrents - Working implementation
class LimeTorrentsScraper implements Scraper {
  id = "limetorrents";
  name = "LimeTorrents";
  tier = 2;
  type = "native" as const;
  specialty = "general" as const;

  private mirrors = [
    "https://www.limetorrents.lol",
    "https://www.limetorrents.to",
  ];

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    const searchTerm =
      query.type === "movie"
        ? `${query.title} ${query.year || ""}`
        : `${query.title} S${String(query.season).padStart(2, "0")}E${String(query.episode).padStart(2, "0")}`;

    for (const baseUrl of this.mirrors) {
      try {
        const url = `${baseUrl}/search/all/${encodeURIComponent(searchTerm)}/seeds/1/`;
        console.log("LimeTorrents search:", url);

        const response = await tauriFetch(url, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        if (!response.ok) continue;

        const html = await response.text();
        const results = this.parseHTML(html);
        if (results.length > 0) return results;
      } catch (error) {
        console.error("LimeTorrents search failed:", error);
        continue;
      }
    }
    return [];
  }

  private parseHTML(html: string): TorrentResult[] {
    const results: TorrentResult[] = [];

    // Match torrent table rows
    const rowRegex = /<tr[^>]*class="[^"]*"[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowRegex) || [];

    for (const row of rows.slice(0, 20)) {
      // Extract magnet link or hash
      const hashMatch = row.match(/itorrents\.org\/torrent\/([A-F0-9]{40})/i);
      if (!hashMatch) continue;

      const infoHash = hashMatch[1].toLowerCase();

      // Extract title
      const titleMatch =
        row.match(/<a[^>]*class="coll-1[^"]*"[^>]*>([^<]+)<\/a>/i) ||
        row.match(/<div class="tt-name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      const title = titleMatch
        ? this.decodeHtml(titleMatch[1].trim())
        : "Unknown";

      // Extract size
      const sizeMatch = row.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i);
      const sizeFormatted = sizeMatch ? sizeMatch[1] : "Unknown";

      // Extract seeds
      const seedMatch =
        row.match(/class="tdseed"[^>]*>(\d+)</i) ||
        row.match(/<td[^>]*class="[^"]*seed[^"]*"[^>]*>(\d+)/i);
      const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;

      results.push({
        id: `lime-${infoHash.slice(0, 8)}`,
        title,
        size: this.parseSize(sizeFormatted),
        sizeFormatted,
        seeds,
        peers: 0,
        quality: parseQuality(title),
        codec: parseCodec(title),
        source: parseSource(title),
        infoHash,
        magnetUri: buildMagnetUri(infoHash, title),
        provider: this.name,
      });
    }

    return results.sort((a, b) => b.seeds - a.seeds);
  }

  private decodeHtml(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB|TB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
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
}

// BitSearch - Modern torrent search engine with API
class BitSearchScraper implements Scraper {
  id = "bitsearch";
  name = "BitSearch";
  tier = 2;
  type = "native" as const;
  specialty = "general" as const;

  private baseUrl = "https://bitsearch.to";

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    const searchTerm =
      query.type === "movie"
        ? `${query.title} ${query.year || ""}`
        : `${query.title} S${String(query.season).padStart(2, "0")}E${String(query.episode).padStart(2, "0")}`;

    try {
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(searchTerm)}&category=1&subcat=2`;
      console.log("BitSearch search:", url);

      const response = await tauriFetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) return [];

      const html = await response.text();
      return this.parseHTML(html);
    } catch (error) {
      console.error("BitSearch search failed:", error);
      return [];
    }
  }

  private parseHTML(html: string): TorrentResult[] {
    const results: TorrentResult[] = [];

    // BitSearch uses card layout
    const cardRegex = /<li class="card[^"]*"[\s\S]*?<\/li>/gi;
    const cards = html.match(cardRegex) || [];

    for (const card of cards.slice(0, 20)) {
      // Extract magnet link
      const magnetMatch = card.match(/href="(magnet:\?[^"]+)"/i);
      if (!magnetMatch) continue;

      const magnetUri = magnetMatch[1].replace(/&amp;/g, "&");
      const hashMatch = magnetUri.match(/btih:([a-fA-F0-9]{40})/i);
      if (!hashMatch) continue;

      const infoHash = hashMatch[1].toLowerCase();

      // Extract title
      const titleMatch = card.match(/<h5[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      const title = titleMatch ? titleMatch[1].trim() : "Unknown";

      // Extract size
      const sizeMatch = card.match(
        /<div[^>]*>\s*(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i,
      );
      const sizeFormatted = sizeMatch ? sizeMatch[1] : "Unknown";

      // Extract seeds
      const seedMatch = card.match(/fa-arrow-up[^>]*><\/i>\s*(\d+)/i);
      const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;

      results.push({
        id: `bitsearch-${infoHash.slice(0, 8)}`,
        title,
        size: this.parseSize(sizeFormatted),
        sizeFormatted,
        seeds,
        peers: 0,
        quality: parseQuality(title),
        codec: parseCodec(title),
        source: parseSource(title),
        infoHash,
        magnetUri,
        provider: this.name,
      });
    }

    return results.sort((a, b) => b.seeds - a.seeds);
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB|TB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
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
}

// BitSearch (formerly SolidTorrents) - Modern torrent aggregator
class SolidTorrentsWorkingScraper implements Scraper {
  id = "solidtorrents";
  name = "BitSearch";
  tier = 2;
  type = "native" as const;
  specialty = "general" as const;

  private baseUrl = "https://bitsearch.to";

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    const searchTerm =
      query.type === "movie"
        ? `${query.title} ${query.year || ""}`
        : `${query.title} S${String(query.season).padStart(2, "0")}E${String(query.episode).padStart(2, "0")}`;

    try {
      // BitSearch has an API-like JSON endpoint
      const url = `${this.baseUrl}/api/v1/search?q=${encodeURIComponent(searchTerm)}&category=video&sort=seeders`;
      console.log("BitSearch search:", url);

      const response = await tauriFetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "FlowVid/1.0",
          Accept: "application/json",
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      const torrents = data.results || [];

      return torrents.slice(0, 25).map((t: any) => ({
        id: `bitsearch-${t.infohash?.slice(0, 8) || Math.random()}`,
        title: t.title || "Unknown",
        size: t.size || 0,
        sizeFormatted: this.formatBytes(t.size || 0),
        seeds: t.seeders || t.swarm?.seeders || 0,
        peers: t.leechers || t.swarm?.leechers || 0,
        quality: parseQuality(t.title || ""),
        codec: parseCodec(t.title || ""),
        source: parseSource(t.title || ""),
        infoHash: t.infohash?.toLowerCase() || "",
        magnetUri: t.magnet || buildMagnetUri(t.infohash || "", t.title || ""),
        provider: this.name,
      }));
    } catch (error) {
      console.error("BitSearch search failed:", error);
      return [];
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${bytes} B`;
  }
}

// AniDex - Anime specialist (used by Torrentio)
class AniDexScraper implements Scraper {
  id = "anidex";
  name = "AniDex";
  tier = 2;
  type = "native" as const;
  specialty = "anime" as const;

  private baseUrl = "https://anidex.info";

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    try {
      // AniDex has RSS with category filter (cat 1 = anime)
      const url = `${this.baseUrl}/?page=rss&q=${encodeURIComponent(query.title)}&cat=1`;
      console.log("AniDex search:", url);

      const response = await tauriFetch(url, { method: "GET" });
      if (!response.ok) return [];

      const xml = await response.text();
      return this.parseRSS(xml);
    } catch (error) {
      console.error("AniDex search failed:", error);
      return [];
    }
  }

  private parseRSS(xml: string): TorrentResult[] {
    const results: TorrentResult[] = [];
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

    for (const item of items.slice(0, 20)) {
      const titleMatch =
        item.match(/<title>([^<]+)<\/title>/) ||
        item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      const sizeMatch = item.match(/<size>(\d+)<\/size>/);
      const seedMatch = item.match(/<seeders>(\d+)<\/seeders>/);
      const hashMatch = item.match(/<infohash>([a-fA-F0-9]{40})<\/infohash>/i);

      if (titleMatch) {
        const title = titleMatch[1];
        const infoHash = hashMatch ? hashMatch[1].toLowerCase() : "";

        results.push({
          id: `anidex-${infoHash.slice(0, 8) || Date.now()}`,
          title,
          size: sizeMatch ? parseInt(sizeMatch[1]) : 0,
          sizeFormatted: this.formatBytes(
            sizeMatch ? parseInt(sizeMatch[1]) : 0,
          ),
          seeds: seedMatch ? parseInt(seedMatch[1]) : 0,
          peers: 0,
          quality: parseQuality(title),
          codec: parseCodec(title),
          source: "AniDex",
          infoHash,
          magnetUri: linkMatch ? linkMatch[1] : buildMagnetUri(infoHash, title),
          provider: this.name,
        });
      }
    }

    return results.sort((a, b) => b.seeds - a.seeds);
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${bytes} B`;
  }
}

// ============================================================================
// TIER 2 - HIGH QUALITY SOURCES
// ============================================================================

// TorrentGalaxy - Uses IMDB search for better results
class TorrentGalaxyScraper implements Scraper {
  id = "torrentgalaxy";
  name = "TorrentGalaxy";
  tier = 2;
  type = "native" as const;
  specialty = "general" as const;

  // Updated mirrors - torrentgalaxy.to is the most reliable
  private mirrors = [
    "https://torrentgalaxy.to",
    "https://torrentgalaxy.mx",
    "https://tgx.sb",
  ];

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    // Try IMDB-based search first (more accurate)
    if (query.imdbId) {
      const results = await this.searchByImdb(query);
      if (results.length > 0) return results;
    }

    // Fallback to text search
    return this.searchByText(query);
  }

  private async searchByImdb(query: MediaQuery): Promise<TorrentResult[]> {
    for (const baseUrl of this.mirrors) {
      try {
        // TorrentGalaxy has IMDB search at /torrents.php?search=tt1234567
        const url = `${baseUrl}/torrents.php?search=${query.imdbId}&sort=seeders&order=desc`;
        console.log("TorrentGalaxy IMDB search:", url);

        const response = await tauriFetch(url, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });

        if (!response.ok) continue;

        const html = await response.text();
        let results = this.parseHTML(html);

        // Filter by season/episode for series
        if (
          query.type === "series" &&
          query.season !== undefined &&
          query.episode !== undefined
        ) {
          const episodePattern = new RegExp(
            `S${String(query.season).padStart(2, "0")}E${String(query.episode).padStart(2, "0")}`,
            "i",
          );
          results = results.filter((r) => episodePattern.test(r.title));
        }

        if (results.length > 0) return results;
      } catch (error) {
        console.error("TorrentGalaxy IMDB search failed:", error);
        continue;
      }
    }
    return [];
  }

  private async searchByText(query: MediaQuery): Promise<TorrentResult[]> {
    const searchTerm =
      query.type === "movie"
        ? `${query.title} ${query.year || ""}`
        : `${query.title} S${String(query.season).padStart(2, "0")}E${String(query.episode).padStart(2, "0")}`;

    for (const baseUrl of this.mirrors) {
      try {
        const url = `${baseUrl}/torrents.php?search=${encodeURIComponent(searchTerm)}&sort=seeders&order=desc`;
        console.log("TorrentGalaxy text search:", url);

        const response = await tauriFetch(url, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (!response.ok) continue;

        const html = await response.text();
        const results = this.parseHTML(html);
        if (results.length > 0) return results;
      } catch (error) {
        console.error("TorrentGalaxy text search failed:", error);
        continue;
      }
    }
    return [];
  }

  private parseHTML(html: string): TorrentResult[] {
    const results: TorrentResult[] = [];

    // Match torrent rows - TGX uses tgxtablerow class
    const rowRegex =
      /<div class="tgxtablerow[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi;
    const rows = html.match(rowRegex) || [];

    // Alternative: match table rows
    if (rows.length === 0) {
      const trRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
      const tableRows = html.match(trRegex) || [];

      for (const row of tableRows.slice(0, 25)) {
        const result = this.parseTableRow(row);
        if (result) results.push(result);
      }

      return results.sort((a, b) => b.seeds - a.seeds);
    }

    for (const row of rows.slice(0, 25)) {
      // Extract magnet link
      const magnetMatch = row.match(/href="(magnet:\?[^"]+)"/i);
      if (!magnetMatch) continue;

      const magnetUri = magnetMatch[1].replace(/&amp;/g, "&");
      const infoHash = this.extractInfoHash(magnetUri);
      if (!infoHash) continue;

      // Extract title
      const titleMatch =
        row.match(/title="([^"]+)"/i) || row.match(/<a[^>]*>([^<]+)<\/a>/i);
      const title = titleMatch
        ? this.decodeHtmlEntities(titleMatch[1].trim())
        : "Unknown";

      // Extract size
      const sizeMatch = row.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i);
      const sizeFormatted = sizeMatch ? sizeMatch[1] : "Unknown";

      // Extract seeds
      const seedMatch =
        row.match(/color[^>]*green[^>]*>(\d+)</i) ||
        row.match(/>(\d+)<\/font>/i);
      const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;

      results.push({
        id: `tgx-${infoHash.slice(0, 8)}`,
        title,
        size: this.parseSize(sizeFormatted),
        sizeFormatted,
        seeds,
        peers: 0,
        quality: parseQuality(title),
        codec: parseCodec(title),
        source: parseSource(title),
        infoHash,
        magnetUri,
        provider: this.name,
      });
    }

    return results.sort((a, b) => b.seeds - a.seeds);
  }

  private parseTableRow(row: string): TorrentResult | null {
    // Extract magnet link
    const magnetMatch = row.match(/href="(magnet:\?[^"]+)"/i);
    if (!magnetMatch) return null;

    const magnetUri = magnetMatch[1].replace(/&amp;/g, "&");
    const infoHash = this.extractInfoHash(magnetUri);
    if (!infoHash) return null;

    // Extract title
    const titleMatch =
      row.match(/title="([^"]+)"/i) || row.match(/<a[^>]*>([^<]+)<\/a>/i);
    const title = titleMatch
      ? this.decodeHtmlEntities(titleMatch[1].trim())
      : "Unknown";

    // Extract size
    const sizeMatch = row.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i);
    const sizeFormatted = sizeMatch ? sizeMatch[1] : "Unknown";

    // Extract seeds (look for green text or seed column)
    const seedMatch =
      row.match(/seed[^>]*>(\d+)</i) || row.match(/>(\d+)<\/span>/);
    const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;

    return {
      id: `tgx-${infoHash.slice(0, 8)}`,
      title,
      size: this.parseSize(sizeFormatted),
      sizeFormatted,
      seeds,
      peers: 0,
      quality: parseQuality(title),
      codec: parseCodec(title),
      source: parseSource(title),
      infoHash,
      magnetUri,
      provider: this.name,
    };
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  private extractInfoHash(magnetUri: string): string {
    const match = magnetUri.match(/btih:([a-fA-F0-9]{40})/i);
    return match ? match[1].toLowerCase() : "";
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB|TB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
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
}

// Rutor - Russian tracker with good international content
class RutorScraper implements Scraper {
  id = "rutor";
  name = "Rutor";
  tier = 2;
  type = "native" as const;
  specialty = "general" as const;

  private baseUrl = "https://rutor.info";

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    const searchTerm =
      query.type === "movie"
        ? `${query.title} ${query.year || ""}`
        : `${query.title} S${String(query.season).padStart(2, "0")}E${String(query.episode).padStart(2, "0")}`;

    try {
      const url = `${this.baseUrl}/search/0/0/000/0/${encodeURIComponent(searchTerm)}`;
      console.log("Rutor search:", url);

      const response = await tauriFetch(url, {
        method: "GET",
        headers: { "User-Agent": "FlowVid/1.0" },
      });

      if (!response.ok) return [];

      const html = await response.text();
      return this.parseHTML(html);
    } catch (error) {
      console.error("Rutor search failed:", error);
      return [];
    }
  }

  private parseHTML(html: string): TorrentResult[] {
    const results: TorrentResult[] = [];

    // Match table rows with torrent data
    const rowRegex = /<tr class="(?:gai|tum)"[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowRegex) || [];

    for (const row of rows.slice(0, 20)) {
      // Extract magnet link
      const magnetMatch = row.match(/href="(magnet:\?[^"]+)"/i);
      if (!magnetMatch) continue;

      const magnetUri = magnetMatch[1].replace(/&amp;/g, "&");
      const infoHash = this.extractInfoHash(magnetUri);

      // Extract title
      const titleMatch =
        row.match(/<a[^>]*class="downgif"[^>]*>([^<]+)<\/a>/i) ||
        row.match(/<td[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      const title = titleMatch ? titleMatch[1].trim() : "Unknown";

      // Extract size
      const sizeMatch = row.match(/>(\d+(?:\.\d+)?\s*(?:GB|MB|TB|Гб|Мб))</i);
      const sizeFormatted = sizeMatch ? sizeMatch[1] : "Unknown";

      // Extract seeds
      const seedMatch = row.match(/<span class="green">(\d+)<\/span>/);
      const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;

      results.push({
        id: `rutor-${infoHash.slice(0, 8)}`,
        title,
        size: this.parseSize(sizeFormatted),
        sizeFormatted,
        seeds,
        peers: 0,
        quality: parseQuality(title),
        codec: parseCodec(title),
        source: parseSource(title),
        infoHash,
        magnetUri,
        provider: this.name,
      });
    }

    return results.sort((a, b) => b.seeds - a.seeds);
  }

  private extractInfoHash(magnetUri: string): string {
    const match = magnetUri.match(/btih:([a-fA-F0-9]{40})/i);
    return match ? match[1].toLowerCase() : "";
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB|TB|Гб|Мб)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit.includes("T") || unit.includes("ТБ"))
      return value * 1024 * 1024 * 1024 * 1024;
    if (unit.includes("G") || unit.includes("ГБ"))
      return value * 1024 * 1024 * 1024;
    return value * 1024 * 1024;
  }
}

// Nyaa.si - Anime specialist
class NyaaScraper implements Scraper {
  id = "nyaa";
  name = "Nyaa";
  tier = 2;
  type = "native" as const;
  specialty = "anime" as const;

  private baseUrl = "https://nyaa.si";

  async search(query: MediaQuery): Promise<TorrentResult[]> {
    try {
      const url = `${this.baseUrl}/?page=rss&q=${encodeURIComponent(query.title)}&c=0_0&f=0`;
      const response = await tauriFetch(url, { method: "GET" });
      if (!response.ok) return [];

      const xml = await response.text();
      return this.parseRSS(xml);
    } catch (error) {
      return [];
    }
  }

  private parseRSS(xml: string): TorrentResult[] {
    const results: TorrentResult[] = [];
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

    for (const item of items) {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const seedMatch = item.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/);
      const sizeMatch = item.match(/<nyaa:size>(\d+)<\/nyaa:size>/);

      if (titleMatch && linkMatch) {
        const title = titleMatch[1];
        const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;
        const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;

        results.push({
          id: `nyaa-${Date.now()}-${Math.random()}`,
          title,
          size,
          sizeFormatted: this.formatBytes(size),
          seeds,
          peers: 0,
          quality: parseQuality(title),
          codec: parseCodec(title),
          source: "Nyaa",
          infoHash: "",
          magnetUri: linkMatch[1],
          provider: this.name,
        });
      }
    }

    return results.sort((a, b) => b.seeds - a.seeds).slice(0, 15);
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${bytes} B`;
  }
}

// ============================================================================
// EXPORT ALL SCRAPERS
// ============================================================================

export const scrapers: Scraper[] = [
  // Tier 1 - Primary (working scrapers with real implementations)
  new YTSScraper(), // Movies - working API
  new EZTVScraper(), // TV Shows - working API
  new The1337xScraper(), // General - HTML scraping
  new TPBScraper(), // General - working API (apibay.org)

  // Tier 2 - General (working with full implementations)
  new TorrentGalaxyScraper(), // General - IMDB search
  new LimeTorrentsScraper(), // General - HTML scraping
  new BitSearchScraper(), // General - Modern search engine
  new SolidTorrentsWorkingScraper(), // General - JSON API
  new RutorScraper(), // General - Russian/International

  // Tier 2 - Anime (working)
  new NyaaScraper(), // Anime - RSS feed
  new AniDexScraper(), // Anime - RSS feed

  // Tier 4 - Backup/Meta-scrapers
  new TorrentioScraper(), // Backup - Stremio addon (aggregates 25+ sources)
];
