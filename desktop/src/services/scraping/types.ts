export interface TorrentResult {
  id: string;
  title: string;
  size: number; // in bytes
  sizeFormatted: string;
  seeds: number;
  peers: number;
  quality: string;
  codec?: string;
  source?: string;
  magnetUri?: string;
  infoHash: string;
  provider: string;
}

export interface ScraperConfig {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl?: string;
}

export interface ScrapingResult {
  provider: string;
  results: TorrentResult[];
  error?: string;
  duration: number;
}

export interface MediaQuery {
  imdbId: string;
  type: "movie" | "series";
  title: string;
  year?: number;
  season?: number;
  episode?: number;
}

export const AVAILABLE_SCRAPERS: ScraperConfig[] = [
  { id: "torrentio", name: "Torrentio", enabled: true },
  { id: "mediafusion", name: "MediaFusion", enabled: true },
  { id: "yts", name: "YTS", enabled: true },
  { id: "eztv", name: "EZTV", enabled: true },
  { id: "1337x", name: "1337x", enabled: true },
  { id: "rarbg", name: "RARBG", enabled: true },
  { id: "piratebay", name: "The Pirate Bay", enabled: false },
];
