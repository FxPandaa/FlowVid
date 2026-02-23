/**
 * Scraping Observability & Debug System
 *
 * Provides instrumentation for comparing FlowVid's scraping pipeline with Torrentio.
 * Logs query inputs, per-provider metrics, and post-processing statistics.
 */

import { TorrentResult, MediaQuery } from "./types";

// ============================================================================
// DEBUG TYPES
// ============================================================================

export interface ProviderDebugInfo {
  providerId: string;
  providerName: string;
  requestUrl?: string;
  queryUsed?: string;
  startTime: number;
  endTime: number;
  duration: number;
  httpStatus?: number;
  parseSuccess: boolean;
  rawItemCount: number;
  filteredItemCount: number;
  error?: string;
  errorType?:
    | "timeout"
    | "network"
    | "parse"
    | "cloudflare"
    | "ratelimit"
    | "unknown";
  items: DebugTorrentItem[];
}

export interface DebugTorrentItem {
  title: string;
  infoHash?: string;
  magnetUri?: string;
  size: number;
  sizeFormatted: string;
  seeds: number;
  quality: string;
  codec?: string;
  source?: string;
  hdrType?: string;
  audioType?: string;
  dvProfile?: string;
  isRemux?: boolean;
  isTrustedRelease?: boolean;
}

export interface FilteringStats {
  inputCount: number;
  afterDeduplication: number;
  afterQualityFilter: number;
  afterHealthFilter: number;
  finalCount: number;
  removedByDedupe: number;
  removedByQuality: number;
  removedByHealth: number;
}

export interface SearchDebugReport {
  // Query info
  queryInput: {
    imdbId: string;
    type: "movie" | "series";
    title: string;
    year?: number;
    season?: number;
    episode?: number;
    alternativeTitles?: string[];
  };

  // Timing
  searchStartTime: number;
  searchEndTime: number;
  totalDuration: number;

  // Per-provider breakdown
  providers: ProviderDebugInfo[];

  // Aggregation stats
  aggregation: {
    totalRawResults: number;
    totalAfterFiltering: number;
    qualityBreakdown: Record<string, number>;
    codecBreakdown: Record<string, number>;
    providerBreakdown: Record<string, number>;
  };

  // Filtering stats
  filtering: FilteringStats;

  // Final results (top N)
  topResults: DebugTorrentItem[];

  // Comparison with Torrentio (if available)
  torrentioComparison?: {
    torrentioCount: number;
    FlowVidCount: number;
    overlap: number;
    onlyInTorrentio: string[];
    onlyInFlowVid: string[];
  };
}

// ============================================================================
// DEBUG LOGGER CLASS
// ============================================================================

export class ScrapingDebugger {
  private debugMode: boolean = false;
  private currentReport: SearchDebugReport | null = null;
  private providerInfoMap: Map<string, ProviderDebugInfo> = new Map();

  enableDebugMode() {
    this.debugMode = true;
  }

  disableDebugMode() {
    this.debugMode = false;
  }

  isDebugMode(): boolean {
    return this.debugMode;
  }

  startSearch(query: MediaQuery, alternativeTitles?: string[]) {
    if (!this.debugMode) return;

    this.currentReport = {
      queryInput: {
        imdbId: query.imdbId,
        type: query.type,
        title: query.title,
        year: query.year,
        season: query.season,
        episode: query.episode,
        alternativeTitles,
      },
      searchStartTime: Date.now(),
      searchEndTime: 0,
      totalDuration: 0,
      providers: [],
      aggregation: {
        totalRawResults: 0,
        totalAfterFiltering: 0,
        qualityBreakdown: {},
        codecBreakdown: {},
        providerBreakdown: {},
      },
      filtering: {
        inputCount: 0,
        afterDeduplication: 0,
        afterQualityFilter: 0,
        afterHealthFilter: 0,
        finalCount: 0,
        removedByDedupe: 0,
        removedByQuality: 0,
        removedByHealth: 0,
      },
      topResults: [],
    };

    this.providerInfoMap.clear();
    console.log("[DEBUG] Search started:", query);
  }

  startProvider(
    providerId: string,
    providerName: string,
    requestUrl?: string,
    queryUsed?: string,
  ) {
    if (!this.debugMode) return;

    const info: ProviderDebugInfo = {
      providerId,
      providerName,
      requestUrl,
      queryUsed,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      parseSuccess: false,
      rawItemCount: 0,
      filteredItemCount: 0,
      items: [],
    };

    this.providerInfoMap.set(providerId, info);
    console.log(`[DEBUG] Provider ${providerName} started`);
  }

  endProvider(
    providerId: string,
    results: TorrentResult[],
    httpStatus?: number,
    error?: string,
    errorType?: ProviderDebugInfo["errorType"],
  ) {
    if (!this.debugMode) return;

    const info = this.providerInfoMap.get(providerId);
    if (!info) return;

    info.endTime = Date.now();
    info.duration = info.endTime - info.startTime;
    info.httpStatus = httpStatus;
    info.parseSuccess = !error && results.length >= 0;
    info.rawItemCount = results.length;
    info.error = error;
    info.errorType = errorType;

    info.items = results.map((r) => this.torrentToDebugItem(r));

    console.log(
      `[DEBUG] Provider ${info.providerName} finished:`,
      `${results.length} results in ${info.duration}ms`,
      error ? `(Error: ${error})` : "",
    );
  }

  private torrentToDebugItem(result: TorrentResult): DebugTorrentItem {
    return {
      title: result.title,
      infoHash: result.infoHash,
      magnetUri: result.magnetUri,
      size: result.size,
      sizeFormatted: result.sizeFormatted,
      seeds: result.seeds,
      quality: result.quality,
      codec: result.codec,
      source: result.source,
      hdrType: this.extractHdrType(result.title),
      audioType: this.extractAudioType(result.title),
      dvProfile: this.extractDVProfile(result.title),
      isRemux: /remux/i.test(result.title),
      isTrustedRelease: this.isTrustedRelease(result.title),
    };
  }

  private extractHdrType(title: string): string | undefined {
    const lower = title.toLowerCase();
    if (
      lower.includes("dolby vision") ||
      /\bdv\b/.test(lower) ||
      lower.includes("dovi")
    )
      return "Dolby Vision";
    if (lower.includes("hdr10+")) return "HDR10+";
    if (lower.includes("hdr10")) return "HDR10";
    if (lower.includes("hdr")) return "HDR";
    return undefined;
  }

  private extractAudioType(title: string): string | undefined {
    const lower = title.toLowerCase();
    if (lower.includes("atmos")) return "Atmos";
    if (lower.includes("truehd")) return "TrueHD";
    if (lower.includes("dts-hd") || lower.includes("dts:x")) return "DTS-HD";
    if (lower.includes("dts")) return "DTS";
    if (lower.includes("aac")) return "AAC";
    if (lower.includes("ac3") || lower.includes("dd5.1")) return "DD5.1";
    return undefined;
  }

  private extractDVProfile(title: string): string | undefined {
    const match = title.match(/DV\s*(Profile\s*)?(\d+)/i);
    return match ? `Profile ${match[2]}` : undefined;
  }

  private isTrustedRelease(title: string): boolean {
    const trustedPatterns = [
      /\bweb-?dl\b/i,
      /\bbluray\b/i,
      /\bbdrip\b/i,
      /\bremux\b/i,
      /\bhdrip\b/i,
      // Trusted release groups
      /\b(SPARKS|GECKOS|RARBG|YTS|YIFY|NTb|FLUX|TEPES|BCORE)\b/i,
    ];
    return trustedPatterns.some((p) => p.test(title));
  }

  recordFiltering(stats: FilteringStats) {
    if (!this.debugMode || !this.currentReport) return;
    this.currentReport.filtering = stats;

    console.log("[DEBUG] Filtering stats:", {
      input: stats.inputCount,
      afterDedupe: stats.afterDeduplication,
      final: stats.finalCount,
    });
  }

  recordAggregation(results: TorrentResult[]) {
    if (!this.debugMode || !this.currentReport) return;

    const qualityBreakdown: Record<string, number> = {};
    const codecBreakdown: Record<string, number> = {};
    const providerBreakdown: Record<string, number> = {};

    for (const r of results) {
      qualityBreakdown[r.quality] = (qualityBreakdown[r.quality] || 0) + 1;
      if (r.codec) {
        codecBreakdown[r.codec] = (codecBreakdown[r.codec] || 0) + 1;
      }
      providerBreakdown[r.provider] = (providerBreakdown[r.provider] || 0) + 1;
    }

    this.currentReport.aggregation = {
      totalRawResults: Array.from(this.providerInfoMap.values()).reduce(
        (sum, p) => sum + p.rawItemCount,
        0,
      ),
      totalAfterFiltering: results.length,
      qualityBreakdown,
      codecBreakdown,
      providerBreakdown,
    };
  }

  endSearch(topResults: TorrentResult[]) {
    if (!this.debugMode || !this.currentReport) return;

    this.currentReport.searchEndTime = Date.now();
    this.currentReport.totalDuration =
      this.currentReport.searchEndTime - this.currentReport.searchStartTime;
    this.currentReport.providers = Array.from(this.providerInfoMap.values());
    this.currentReport.topResults = topResults.map((r) =>
      this.torrentToDebugItem(r),
    );

    console.log("[DEBUG] Search completed:", {
      totalDuration: this.currentReport.totalDuration,
      providers: this.currentReport.providers.length,
      rawResults: this.currentReport.aggregation.totalRawResults,
      finalResults: topResults.length,
    });
  }

  recordTorrentioComparison(
    torrentioResults: TorrentResult[],
    FlowVidResults: TorrentResult[],
  ) {
    if (!this.debugMode || !this.currentReport) return;

    const torrentioHashes = new Set(
      torrentioResults.map((r) => r.infoHash).filter(Boolean),
    );
    const FlowVidHashes = new Set(
      FlowVidResults.map((r) => r.infoHash).filter(Boolean),
    );

    const overlap = [...torrentioHashes].filter((h) =>
      FlowVidHashes.has(h),
    ).length;
    const onlyInTorrentio = [...torrentioHashes].filter(
      (h) => !FlowVidHashes.has(h),
    );
    const onlyInFlowVid = [...FlowVidHashes].filter(
      (h) => !torrentioHashes.has(h),
    );

    this.currentReport.torrentioComparison = {
      torrentioCount: torrentioResults.length,
      FlowVidCount: FlowVidResults.length,
      overlap,
      onlyInTorrentio: onlyInTorrentio.slice(0, 20),
      onlyInFlowVid: onlyInFlowVid.slice(0, 20),
    };

    console.log("[DEBUG] Torrentio comparison:", {
      torrentio: torrentioResults.length,
      FlowVid: FlowVidResults.length,
      overlap,
    });
  }

  getReport(): SearchDebugReport | null {
    return this.currentReport;
  }

  exportReportAsJSON(): string {
    if (!this.currentReport) return "{}";
    return JSON.stringify(this.currentReport, null, 2);
  }

  /**
   * Generate a human-readable summary
   */
  generateSummary(): string {
    if (!this.currentReport) return "No search report available.";

    const r = this.currentReport;
    const lines: string[] = [
      "=== SCRAPING DEBUG REPORT ===",
      "",
      `Query: ${r.queryInput.title} (${r.queryInput.year || "?"})`,
      `Type: ${r.queryInput.type}`,
      `IMDB: ${r.queryInput.imdbId}`,
      r.queryInput.season
        ? `Season: ${r.queryInput.season}, Episode: ${r.queryInput.episode}`
        : "",
      "",
      `Total Duration: ${r.totalDuration}ms`,
      "",
      "=== PROVIDERS ===",
    ];

    for (const p of r.providers) {
      const status = p.error
        ? `❌ ${p.errorType || "error"}: ${p.error}`
        : `✅ ${p.rawItemCount} results`;
      lines.push(`  ${p.providerName}: ${status} (${p.duration}ms)`);
    }

    lines.push("");
    lines.push("=== AGGREGATION ===");
    lines.push(`  Raw results: ${r.aggregation.totalRawResults}`);
    lines.push(`  After filtering: ${r.aggregation.totalAfterFiltering}`);
    lines.push("");
    lines.push("Quality breakdown:");
    for (const [q, count] of Object.entries(r.aggregation.qualityBreakdown)) {
      lines.push(`  ${q}: ${count}`);
    }

    lines.push("");
    lines.push("=== FILTERING ===");
    lines.push(`  Input: ${r.filtering.inputCount}`);
    lines.push(
      `  After dedupe: ${r.filtering.afterDeduplication} (-${r.filtering.removedByDedupe})`,
    );
    lines.push(`  Final: ${r.filtering.finalCount}`);

    if (r.torrentioComparison) {
      lines.push("");
      lines.push("=== TORRENTIO COMPARISON ===");
      lines.push(`  Torrentio: ${r.torrentioComparison.torrentioCount}`);
      lines.push(`  FlowVid: ${r.torrentioComparison.FlowVidCount}`);
      lines.push(`  Overlap: ${r.torrentioComparison.overlap}`);
    }

    return lines.filter(Boolean).join("\n");
  }
}

// Export singleton instance
export const scrapingDebugger = new ScrapingDebugger();
