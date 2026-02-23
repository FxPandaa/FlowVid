/**
 * Stream Info Parser - Extracts quality, codec, HDR, and audio info from torrent titles
 */

export interface StreamInfo {
  // Video
  resolution: string;
  resolutionBadge: "4K" | "1080p" | "720p" | "480p" | "Unknown";
  videoCodec: string;
  bitDepth?: string;

  // HDR
  hdrType: "SDR" | "HDR10" | "HDR10+" | "Dolby Vision" | "HLG";
  dolbyVisionProfile?: string;
  isHDR: boolean;
  hasDolbyVision: boolean; // True if DV is present (for dual-layer detection)
  hasHDR10Plus: boolean; // True if HDR10+ is present (for dual-layer detection)

  // Audio
  audioCodec: string;
  audioChannels: string;
  hasAtmos: boolean;

  // Source
  source: string;
  releaseGroup: string;

  // Additional
  languages: string[];
  isRemux: boolean;
  is3D: boolean;
}

// Color scheme for badges
export const BADGE_COLORS = {
  SDR: "#6B7280",
  HDR10: "#F59E0B",
  "HDR10+": "#F59E0B",
  "Dolby Vision": "#007AFF",
  Atmos: "#3B82F6",
  "4K": "#10B981",
  "1080p": "#3B82F6",
  "720p": "#6B7280",
  "480p": "#4B5563",
  HEVC: "#3b82f6",
  AV1: "#EC4899",
  x264: "#6B7280",
  Remux: "#F59E0B",
};

/**
 * Parse torrent title to extract stream information
 */
export function parseStreamInfo(title: string): StreamInfo {
  const t = title.toUpperCase();

  // Detect DV and HDR10+ separately for dual-layer detection
  const hasDolbyVision =
    t.includes("DOLBY VISION") ||
    t.includes("DOLBYVISION") ||
    t.includes("DOVI") ||
    /[.\s]DV[.\s]/.test(t) ||
    /\bDV\b/.test(t) ||
    /DOV[I]?/.test(t);

  const hasHDR10Plus =
    t.includes("HDR10+") || t.includes("HDR10PLUS") || t.includes("HDR10 PLUS");

  return {
    resolution: parseResolution(t),
    resolutionBadge: parseResolutionBadge(t),
    videoCodec: parseVideoCodec(t),
    bitDepth: parseBitDepth(t),
    hdrType: parseHDRType(t),
    dolbyVisionProfile: parseDolbyVisionProfile(t),
    isHDR: detectHDR(t),
    hasDolbyVision,
    hasHDR10Plus,
    audioCodec: parseAudioCodec(t),
    audioChannels: parseAudioChannels(t),
    hasAtmos: detectAtmos(t),
    source: parseSource(t),
    releaseGroup: parseReleaseGroup(title),
    languages: parseLanguages(t),
    isRemux: t.includes("REMUX"),
    is3D: detect3D(t),
  };
}

function parseResolution(t: string): string {
  if (t.includes("2160P") || t.includes("4K") || t.includes("UHD"))
    return "2160p";
  if (t.includes("1080P") || t.includes("FHD")) return "1080p";
  if (t.includes("720P") || t.includes("HD")) return "720p";
  if (t.includes("480P") || t.includes("SD")) return "480p";
  if (t.includes("576P")) return "576p";
  return "Unknown";
}

function parseResolutionBadge(
  t: string,
): "4K" | "1080p" | "720p" | "480p" | "Unknown" {
  if (t.includes("2160P") || t.includes("4K") || t.includes("UHD")) return "4K";
  if (t.includes("1080P") || t.includes("FHD")) return "1080p";
  if (t.includes("720P")) return "720p";
  if (t.includes("480P") || t.includes("SD")) return "480p";
  return "Unknown";
}

function parseVideoCodec(t: string): string {
  if (
    t.includes("HEVC") ||
    t.includes("X265") ||
    t.includes("H.265") ||
    t.includes("H265")
  )
    return "HEVC";
  if (
    t.includes("X264") ||
    t.includes("H.264") ||
    t.includes("H264") ||
    t.includes("AVC")
  )
    return "x264";
  if (t.includes("AV1")) return "AV1";
  if (t.includes("VP9")) return "VP9";
  if (t.includes("XVID") || t.includes("DIVX")) return "XviD";
  return "";
}

function parseBitDepth(t: string): string | undefined {
  if (t.includes("10BIT") || t.includes("10-BIT") || t.includes("HI10P"))
    return "10-bit";
  if (t.includes("12BIT") || t.includes("12-BIT")) return "12-bit";
  if (t.includes("8BIT") || t.includes("8-BIT")) return "8-bit";
  return undefined;
}

function parseHDRType(
  t: string,
): "SDR" | "HDR10" | "HDR10+" | "Dolby Vision" | "HLG" {
  // Check for Dolby Vision
  const hasDV =
    t.includes("DOLBY VISION") ||
    t.includes("DOLBYVISION") ||
    t.includes("DOVI") ||
    /[.\s]DV[.\s]/.test(t) || // DV with delimiters (avoids false positives)
    /\bDV\b/.test(t) ||
    /DOV[I]?/.test(t);

  // Check for HDR10+
  const hasHDR10Plus =
    t.includes("HDR10+") || t.includes("HDR10PLUS") || t.includes("HDR10 PLUS");

  // Check for HDR10
  const hasHDR10 = t.includes("HDR10") || t.includes("HDR 10");

  // Dual layer: DV + HDR10+ is the best combo - show as Dolby Vision
  // (HDR10+ is the fallback layer in dual-layer releases)
  if (hasDV && hasHDR10Plus) {
    return "Dolby Vision"; // DV with HDR10+ fallback
  }

  // HDR10+ standalone (check before DV-only to prioritize newer format)
  if (hasHDR10Plus) {
    return "HDR10+";
  }

  // Dolby Vision without HDR10+
  if (hasDV) {
    return "Dolby Vision";
  }

  // HDR10
  if (hasHDR10) {
    return "HDR10";
  }

  // Generic HDR (assume HDR10)
  if (/\bHDR\b/.test(t) && !t.includes("SDR")) {
    return "HDR10";
  }

  // HLG
  if (t.includes("HLG")) {
    return "HLG";
  }

  return "SDR";
}

function parseDolbyVisionProfile(t: string): string | undefined {
  // Common profiles: 5, 7, 8.1, 8.4
  const profilePatterns = [
    /DV[.\s]?PROFILE[.\s]?(\d+\.?\d*)/i,
    /PROFILE[.\s]?(\d+\.?\d*)[.\s]?DV/i,
    /DV[.\s]?P(\d+\.?\d*)/i,
    /P(\d+\.?\d*)[.\s]?DV/i,
    /DOVI[.\s]?P(\d+\.?\d*)/i,
  ];

  for (const pattern of profilePatterns) {
    const match = t.match(pattern);
    if (match) {
      return `Profile ${match[1]}`;
    }
  }

  // Check for specific profile mentions without explicit pattern
  if (t.includes("DV") || t.includes("DOVI") || t.includes("DOLBY VISION")) {
    if (t.includes("8.4") || t.includes("84")) return "Profile 8.4";
    if (t.includes("8.1") || t.includes("81")) return "Profile 8.1";
    if (t.includes("P7") || t.match(/\b7\b/)) return "Profile 7";
    if (t.includes("P5") || t.match(/\b5\b/)) return "Profile 5";
  }

  return undefined;
}

function detectHDR(t: string): boolean {
  return (
    t.includes("HDR") ||
    t.includes("DV") ||
    t.includes("DOVI") ||
    t.includes("DOLBY VISION") ||
    t.includes("HLG")
  );
}

function parseAudioCodec(t: string): string {
  // Dolby
  if (t.includes("TRUEHD") || t.includes("TRUE-HD") || t.includes("TRUE HD"))
    return "TrueHD";
  if (t.includes("ATMOS")) return "Atmos";
  if (
    t.includes("EAC3") ||
    t.includes("E-AC3") ||
    t.includes("E-AC-3") ||
    t.includes("DDP") ||
    t.includes("DD+")
  )
    return "DD+";
  if (
    t.includes("AC3") ||
    t.includes("AC-3") ||
    t.match(/\bDD\b/) ||
    t.includes("DOLBY DIGITAL")
  )
    return "AC3";

  // DTS
  if (
    t.includes("DTS-HD MA") ||
    t.includes("DTS-HDMA") ||
    t.includes("DTSHDMA")
  )
    return "DTS-HD MA";
  if (t.includes("DTS-HD") || t.includes("DTSHD")) return "DTS-HD";
  if (t.includes("DTS-X") || t.includes("DTSX")) return "DTS:X";
  if (t.match(/\bDTS\b/)) return "DTS";

  // Other
  if (t.includes("LPCM") || t.includes("PCM")) return "LPCM";
  if (t.includes("FLAC")) return "FLAC";
  if (t.includes("AAC")) return "AAC";
  if (t.includes("MP3")) return "MP3";
  if (t.includes("OPUS")) return "Opus";

  return "";
}

function parseAudioChannels(t: string): string {
  if (t.includes("7.1")) return "7.1";
  if (t.includes("5.1")) return "5.1";
  if (t.includes("2.1")) return "2.1";
  if (t.includes("2.0") || t.includes("STEREO")) return "2.0";
  if (t.includes("1.0") || t.includes("MONO")) return "1.0";
  return "";
}

function detectAtmos(t: string): boolean {
  return (
    t.includes("ATMOS") || t.includes("DD+ ATMOS") || t.includes("DDP ATMOS")
  );
}

function parseSource(t: string): string {
  // Streaming services
  if (t.includes("AMZN") || t.includes("AMAZON")) return "Amazon";
  if (t.includes("NF") || t.includes("NETFLIX")) return "Netflix";
  if (t.includes("DSNP") || t.includes("DISNEY+") || t.includes("DISNEY PLUS"))
    return "Disney+";
  if (
    t.includes("ATVP") ||
    t.includes("APPLE TV+") ||
    t.includes("APPLE TV PLUS")
  )
    return "Apple TV+";
  if (t.includes("HMAX") || t.includes("HBO MAX")) return "HBO Max";
  if (t.includes("HULU")) return "Hulu";
  if (t.includes("PCOK") || t.includes("PEACOCK")) return "Peacock";
  if (t.includes("PMTP") || t.includes("PARAMOUNT+")) return "Paramount+";

  // Physical/Broadcast
  if (t.includes("REMUX")) return "Remux";
  if (
    t.includes("BLURAY") ||
    t.includes("BLU-RAY") ||
    t.includes("BDRIP") ||
    t.includes("BRRIP")
  )
    return "BluRay";
  if (t.includes("UHD") && t.includes("BLURAY")) return "UHD BluRay";
  if (t.includes("WEB-DL") || t.includes("WEBDL")) return "WEB-DL";
  if (t.includes("WEBRIP") || t.includes("WEB-RIP")) return "WEBRip";
  if (t.includes("HDTV")) return "HDTV";
  if (t.includes("DVDRIP") || t.includes("DVD-RIP")) return "DVDRip";
  if (t.includes("DVDSCR")) return "DVDScr";
  if (t.includes("CAM") || t.includes("HDCAM")) return "CAM";
  if (t.includes("TS") || t.includes("TELESYNC") || t.includes("HDTS"))
    return "TS";

  return "";
}

function parseReleaseGroup(title: string): string {
  // Release group is typically at the end after a hyphen
  const match = title.match(/-([A-Za-z0-9]+)(?:\.[a-z]{2,4})?$/);
  if (match) {
    return match[1];
  }

  // Common release groups
  const groups = [
    "YIFY",
    "YTS",
    "RARBG",
    "SPARKS",
    "GECKOS",
    "FLUX",
    "NTb",
    "CMRG",
    "TEPES",
    "MONOLITH",
    "NOGRP",
    "EVO",
    "SMURF",
    "STUTTERSHIT",
    "SHITBOX",
    "EPSILON",
    "FGT",
    "PSA",
    "JYK",
    "ION10",
    "SWTYBLZ",
    "EMBER",
    "EDITH",
    "SURFINBIRD",
    "SYNCOPY",
    "PLAYNOW",
    "DEFLATE",
  ];

  for (const group of groups) {
    if (title.toUpperCase().includes(group)) {
      return group;
    }
  }

  return "";
}

function parseLanguages(t: string): string[] {
  const languages: string[] = [];

  const langPatterns: Record<string, string[]> = {
    English: ["ENGLISH", "ENG", "EN"],
    Spanish: ["SPANISH", "SPANISH LATINO", "LATINO", "ESP", "SPA"],
    French: ["FRENCH", "FRENCH AUDIO", "FRA", "FRE"],
    German: ["GERMAN", "DEUTSCH", "GER", "DEU"],
    Italian: ["ITALIAN", "ITA"],
    Portuguese: ["PORTUGUESE", "PORTUGUES", "POR"],
    Russian: ["RUSSIAN", "RUS"],
    Japanese: ["JAPANESE", "JAP", "JPN"],
    Korean: ["KOREAN", "KOR"],
    Chinese: ["CHINESE", "MANDARIN", "CANTONESE", "CHI", "CHN"],
    Hindi: ["HINDI", "HIN"],
    Arabic: ["ARABIC", "ARA"],
    Dutch: ["DUTCH", "DUT", "NLD"],
    Polish: ["POLISH", "POL"],
    Turkish: ["TURKISH", "TUR"],
    Multi: ["MULTI", "MULTI-AUDIO", "DUAL AUDIO", "DUAL-AUDIO"],
  };

  for (const [lang, patterns] of Object.entries(langPatterns)) {
    for (const pattern of patterns) {
      if (t.includes(pattern)) {
        if (!languages.includes(lang)) {
          languages.push(lang);
        }
        break;
      }
    }
  }

  return languages;
}

function detect3D(t: string): boolean {
  return (
    t.includes("3D") ||
    t.includes("HSBS") ||
    t.includes("HOU") ||
    t.includes("HALF-SBS") ||
    t.includes("HALF-OU")
  );
}

/**
 * Format file size from bytes to human readable
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "Unknown";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Get badge color for HDR type
 */
export function getHDRBadgeColor(hdrType: string): string {
  return BADGE_COLORS[hdrType as keyof typeof BADGE_COLORS] || BADGE_COLORS.SDR;
}

/**
 * Get badge color for resolution
 */
export function getResolutionBadgeColor(resolution: string): string {
  return (
    BADGE_COLORS[resolution as keyof typeof BADGE_COLORS] ||
    BADGE_COLORS["480p"]
  );
}
