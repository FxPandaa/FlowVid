/**
 * Torrent Ranking & Filtering System
 *
 * Implements Torrentio-like ranking with:
 * - Quality-based ranking (prefer 4K when requested)
 * - HEVC preference for 4K (smaller files)
 * - Health signals (seeders)
 * - Trusted release patterns
 * - User-configurable quality presets
 */

import { TorrentResult } from "./types";
import { parseTorrentTitle, ParsedTorrentInfo } from "./parser";

// ============================================================================
// TYPES
// ============================================================================

export type QualityPreset =
  | "maxQuality" // Prefer highest quality (4K + HDR + Remux)
  | "balanced" // Balance quality and file size
  | "minSize" // Prefer smaller files (HEVC, WEB-DL)
  | "compatibility"; // Prefer widely compatible (x264, no HDR)

export interface RankingConfig {
  preferredResolution: "4K" | "1080p" | "720p" | "any";
  preferHDR: boolean;
  preferDolbyVision: boolean;
  preferHEVC: boolean;
  preferRemux: boolean;
  minSeeds: number;
  maxSizeGB?: number;
  minSizeGB?: number;
  excludeCAM: boolean;
  preset: QualityPreset;
}

export interface RankedTorrent extends TorrentResult {
  parsedInfo: ParsedTorrentInfo;
  rankScore: number;
  rankBreakdown: RankBreakdown;
}

export interface RankBreakdown {
  resolutionScore: number;
  hdrScore: number;
  sourceScore: number;
  codecScore: number;
  audioScore: number;
  healthScore: number;
  trustScore: number;
  sizeScore: number;
  total: number;
}

// ============================================================================
// PRESETS
// ============================================================================

export const QUALITY_PRESETS: Record<QualityPreset, Partial<RankingConfig>> = {
  maxQuality: {
    preferredResolution: "4K",
    preferHDR: true,
    preferDolbyVision: true,
    preferHEVC: true,
    preferRemux: true,
    minSeeds: 1,
    excludeCAM: true,
  },
  balanced: {
    preferredResolution: "any",
    preferHDR: true,
    preferDolbyVision: false,
    preferHEVC: true,
    preferRemux: false,
    minSeeds: 3,
    excludeCAM: true,
  },
  minSize: {
    preferredResolution: "1080p",
    preferHDR: false,
    preferDolbyVision: false,
    preferHEVC: true,
    preferRemux: false,
    minSeeds: 5,
    maxSizeGB: 5,
    excludeCAM: true,
  },
  compatibility: {
    preferredResolution: "1080p",
    preferHDR: false,
    preferDolbyVision: false,
    preferHEVC: false,
    preferRemux: false,
    minSeeds: 5,
    excludeCAM: true,
  },
};

const DEFAULT_CONFIG: RankingConfig = {
  preferredResolution: "any",
  preferHDR: true,
  preferDolbyVision: true,
  preferHEVC: true,
  preferRemux: false,
  minSeeds: 1,
  excludeCAM: true,
  preset: "balanced",
};

// ============================================================================
// RANKING FUNCTIONS
// ============================================================================

/**
 * Calculate resolution score (0-50)
 * 4K gets a large bonus so it always sorts above lower resolutions.
 */
function calculateResolutionScore(
  info: ParsedTorrentInfo,
  config: RankingConfig,
): number {
  // Give 4K a decisive lead: 4K=50, 1080p=24, 720p=18, 480p=12, Unknown=6
  const score4k = 50;
  const baseScore =
    info.resolution === "4K" ? score4k : info.resolutionRank * 6; // 0-30 for non-4K

  // Bonus if matches preferred resolution
  if (config.preferredResolution !== "any") {
    if (info.resolution === config.preferredResolution) {
      return baseScore + 5;
    }
  }

  return baseScore;
}

/**
 * Calculate HDR score (0-20)
 */
function calculateHDRScore(
  info: ParsedTorrentInfo,
  config: RankingConfig,
): number {
  if (!config.preferHDR) return 0;

  if (info.hasDolbyVision && config.preferDolbyVision) return 20;
  if (info.hasHdr10Plus) return 18;
  if (info.hasHdr10) return 15;
  if (info.hasHdr) return 10;

  return 0;
}

/**
 * Calculate source score (0-15)
 */
function calculateSourceScore(
  info: ParsedTorrentInfo,
  config: RankingConfig,
): number {
  if (info.isRemux && config.preferRemux) return 15;
  if (info.isRemux) return 12;
  if (info.isBluRay) return 10;
  if (info.isWebDl) return 8;

  return info.sourceRank * 2;
}

/**
 * Calculate codec score (0-10)
 */
function calculateCodecScore(
  info: ParsedTorrentInfo,
  config: RankingConfig,
): number {
  // For 4K content, HEVC is preferred (smaller files)
  if (info.resolution === "4K" && config.preferHEVC) {
    if (info.codec === "HEVC") return 10;
    if (info.codec === "AV1") return 10;
    if (info.codec === "x264") return 5; // Penalize x264 for 4K
  }

  return info.codecRank * 2;
}

/**
 * Calculate audio score (0-10)
 */
function calculateAudioScore(info: ParsedTorrentInfo): number {
  if (info.hasAtmos) return 10;
  if (info.hasTrueHD) return 8;

  return Math.min(10, info.audioRank * 2);
}

/**
 * Calculate health score based on seeders (0-15)
 */
function calculateHealthScore(seeds: number): number {
  if (seeds >= 100) return 15;
  if (seeds >= 50) return 12;
  if (seeds >= 20) return 10;
  if (seeds >= 10) return 8;
  if (seeds >= 5) return 5;
  if (seeds >= 1) return 2;
  return 0;
}

/**
 * Calculate trust score (0-5)
 */
function calculateTrustScore(info: ParsedTorrentInfo): number {
  let score = 0;

  if (info.isTrustedRelease) score += 3;
  if (info.hasProperTag || info.hasRepackTag) score += 2;

  return score;
}

/**
 * Calculate size score (0-5)
 */
function calculateSizeScore(sizeBytes: number, config: RankingConfig): number {
  const sizeGB = sizeBytes / (1024 * 1024 * 1024);

  // If max size is set, penalize larger files
  if (config.maxSizeGB && sizeGB > config.maxSizeGB) {
    return -10; // Penalty
  }

  // If min size is set, penalize smaller files (might be low quality)
  if (config.minSizeGB && sizeGB < config.minSizeGB) {
    return -5;
  }

  // Sweet spot: 2-15GB for movies, reasonable for quality
  if (sizeGB >= 2 && sizeGB <= 15) return 5;
  if (sizeGB > 15 && sizeGB <= 30) return 3;
  if (sizeGB > 30) return 1; // Very large, might be remux

  return 2;
}

/**
 * Rank a single torrent
 */
export function rankTorrent(
  torrent: TorrentResult,
  config: RankingConfig = DEFAULT_CONFIG,
): RankedTorrent {
  const parsedInfo = parseTorrentTitle(torrent.title);

  const breakdown: RankBreakdown = {
    resolutionScore: calculateResolutionScore(parsedInfo, config),
    hdrScore: calculateHDRScore(parsedInfo, config),
    sourceScore: calculateSourceScore(parsedInfo, config),
    codecScore: calculateCodecScore(parsedInfo, config),
    audioScore: calculateAudioScore(parsedInfo),
    healthScore: calculateHealthScore(torrent.seeds),
    trustScore: calculateTrustScore(parsedInfo),
    sizeScore: calculateSizeScore(torrent.size, config),
    total: 0,
  };

  breakdown.total =
    breakdown.resolutionScore +
    breakdown.hdrScore +
    breakdown.sourceScore +
    breakdown.codecScore +
    breakdown.audioScore +
    breakdown.healthScore +
    breakdown.trustScore +
    breakdown.sizeScore;

  return {
    ...torrent,
    parsedInfo,
    rankScore: breakdown.total,
    rankBreakdown: breakdown,
  };
}

// ============================================================================
// FILTERING FUNCTIONS
// ============================================================================

/**
 * Apply soft filters (move to lower rank rather than remove)
 */
export function applyFilters(
  torrents: RankedTorrent[],
  config: RankingConfig,
): RankedTorrent[] {
  return torrents.map((t) => {
    let penalty = 0;

    // CAM quality penalty (severe)
    if (config.excludeCAM && t.parsedInfo.source === "CAM") {
      penalty += 50;
    }

    // Low seeds penalty
    if (t.seeds < config.minSeeds) {
      penalty += 20;
    }

    // Size penalties are already in the score

    return {
      ...t,
      rankScore: t.rankScore - penalty,
    };
  });
}

/**
 * Hard filter to remove truly unwanted results
 */
export function hardFilter(
  torrents: RankedTorrent[],
  config: RankingConfig,
): RankedTorrent[] {
  return torrents.filter((t) => {
    // Always remove CAM if configured
    if (config.excludeCAM && t.parsedInfo.source === "CAM") {
      return false;
    }

    // Remove if no seeds and it's the only health indicator
    if (t.seeds === 0 && !t.parsedInfo.isTrustedRelease) {
      // Keep if it's from Torrentio (they may have cached it)
      if (t.provider !== "Torrentio") {
        return false;
      }
    }

    return true;
  });
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

export interface DedupeResult {
  deduplicated: RankedTorrent[];
  removedCount: number;
  removedHashes: string[];
}

/**
 * Deduplicate results by infoHash, keeping the best ranked version
 */
export function deduplicateByHash(torrents: RankedTorrent[]): DedupeResult {
  const seen = new Map<string, RankedTorrent>();
  const removedHashes: string[] = [];

  for (const t of torrents) {
    // Skip if no infoHash
    if (!t.infoHash) {
      continue;
    }

    const existing = seen.get(t.infoHash);
    if (!existing) {
      seen.set(t.infoHash, t);
    } else {
      // Keep the one with higher rank
      if (t.rankScore > existing.rankScore) {
        removedHashes.push(existing.infoHash);
        seen.set(t.infoHash, t);
      } else {
        removedHashes.push(t.infoHash);
      }
    }
  }

  // Also include torrents without infoHash
  const noHash = torrents.filter((t) => !t.infoHash);

  return {
    deduplicated: [...seen.values(), ...noHash],
    removedCount: removedHashes.length,
    removedHashes,
  };
}

/**
 * Deduplicate by normalized title + size (for when infoHash is missing)
 */
export function deduplicateByTitleSize(
  torrents: RankedTorrent[],
): DedupeResult {
  const seen = new Map<string, RankedTorrent>();
  const removedHashes: string[] = [];

  for (const t of torrents) {
    // Create a key from normalized title + approximate size
    const normalizedTitle = t.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 50);
    const sizeApprox = Math.round(t.size / (100 * 1024 * 1024)); // 100MB buckets
    const key = `${normalizedTitle}-${sizeApprox}`;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, t);
    } else {
      // Keep the one with higher rank or more seeds
      if (t.rankScore > existing.rankScore) {
        if (existing.infoHash) removedHashes.push(existing.infoHash);
        seen.set(key, t);
      } else {
        if (t.infoHash) removedHashes.push(t.infoHash);
      }
    }
  }

  return {
    deduplicated: [...seen.values()],
    removedCount: torrents.length - seen.size,
    removedHashes,
  };
}

// ============================================================================
// MAIN RANKING PIPELINE
// ============================================================================

export interface RankingResult {
  ranked: RankedTorrent[];
  stats: {
    inputCount: number;
    afterHardFilter: number;
    afterDedupe: number;
    finalCount: number;
    qualityBreakdown: Record<string, number>;
  };
}

/**
 * Full ranking pipeline
 */
export function rankAndFilterTorrents(
  torrents: TorrentResult[],
  config: Partial<RankingConfig> = {},
): RankingResult {
  const fullConfig: RankingConfig = {
    ...DEFAULT_CONFIG,
    ...QUALITY_PRESETS[config.preset || "balanced"],
    ...config,
  };

  const inputCount = torrents.length;

  // Step 1: Parse and rank all torrents
  let ranked = torrents.map((t) => rankTorrent(t, fullConfig));

  // Step 2: Hard filter (remove truly bad results)
  ranked = hardFilter(ranked, fullConfig);
  const afterHardFilter = ranked.length;

  // Step 3: Deduplicate by infoHash
  const hashDedupe = deduplicateByHash(ranked);
  ranked = hashDedupe.deduplicated;

  // Step 4: Deduplicate by title+size for remaining
  const titleDedupe = deduplicateByTitleSize(ranked);
  ranked = titleDedupe.deduplicated;
  const afterDedupe = ranked.length;

  // Step 5: Apply soft filters (penalties)
  ranked = applyFilters(ranked, fullConfig);

  // Step 6: Sort by rank score (descending)
  ranked.sort((a, b) => b.rankScore - a.rankScore);

  // Calculate quality breakdown
  const qualityBreakdown: Record<string, number> = {};
  for (const t of ranked) {
    const key = t.parsedInfo.resolution;
    qualityBreakdown[key] = (qualityBreakdown[key] || 0) + 1;
  }

  return {
    ranked,
    stats: {
      inputCount,
      afterHardFilter,
      afterDedupe,
      finalCount: ranked.length,
      qualityBreakdown,
    },
  };
}

/**
 * Get ranking config from user preferences
 */
export function getConfigFromPreferences(
  preferredQuality: string,
  preset?: QualityPreset,
): RankingConfig {
  const base = preset ? QUALITY_PRESETS[preset] : {};

  let preferredResolution: RankingConfig["preferredResolution"] = "any";
  switch (preferredQuality) {
    case "4k":
      preferredResolution = "4K";
      break;
    case "1080p":
      preferredResolution = "1080p";
      break;
    case "720p":
      preferredResolution = "720p";
      break;
  }

  return {
    ...DEFAULT_CONFIG,
    ...base,
    preferredResolution,
    preset: preset || "balanced",
  };
}
