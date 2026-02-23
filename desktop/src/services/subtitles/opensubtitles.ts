import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// Use Stremio's OpenSubtitles addon as a proxy (solves CORS + Tauri issues)
// This provides direct download URLs that work without authentication
const STREMIO_SUBS_API = "https://opensubtitles-v3.strem.io/subtitles";

export interface Subtitle {
  id: string;
  language: string;
  languageCode: string;
  fileName: string;
  downloadUrl: string;
  format: string; // srt, vtt, etc.
  rating: number;
  downloads: number;
  hearing_impaired: boolean;
  foreignPartsOnly: boolean;
}

export interface SubtitleSearchParams {
  imdbId: string;
  season?: number;
  episode?: number;
  languages?: string[]; // ISO 639-2 codes like 'eng', 'nld', 'spa'
}

// Map 3-letter language codes to their full names
const LANGUAGE_NAMES: Record<string, string> = {
  eng: "English",
  nld: "Dutch",
  dut: "Dutch",
  spa: "Spanish",
  fra: "French",
  fre: "French",
  deu: "German",
  ger: "German",
  ita: "Italian",
  por: "Portuguese",
  rus: "Russian",
  jpn: "Japanese",
  kor: "Korean",
  zho: "Chinese",
  chi: "Chinese",
  ara: "Arabic",
  hin: "Hindi",
  tur: "Turkish",
  pol: "Polish",
  swe: "Swedish",
  nor: "Norwegian",
  dan: "Danish",
  fin: "Finnish",
  hun: "Hungarian",
  ces: "Czech",
  cze: "Czech",
  ron: "Romanian",
  rum: "Romanian",
  ell: "Greek",
  gre: "Greek",
  heb: "Hebrew",
  tha: "Thai",
  vie: "Vietnamese",
  ind: "Indonesian",
};

class OpenSubtitlesService {
  /**
   * Search for subtitles using Stremio's OpenSubtitles addon
   * This bypasses CORS and Tauri HTTP issues by using Stremio's backend
   */
  async search(params: SubtitleSearchParams): Promise<Subtitle[]> {
    const results: Subtitle[] = [];

    // Ensure IMDB ID has 'tt' prefix
    const imdbId = params.imdbId.startsWith("tt")
      ? params.imdbId
      : `tt${params.imdbId}`;

    // Build the API URL based on content type
    let url: string;
    let type: string;

    if (params.season !== undefined && params.episode !== undefined) {
      // TV Series: format is /subtitles/series/tt12345:season:episode.json
      type = "series";
      url = `${STREMIO_SUBS_API}/${type}/${imdbId}:${params.season}:${params.episode}.json`;
    } else {
      // Movie: format is /subtitles/movie/tt12345.json
      type = "movie";
      url = `${STREMIO_SUBS_API}/${type}/${imdbId}.json`;
    }

    console.log("Stremio OpenSubtitles search:", url);

    try {
      const response = await tauriFetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        connectTimeout: 15000,
      });

      if (!response.ok) {
        console.warn(`Stremio subtitles failed: ${response.status}`);
        return results;
      }

      const data = await response.json();
      const subtitles = data.subtitles || [];

      console.log(`Found ${subtitles.length} subtitles from Stremio addon`);

      // Filter by preferred languages if specified
      const preferredLanguages = params.languages || ["eng"];

      for (const sub of subtitles) {
        const langCode = sub.lang || "";

        // Only include subtitles that match preferred languages
        const isPreferred = preferredLanguages.some(
          (pref) =>
            langCode.toLowerCase() === pref.toLowerCase() ||
            langCode.toLowerCase().startsWith(pref.toLowerCase().slice(0, 2)),
        );

        if (!isPreferred) continue; // Skip non-preferred languages

        results.push({
          id: sub.id || `stremio-${Date.now()}-${Math.random()}`,
          language: LANGUAGE_NAMES[langCode] || langCode,
          languageCode: langCode,
          fileName: `subtitle-${sub.id}.srt`,
          downloadUrl: sub.url || "",
          format: "srt",
          rating: 0,
          downloads: 0,
          hearing_impaired: sub.m === "h" || false,
          foreignPartsOnly: false,
        });
      }

      // Sort by language name
      results.sort((a, b) => a.language.localeCompare(b.language));

      // Limit to max 5 per language to avoid overwhelming the menu
      const langCounts: Record<string, number> = {};
      const limited: Subtitle[] = [];
      for (const sub of results) {
        const count = langCounts[sub.languageCode] || 0;
        if (count < 5) {
          limited.push(sub);
          langCounts[sub.languageCode] = count + 1;
        }
      }
      return limited;
    } catch (error) {
      console.error("Error searching subtitles:", error);
    }

    return results;
  }

  /**
   * Download subtitle file from URL
   * Stremio's subs server returns properly encoded UTF-8 content
   */
  async download(subtitle: Subtitle): Promise<string> {
    try {
      console.log("Downloading subtitle:", subtitle.downloadUrl);

      // Use Tauri fetch for Stremio's subtitle URLs
      const response = await tauriFetch(subtitle.downloadUrl, {
        method: "GET",
        headers: {
          Accept: "text/plain, text/vtt, application/x-subrip, */*",
        },
        connectTimeout: 15000,
      });

      if (!response.ok) {
        throw new Error(`Failed to download subtitle: ${response.status}`);
      }

      // Get the raw bytes
      const arrayBuffer = await response.arrayBuffer();

      // Try to decompress gzip data
      try {
        const decompressed = await this.decompressGzip(arrayBuffer);
        console.log(
          "Successfully decompressed subtitle, length:",
          decompressed.length,
        );
        return decompressed;
      } catch (e) {
        // If decompression fails, try as plain text
        console.log("Not gzipped, trying as plain text");
        const decoder = new TextDecoder("utf-8");
        return decoder.decode(arrayBuffer);
      }
    } catch (error) {
      console.error("Failed to download subtitle:", error);
      throw error;
    }
  }

  /**
   * Decompress gzip data using DecompressionStream API
   */
  private async decompressGzip(data: ArrayBuffer): Promise<string> {
    // Check for gzip magic bytes (1f 8b)
    const header = new Uint8Array(data.slice(0, 2));
    if (header[0] !== 0x1f || header[1] !== 0x8b) {
      throw new Error("Not gzip data");
    }

    // Use DecompressionStream for gzip decompression
    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();
    writer.write(data);
    writer.close();

    // Read decompressed data
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    // Decode as text
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(result);
  }
}

export const openSubtitlesService = new OpenSubtitlesService();
