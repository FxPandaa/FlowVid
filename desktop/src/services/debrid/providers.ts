import { TorrentInfo, UnrestrictedLink, DEBRID_CONFIGS } from "./types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export interface DebridProvider {
  id: string;
  name: string;

  // Account
  validateApiKey(): Promise<boolean>;
  getAccountInfo(): Promise<any>;

  // Torrents
  addMagnet(magnetUri: string): Promise<string>; // Returns torrent ID
  getTorrentInfo(torrentId: string): Promise<TorrentInfo>;
  selectFiles(torrentId: string, fileIds: number[]): Promise<void>;
  deleteTorrent(torrentId: string): Promise<void>;

  // Instant availability
  checkInstantAvailability(hashes: string[]): Promise<Record<string, boolean>>;

  // Links
  unrestrictLink(link: string): Promise<UnrestrictedLink>;
}

// Real-Debrid implementation
export class RealDebridProvider implements DebridProvider {
  id = "realdebrid";
  name = "Real-Debrid";

  private apiKey: string;
  private baseUrl = DEBRID_CONFIGS.realdebrid.apiBaseUrl;
  private lastRequestTime = 0;
  private minRequestInterval = 500; // Minimum 500ms between requests

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Ensure we don't make requests too quickly
  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retries = 3,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Throttle requests to avoid rate limiting
    await this.throttle();

    for (let attempt = 0; attempt < retries; attempt++) {
      const response = await tauriFetch(url, {
        method: options.method || "GET",
        body: options.body as any,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        let error: any = {};
        try {
          error = JSON.parse(text);
        } catch {
          error = { error: text || `Request failed: ${response.status}` };
        }

        // Handle rate limiting with retry
        if (
          response.status === 429 ||
          error.error === "too_many_requests" ||
          error.error_code === 5
        ) {
          if (attempt < retries - 1) {
            const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
            console.log(
              `Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})`,
            );
            await this.sleep(delay);
            continue;
          }
          // All retries exhausted for rate limiting
          throw new Error(
            `Rate limited by Real-Debrid. Please wait a moment and try again.`,
          );
        }

        throw new Error(
          error.error ||
            error.message ||
            `Request failed with status ${response.status}`,
        );
      }

      // Handle empty responses
      const text = await response.text();
      if (!text || text.trim() === "") {
        return {} as T;
      }

      try {
        return JSON.parse(text);
      } catch {
        return {} as T;
      }
    }

    throw new Error("Max retries exceeded");
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.request("/user");
      return true;
    } catch {
      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    return this.request("/user");
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const formData = new FormData();
    formData.append("magnet", magnetUri);

    const result = await this.request<{ id: string }>("/torrents/addMagnet", {
      method: "POST",
      body: formData,
    });

    return result.id;
  }

  async getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
    const result = await this.request<any>(`/torrents/info/${torrentId}`);

    // Debug log raw response
    console.log("Raw RD torrent info:", {
      status: result.status,
      progress: result.progress,
      links: result.links,
      files: result.files?.map((f: any) => ({
        id: f.id,
        path: f.path,
        selected: f.selected,
      })),
    });

    return {
      id: result.id,
      filename: result.filename,
      hash: result.hash,
      bytes: result.bytes,
      files: (result.files || []).map((f: any, i: number) => ({
        id: f.id !== undefined ? f.id : i + 1, // RD file IDs are 1-based
        path: f.path,
        bytes: f.bytes,
        selected: f.selected === 1,
      })),
      status: result.status,
      progress: result.progress,
      links: result.links || [],
    };
  }

  async selectFiles(torrentId: string, fileIds: number[]): Promise<void> {
    const formData = new FormData();
    formData.append("files", fileIds.join(","));

    await this.request(`/torrents/selectFiles/${torrentId}`, {
      method: "POST",
      body: formData,
    });
  }

  async deleteTorrent(torrentId: string): Promise<void> {
    await this.request(`/torrents/delete/${torrentId}`, {
      method: "DELETE",
    });
  }

  async checkInstantAvailability(
    hashes: string[],
  ): Promise<Record<string, boolean>> {
    // Real-Debrid disabled this endpoint, return all as potentially available
    // The actual availability will be checked when adding the magnet
    const availability: Record<string, boolean> = {};
    for (const hash of hashes) {
      availability[hash] = true; // Assume available, will fail gracefully if not
    }
    return availability;
  }

  async unrestrictLink(link: string): Promise<UnrestrictedLink> {
    const formData = new FormData();
    formData.append("link", link);

    const result = await this.request<any>("/unrestrict/link", {
      method: "POST",
      body: formData,
    });

    return {
      id: result.id,
      filename: result.filename,
      filesize: result.filesize,
      link: result.link,
      host: result.host,
      streamable: result.streamable === 1,
      download: result.download,
      mimeType: result.mimeType,
      quality: result.quality,
    };
  }
}

// AllDebrid implementation
export class AllDebridProvider implements DebridProvider {
  id = "alldebrid";
  name = "AllDebrid";

  private apiKey: string;
  private baseUrl = DEBRID_CONFIGS.alldebrid.apiBaseUrl;
  private agent = "FlowVid";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append("agent", this.agent);
    url.searchParams.append("apikey", this.apiKey);

    const response = await tauriFetch(url.toString(), {
      method: options.method || "GET",
      body: options.body as any,
    });

    if (!response.ok) {
      const text = await response.text();
      let error: any = {};
      try {
        error = JSON.parse(text);
      } catch {
        error = {
          error: { message: text || `Request failed: ${response.status}` },
        };
      }
      throw new Error(
        error.error?.message || `Request failed: ${response.status}`,
      );
    }

    const text = await response.text();
    if (!text || text.trim() === "") {
      return {} as T;
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return {} as T;
    }

    if (data.status !== "success") {
      throw new Error(data.error?.message || "Request failed");
    }

    return data.data;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.request("/user");
      return true;
    } catch {
      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    return this.request("/user");
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const formData = new FormData();
    formData.append("magnets[]", magnetUri);

    const result = await this.request<any>("/magnet/upload", {
      method: "POST",
      body: formData,
    });

    return result.magnets[0].id.toString();
  }

  async getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
    const result = await this.request<any>(`/magnet/status?id=${torrentId}`);
    const magnet = result.magnets;

    return {
      id: magnet.id.toString(),
      filename: magnet.filename,
      hash: magnet.hash,
      bytes: magnet.size,
      files: (magnet.links || []).map((link: any, i: number) => ({
        id: i,
        path: link.filename,
        bytes: link.size,
        selected: true,
      })),
      status: magnet.status,
      progress: magnet.downloaded ? (magnet.downloaded / magnet.size) * 100 : 0,
      links: magnet.links?.map((l: any) => l.link) || [],
    };
  }

  async selectFiles(_torrentId: string, _fileIds: number[]): Promise<void> {
    // AllDebrid auto-selects all files
  }

  async deleteTorrent(torrentId: string): Promise<void> {
    await this.request(`/magnet/delete?id=${torrentId}`, {
      method: "GET",
    });
  }

  async checkInstantAvailability(
    hashes: string[],
  ): Promise<Record<string, boolean>> {
    const result = await this.request<any>(
      `/magnet/instant?magnets[]=${hashes.join("&magnets[]=")}`,
    );

    const availability: Record<string, boolean> = {};

    for (let i = 0; i < hashes.length; i++) {
      availability[hashes[i]] = result.magnets[i]?.instant || false;
    }

    return availability;
  }

  async unrestrictLink(link: string): Promise<UnrestrictedLink> {
    const result = await this.request<any>(
      `/link/unlock?link=${encodeURIComponent(link)}`,
    );

    return {
      id: result.id,
      filename: result.filename,
      filesize: result.filesize,
      link: result.link,
      host: result.host,
      streamable: result.streaming ? true : false,
      download: result.link,
    };
  }
}

// Factory function
export function createDebridProvider(
  service: string,
  apiKey: string,
): DebridProvider | null {
  switch (service) {
    case "realdebrid":
      return new RealDebridProvider(apiKey);
    case "alldebrid":
      return new AllDebridProvider(apiKey);
    case "torbox":
      return new TorBoxProvider(apiKey);
    case "premiumize":
      return new PremiumizeProvider(apiKey);
    default:
      return null;
  }
}

// ============================================================================
// TorBox implementation
// ============================================================================
export class TorBoxProvider implements DebridProvider {
  id = "torbox";
  name = "TorBox";

  private apiKey: string;
  private baseUrl = DEBRID_CONFIGS.torbox.apiBaseUrl;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await tauriFetch(url, {
      method: options.method || "GET",
      body: options.body as any,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      let error: any = {};
      try {
        error = JSON.parse(text);
      } catch {
        error = { detail: text || `Request failed: ${response.status}` };
      }
      throw new Error(
        error.detail || error.error || `Request failed: ${response.status}`,
      );
    }

    const text = await response.text();
    if (!text || text.trim() === "") return {} as T;

    try {
      const json = JSON.parse(text);
      // TorBox wraps responses in { success, error, detail, data }
      if (json.success === false) {
        throw new Error(json.detail || json.error || "Request failed");
      }
      return json.data !== undefined ? json.data : json;
    } catch (e) {
      if (e instanceof SyntaxError) return {} as T;
      throw e;
    }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.request("/user/me");
      return true;
    } catch {
      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    return this.request("/user/me");
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const formData = new FormData();
    formData.append("magnet", magnetUri);

    const result = await this.request<any>("/torrents/createtorrent", {
      method: "POST",
      body: formData,
    });

    return result.torrent_id?.toString() || result.id?.toString();
  }

  async getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
    const result = await this.request<any>(`/torrents/mylist?id=${torrentId}`);

    // TorBox returns a single torrent object when id is provided
    const torrent = result;

    const statusMap: Record<string, string> = {
      cached: "downloaded",
      downloading: "downloading",
      uploading: "downloading",
      paused: "queued",
      completed: "downloaded",
      metaDL: "queued",
      checkingDL: "downloading",
      stalled: "downloading",
      "stalled (no seeds)": "downloading",
      stalledUP: "downloaded",
    };

    // TorBox can generate download links even while downloading/stalled
    // as long as there are files available
    const canRequestDownload =
      torrent.download_state === "cached" ||
      torrent.download_state === "completed" ||
      torrent.download_state === "stalledUP" ||
      torrent.download_state === "downloading" ||
      torrent.download_state === "stalled" ||
      torrent.download_state === "stalled (no seeds)" ||
      torrent.download_state === "uploading";

    return {
      id: torrent.id?.toString(),
      filename: torrent.name || "",
      hash: torrent.hash || "",
      bytes: torrent.size || 0,
      files: (torrent.files || []).map((f: any, i: number) => ({
        id: f.id !== undefined ? f.id : i,
        path: f.name || f.short_name || "",
        bytes: f.size || 0,
        selected: true,
      })),
      status:
        statusMap[torrent.download_state] ||
        torrent.download_state ||
        "unknown",
      progress: torrent.progress ? torrent.progress * 100 : 0,
      links:
        canRequestDownload && (torrent.files || []).length > 0 ? ["ready"] : [],
    };
  }

  async selectFiles(_torrentId: string, _fileIds: number[]): Promise<void> {
    // TorBox doesn't require explicit file selection like RD
    // Files are selected at download/request time
  }

  async deleteTorrent(torrentId: string): Promise<void> {
    await this.request("/torrents/controltorrent", {
      method: "POST",
      body: JSON.stringify({
        torrent_id: parseInt(torrentId),
        operation: "delete",
      }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async checkInstantAvailability(
    hashes: string[],
  ): Promise<Record<string, boolean>> {
    if (hashes.length === 0) return {};

    const availability: Record<string, boolean> = {};

    // TorBox supports comma-separated hashes in query param
    const batchSize = 100;
    for (let i = 0; i < hashes.length; i += batchSize) {
      const batch = hashes.slice(i, i + batchSize);
      try {
        const result = await this.request<any>(
          `/torrents/checkcached?hash=${batch.join(",")}&format=list`,
        );

        // result is an array of hashes that are cached
        const cachedSet = new Set(
          Array.isArray(result)
            ? result.map((h: any) =>
                typeof h === "string" ? h.toLowerCase() : "",
              )
            : [],
        );

        for (const hash of batch) {
          availability[hash] = cachedSet.has(hash.toLowerCase());
        }
      } catch {
        // If check fails, assume not cached
        for (const hash of batch) {
          availability[hash] = false;
        }
      }
    }

    return availability;
  }

  async unrestrictLink(link: string): Promise<UnrestrictedLink> {
    // For TorBox, "link" is actually "ready" sentinel from getTorrentInfo.
    // The real download URL comes from the requestdl endpoint.
    // We need the torrent_id and file_id, which we'll encode in the link.
    // This method gets called with the torrent link from links[]
    // We handle this in a special way - see getStreamLink override.

    // If link is a real URL, just return it
    if (link.startsWith("http")) {
      return {
        id: "",
        filename: "",
        filesize: 0,
        link: link,
        host: "torbox",
        streamable: true,
        download: link,
      };
    }

    // Placeholder - actual TorBox download flow is handled in getDownloadLink
    return {
      id: "",
      filename: "",
      filesize: 0,
      link: "",
      host: "torbox",
      streamable: false,
      download: "",
    };
  }

  /**
   * TorBox-specific: Get a direct download link for a torrent file.
   * Uses the requestdl endpoint with token query param.
   */
  async getDownloadLink(torrentId: string, fileId: number): Promise<string> {
    const url = `${this.baseUrl}/torrents/requestdl?token=${this.apiKey}&torrent_id=${torrentId}&file_id=${fileId}`;

    const response = await tauriFetch(url, { method: "GET" });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get download link: ${text}`);
    }

    const json = JSON.parse(await response.text());
    if (!json.success) {
      throw new Error(json.detail || "Failed to get download link");
    }

    return json.data;
  }
}

// ============================================================================
// Premiumize implementation
// ============================================================================
export class PremiumizeProvider implements DebridProvider {
  id = "premiumize";
  name = "Premiumize";

  private apiKey: string;
  private baseUrl = DEBRID_CONFIGS.premiumize.apiBaseUrl;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const separator = endpoint.includes("?") ? "&" : "?";
    const url = `${this.baseUrl}${endpoint}${separator}apikey=${this.apiKey}`;

    const response = await tauriFetch(url, {
      method: options.method || "GET",
      body: options.body as any,
      headers: (options.headers as Record<string, string>) || {},
    });

    if (!response.ok) {
      const text = await response.text();
      let error: any = {};
      try {
        error = JSON.parse(text);
      } catch {
        error = { message: text || `Request failed: ${response.status}` };
      }
      throw new Error(error.message || `Request failed: ${response.status}`);
    }

    const text = await response.text();
    if (!text || text.trim() === "") return {} as T;

    try {
      const data = JSON.parse(text);
      if (data.status === "error") {
        throw new Error(data.message || "Request failed");
      }
      return data;
    } catch (e) {
      if (e instanceof SyntaxError) return {} as T;
      throw e;
    }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const result = await this.request<any>("/account/info");
      return result.status === "success";
    } catch {
      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    return this.request("/account/info");
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const formData = new FormData();
    formData.append("src", magnetUri);

    const result = await this.request<any>("/transfer/create", {
      method: "POST",
      body: formData,
    });

    return result.id?.toString();
  }

  async getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
    const result = await this.request<any>("/transfer/list");

    const transfer = (result.transfers || []).find(
      (t: any) => t.id?.toString() === torrentId,
    );

    if (!transfer) {
      throw new Error(`Transfer ${torrentId} not found`);
    }

    const statusMap: Record<string, string> = {
      finished: "downloaded",
      running: "downloading",
      waiting: "queued",
      seeding: "downloaded",
      queued: "queued",
      error: "error",
      deleted: "error",
      banned: "error",
      timeout: "error",
    };

    return {
      id: transfer.id?.toString(),
      filename: transfer.name || "",
      hash: transfer.src?.match(/btih:([a-fA-F0-9]+)/)?.[1] || "",
      bytes: transfer.size || 0,
      files: [],
      status: statusMap[transfer.status] || transfer.status,
      progress: transfer.progress ? transfer.progress * 100 : 0,
      links:
        transfer.status === "finished" || transfer.status === "seeding"
          ? [transfer.file_id || transfer.folder_id || "ready"]
          : [],
    };
  }

  async selectFiles(_torrentId: string, _fileIds: number[]): Promise<void> {
    // Premiumize doesn't require explicit file selection
  }

  async deleteTorrent(torrentId: string): Promise<void> {
    const formData = new FormData();
    formData.append("id", torrentId);

    await this.request("/transfer/delete", {
      method: "POST",
      body: formData,
    });
  }

  async checkInstantAvailability(
    hashes: string[],
  ): Promise<Record<string, boolean>> {
    if (hashes.length === 0) return {};

    const availability: Record<string, boolean> = {};

    // Premiumize uses items[] query params
    const batchSize = 100;
    for (let i = 0; i < hashes.length; i += batchSize) {
      const batch = hashes.slice(i, i + batchSize);
      const itemsParam = batch
        .map((h) => `items[]=${encodeURIComponent(h)}`)
        .join("&");

      try {
        const result = await this.request<any>(`/cache/check?${itemsParam}`);

        // Premiumize returns parallel boolean array in result.response
        const responses = result.response || [];
        for (let j = 0; j < batch.length; j++) {
          availability[batch[j]] = responses[j] === true;
        }
      } catch {
        for (const hash of batch) {
          availability[hash] = false;
        }
      }
    }

    return availability;
  }

  async unrestrictLink(link: string): Promise<UnrestrictedLink> {
    // For Premiumize, we use directdl with the magnet link
    // If link is a real URL, unrestrict it
    if (link.startsWith("http")) {
      // Direct link, return as-is
      return {
        id: "",
        filename: "",
        filesize: 0,
        link: link,
        host: "premiumize",
        streamable: true,
        download: link,
      };
    }

    // "ready" sentinel or file/folder ID — handled in getStreamLink in service.ts
    return {
      id: "",
      filename: "",
      filesize: 0,
      link: "",
      host: "premiumize",
      streamable: false,
      download: "",
    };
  }

  /**
   * Premiumize-specific: Get direct download link for a magnet.
   * This is the preferred way to stream cached content.
   */
  async getDirectDownload(
    magnetUri: string,
  ): Promise<{ url: string; filename: string; filesize: number }> {
    const formData = new FormData();
    formData.append("src", magnetUri);

    const result = await this.request<any>("/transfer/directdl", {
      method: "POST",
      body: formData,
    });

    // If there are multiple files, find the largest video file
    if (result.content && result.content.length > 0) {
      const videoFiles = result.content.filter((f: any) =>
        /\.(mkv|mp4|avi|wmv|mov)$/i.test(f.path || ""),
      );

      const target =
        videoFiles.length > 0
          ? videoFiles.reduce((a: any, b: any) =>
              (a.size || 0) > (b.size || 0) ? a : b,
            )
          : result.content[0];

      return {
        url: target.stream_link || target.link || result.location,
        filename: target.path?.split("/").pop() || result.filename || "",
        filesize: target.size || result.filesize || 0,
      };
    }

    return {
      url: result.location || "",
      filename: result.filename || "",
      filesize: result.filesize || 0,
    };
  }
}
