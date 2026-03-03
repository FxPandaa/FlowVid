import { TorrentResult } from "../scraping/types";
import {
  createDebridProvider,
  DebridProvider,
  TorBoxProvider,
  PremiumizeProvider,
} from "./providers";
import { useSettingsStore } from "../../stores/settingsStore";

export interface StreamLink {
  url: string;
  filename: string;
  filesize: number;
  quality?: string;
  isInstant: boolean;
}

// Cache for stream URLs to avoid duplicate API calls
interface StreamCache {
  url: string;
  filename: string;
  filesize: number;
  quality?: string;
  timestamp: number;
}

// Cache expires after 10 minutes (debrid URLs can expire quickly)
const CACHE_TTL = 10 * 60 * 1000;

export class DebridService {
  private provider: DebridProvider | null = null;
  private streamCache: Map<string, StreamCache> = new Map();

  constructor() {
    this.initProvider();
  }

  private initProvider() {
    const settings = useSettingsStore.getState();
    const apiKey = settings.getActiveApiKey();

    if (apiKey && settings.activeDebridService !== "none") {
      this.provider = createDebridProvider(
        settings.activeDebridService,
        apiKey,
      );
    }
  }

  private ensureProvider(): DebridProvider {
    if (!this.provider) {
      this.initProvider();
    }

    if (!this.provider) {
      throw new Error(
        "No debrid service configured. Please add an API key in settings.",
      );
    }

    return this.provider;
  }

  async validateApiKey(service: string, apiKey: string): Promise<boolean> {
    const provider = createDebridProvider(service, apiKey);
    if (!provider) return false;

    return provider.validateApiKey();
  }

  async getAccountInfo(): Promise<any> {
    const provider = this.ensureProvider();
    return provider.getAccountInfo();
  }

  // Check which torrents are instantly available (cached)
  async checkInstant(torrents: TorrentResult[]): Promise<Map<string, boolean>> {
    const provider = this.ensureProvider();
    const hashes = torrents.map((t) => t.infoHash);

    if (hashes.length === 0) {
      return new Map();
    }

    // Batch hashes in groups of 100
    const batchSize = 100;
    const results = new Map<string, boolean>();

    for (let i = 0; i < hashes.length; i += batchSize) {
      const batch = hashes.slice(i, i + batchSize);
      const availability = await provider.checkInstantAvailability(batch);

      for (const [hash, isInstant] of Object.entries(availability)) {
        results.set(hash, isInstant);
      }
    }

    return results;
  }

  // Clear the stream URL cache (e.g. when URLs expire)
  clearStreamCache(): void {
    this.streamCache.clear();
    console.log("Stream URL cache cleared");
  }

  // Get a streamable link for a torrent
  async getStreamLink(torrent: TorrentResult, forceRefresh = false): Promise<StreamLink> {
    try {
      const provider = this.ensureProvider();

      // Check cache first (unless forceRefresh is requested)
      const cacheKey = torrent.infoHash;
      if (!forceRefresh) {
        const cached = this.streamCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          console.log("Using cached stream URL for", torrent.title);
          return {
            url: cached.url,
            filename: cached.filename,
            filesize: cached.filesize,
            quality: cached.quality,
            isInstant: true,
          };
        }
      } else {
        // Bust the cache entry so a fresh link is fetched
        this.streamCache.delete(cacheKey);
        console.log("Force-refreshing stream URL for", torrent.title);
      }

      // Check if it has a magnet URI
      if (!torrent.magnetUri && !torrent.infoHash) {
        throw new Error("Torrent has no magnet URI or info hash");
      }

      const magnetUri =
        torrent.magnetUri ||
        this.buildMagnetUri(torrent.infoHash, torrent.title);

      // Add the magnet to debrid service
      console.log("Adding magnet to debrid...");
      const torrentId = await provider.addMagnet(magnetUri);
      console.log("Torrent added with ID:", torrentId);

      // Wait for the torrent to be processed
      let attempts = 0;
      const maxAttempts = 60; // Increase to 60 seconds for larger files
      let torrentInfo;

      while (attempts < maxAttempts) {
        torrentInfo = await provider.getTorrentInfo(torrentId);
        const progress = torrentInfo.progress || 0;
        console.log(
          `Torrent status (attempt ${attempts + 1}/${maxAttempts}):`,
          torrentInfo.status,
          "progress:",
          progress + "%",
          "links:",
          torrentInfo.links?.length || 0,
        );

        // Check if we have links - Real-Debrid provides links once download starts
        // You can stream while it's still downloading
        if (torrentInfo.links && torrentInfo.links.length > 0) {
          console.log("Links available, can stream now:", torrentInfo.links);
          break;
        }

        if (torrentInfo.status === "waiting_files_selection") {
          console.log(
            "Selecting files from:",
            torrentInfo.files?.length || 0,
            "files",
          );
          // Select the largest video file
          const videoFiles = torrentInfo.files.filter((f) =>
            /\.(mkv|mp4|avi|wmv|mov)$/i.test(f.path),
          );

          if (videoFiles.length > 0) {
            const largest = videoFiles.reduce((a, b) =>
              a.bytes > b.bytes ? a : b,
            );
            console.log(
              "Selecting largest video file:",
              largest.path,
              "id:",
              largest.id,
            );
            await provider.selectFiles(torrentId, [largest.id]);
          } else {
            // Select all files if no video files found
            console.log("No video files found, selecting all");
            await provider.selectFiles(
              torrentId,
              torrentInfo.files.map((f) => f.id),
            );
          }

          // Wait a bit after file selection for RD to process
          await this.delay(2000);

          // Immediately re-fetch to get updated links
          torrentInfo = await provider.getTorrentInfo(torrentId);
          console.log(
            "After file selection - status:",
            torrentInfo.status,
            "links:",
            torrentInfo.links?.length || 0,
          );

          if (torrentInfo.links && torrentInfo.links.length > 0) {
            console.log(
              "Links available after file selection:",
              torrentInfo.links,
            );
            break;
          }
        }

        if (
          torrentInfo.status === "error" ||
          torrentInfo.status === "virus" ||
          torrentInfo.status === "dead"
        ) {
          throw new Error(`Torrent failed: ${torrentInfo.status}`);
        }

        await this.delay(1000);
        attempts++;
      }

      console.log(
        "Loop ended. torrentInfo:",
        torrentInfo?.status,
        "links:",
        torrentInfo?.links,
      );

      if (
        !torrentInfo ||
        !torrentInfo.links ||
        torrentInfo.links.length === 0
      ) {
        throw new Error(
          `Timed out waiting for download links. Status: ${torrentInfo?.status}. ` +
            `The torrent may still be processing - try again in a moment.`,
        );
      }

      // Unrestrict the first link (RD/AD) or get download URL (TorBox/Premiumize)
      let resultUrl = "";
      let resultFilename = "";
      let resultFilesize = 0;

      if (provider instanceof TorBoxProvider) {
        // TorBox: use requestdl endpoint with torrent_id + file_id
        const videoFiles = (torrentInfo.files || []).filter((f) =>
          /\.(mkv|mp4|avi|wmv|mov)$/i.test(f.path),
        );
        const targetFile =
          videoFiles.length > 0
            ? videoFiles.reduce((a, b) => (a.bytes > b.bytes ? a : b))
            : torrentInfo.files?.[0];

        const fileId = targetFile?.id ?? 0;
        resultUrl = await provider.getDownloadLink(torrentId, fileId);
        resultFilename = targetFile?.path || torrentInfo.filename;
        resultFilesize = targetFile?.bytes || torrentInfo.bytes;
      } else if (provider instanceof PremiumizeProvider) {
        // Premiumize: use directdl with the magnet URI
        const dl = await provider.getDirectDownload(magnetUri);
        resultUrl = dl.url;
        resultFilename = dl.filename;
        resultFilesize = dl.filesize;
      } else {
        // RealDebrid / AllDebrid: unrestrict the link
        const link = await provider.unrestrictLink(torrentInfo.links[0]);
        resultUrl = link.download;
        resultFilename = link.filename;
        resultFilesize = link.filesize;
      }

      const result: StreamLink = {
        url: resultUrl,
        filename: resultFilename,
        filesize: resultFilesize,
        quality: torrent.quality,
        isInstant: true,
      };

      // Cache the result
      this.streamCache.set(cacheKey, {
        url: result.url,
        filename: result.filename,
        filesize: result.filesize,
        quality: result.quality,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      console.error("getStreamLink error:", error);
      if (error instanceof Error) {
        throw new Error(`Debrid error: ${error.message}`);
      }
      throw new Error(`Debrid error: ${String(error)}`);
    }
  }

  // Get stream link from a cached torrent (instant)
  async getInstantStreamLink(torrent: TorrentResult): Promise<StreamLink> {
    const provider = this.ensureProvider();

    // Check cache first
    const cacheKey = torrent.infoHash;
    const cached = this.streamCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log("Using cached stream URL for", torrent.title);
      return {
        url: cached.url,
        filename: cached.filename,
        filesize: cached.filesize,
        quality: cached.quality,
        isInstant: true,
      };
    }

    const magnetUri =
      torrent.magnetUri || this.buildMagnetUri(torrent.infoHash, torrent.title);

    // For cached torrents, the process is usually faster
    const torrentId = await provider.addMagnet(magnetUri);

    // Wait briefly for processing
    await this.delay(500);

    const torrentInfo = await provider.getTorrentInfo(torrentId);

    if (torrentInfo.status === "waiting_files_selection") {
      const videoFiles = torrentInfo.files.filter((f) =>
        /\.(mkv|mp4|avi|wmv|mov)$/i.test(f.path),
      );

      if (videoFiles.length > 0) {
        const largest = videoFiles.reduce((a, b) =>
          a.bytes > b.bytes ? a : b,
        );
        await provider.selectFiles(torrentId, [largest.id]);
        await this.delay(500);
      }
    }

    // Get updated info with links
    const updatedInfo = await provider.getTorrentInfo(torrentId);

    if (!updatedInfo.links || updatedInfo.links.length === 0) {
      throw new Error("No links available - torrent may not be cached");
    }

    // Provider-specific link resolution
    let resultUrl = "";
    let resultFilename = "";
    let resultFilesize = 0;

    if (provider instanceof TorBoxProvider) {
      const videoFiles = (updatedInfo.files || []).filter((f) =>
        /\.(mkv|mp4|avi|wmv|mov)$/i.test(f.path),
      );
      const targetFile =
        videoFiles.length > 0
          ? videoFiles.reduce((a, b) => (a.bytes > b.bytes ? a : b))
          : updatedInfo.files?.[0];

      const fileId = targetFile?.id ?? 0;
      resultUrl = await provider.getDownloadLink(torrentId, fileId);
      resultFilename = targetFile?.path || updatedInfo.filename;
      resultFilesize = targetFile?.bytes || updatedInfo.bytes;
    } else if (provider instanceof PremiumizeProvider) {
      const dl = await provider.getDirectDownload(magnetUri);
      resultUrl = dl.url;
      resultFilename = dl.filename;
      resultFilesize = dl.filesize;
    } else {
      const link = await provider.unrestrictLink(updatedInfo.links[0]);
      resultUrl = link.download;
      resultFilename = link.filename;
      resultFilesize = link.filesize;
    }

    const result: StreamLink = {
      url: resultUrl,
      filename: resultFilename,
      filesize: resultFilesize,
      quality: torrent.quality,
      isInstant: true,
    };

    // Cache the result
    this.streamCache.set(cacheKey, {
      url: result.url,
      filename: result.filename,
      filesize: result.filesize,
      quality: result.quality,
      timestamp: Date.now(),
    });

    return result;
  }

  private buildMagnetUri(hash: string, name: string): string {
    const trackers = [
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://open.stealth.si:80/announce",
      "udp://tracker.torrent.eu.org:451/announce",
      "udp://tracker.bittor.pw:1337/announce",
      "udp://public.popcorn-tracker.org:6969/announce",
      "udp://tracker.dler.org:6969/announce",
      "udp://exodus.desync.com:6969/announce",
      "udp://open.demonii.si:1337/announce",
    ];

    const trackersParam = trackers
      .map((t) => `&tr=${encodeURIComponent(t)}`)
      .join("");
    return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${trackersParam}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const debridService = new DebridService();
