/**
 * Provider Registry - Torrentio-like provider coverage
 *
 * This registry tracks all providers that Torrentio supports and their implementation status.
 * Each provider has metadata about its capabilities, region, and reliability.
 */

export type ContentType = "movie" | "series" | "anime";
export type ProviderStatus = "implemented" | "stub" | "disabled" | "deprecated";

export interface ProviderMeta {
  id: string;
  name: string;
  status: ProviderStatus;
  enabled: boolean; // User-toggleable
  tier: 1 | 2 | 3 | 4; // 1 = primary, 2 = secondary, 3 = regional/specialty, 4 = meta/backup
  contentTypes: ContentType[];
  regions?: string[]; // ISO 3166-1 alpha-2 codes, undefined = international
  baseUrls: string[];
  supportsImdbSearch: boolean;
  reliabilityScore: number; // 0-100, based on uptime/success rate
  rateLimit?: number; // requests per minute
  notes?: string;
}

/**
 * Complete provider registry matching Torrentio's provider list
 * Reference: Torrentio supports YTS, EZTV, RARBG, 1337x, ThePirateBay, KickassTorrents,
 * TorrentGalaxy, MagnetDL, HorribleSubs, NyaaSi, TokyoTosho, AniDex, Rutor, Rutracker,
 * Comando, BluDV, Torrent9, ilCorSaRoNeRo, MejorTorrent, Wolfmax4k, Cinecalidad, etc.
 */
export const PROVIDER_REGISTRY: ProviderMeta[] = [
  // ============================================================================
  // TIER 1 - PRIMARY SCRAPERS (High reliability, API-based where possible)
  // ============================================================================
  {
    id: "yts",
    name: "YTS",
    status: "implemented",
    enabled: true,
    tier: 1,
    contentTypes: ["movie"],
    baseUrls: ["https://yts.mx", "https://yts.lt", "https://yts.am"],
    supportsImdbSearch: true,
    reliabilityScore: 95,
    notes: "Movies only, has official API with IMDB search",
  },
  {
    id: "eztv",
    name: "EZTV",
    status: "implemented",
    enabled: true,
    tier: 1,
    contentTypes: ["series"],
    baseUrls: ["https://eztvx.to", "https://eztv.re", "https://eztv.tf"],
    supportsImdbSearch: true,
    reliabilityScore: 90,
    notes: "TV shows only, has API with IMDB search",
  },
  {
    id: "1337x",
    name: "1337x",
    status: "implemented",
    enabled: true,
    tier: 1,
    contentTypes: ["movie", "series"],
    baseUrls: ["https://1337x.to", "https://1337x.st", "https://x1337x.ws"],
    supportsImdbSearch: false,
    reliabilityScore: 85,
    notes: "General tracker, HTML scraping required",
  },
  {
    id: "tpb",
    name: "The Pirate Bay",
    status: "implemented",
    enabled: true,
    tier: 1,
    contentTypes: ["movie", "series"],
    baseUrls: ["https://apibay.org"],
    supportsImdbSearch: false,
    reliabilityScore: 80,
    notes: "Uses apibay.org API",
  },
  {
    id: "rarbg",
    name: "RARBG",
    status: "deprecated",
    enabled: false,
    tier: 1,
    contentTypes: ["movie", "series"],
    baseUrls: ["https://torrentapi.org"],
    supportsImdbSearch: true,
    reliabilityScore: 0,
    notes: "RARBG shut down in 2023. Torrentio may have cached data.",
  },

  // ============================================================================
  // TIER 2 - SECONDARY SCRAPERS (Good quality, may need HTML parsing)
  // ============================================================================
  {
    id: "torrentgalaxy",
    name: "TorrentGalaxy",
    status: "implemented",
    enabled: true,
    tier: 2,
    contentTypes: ["movie", "series"],
    baseUrls: ["https://torrentgalaxy.to", "https://tgx.rs"],
    supportsImdbSearch: true,
    reliabilityScore: 75,
    notes: "Has IMDB search via HTML",
  },
  {
    id: "limetorrents",
    name: "LimeTorrents",
    status: "stub",
    enabled: false,
    tier: 2,
    contentTypes: ["movie", "series"],
    baseUrls: ["https://limetorrents.lol", "https://limetorrents.zone"],
    supportsImdbSearch: false,
    reliabilityScore: 70,
  },
  {
    id: "magnetdl",
    name: "MagnetDL",
    status: "stub",
    enabled: false,
    tier: 2,
    contentTypes: ["movie", "series"],
    baseUrls: ["https://magnetdl.com"],
    supportsImdbSearch: false,
    reliabilityScore: 65,
  },
  {
    id: "kickass",
    name: "KickassTorrents",
    status: "stub",
    enabled: false,
    tier: 2,
    contentTypes: ["movie", "series"],
    baseUrls: ["https://kickasstorrents.to", "https://kat.am"],
    supportsImdbSearch: false,
    reliabilityScore: 60,
    notes: "Multiple mirrors, HTML scraping",
  },
  {
    id: "rutor",
    name: "Rutor",
    status: "implemented",
    enabled: true,
    tier: 2,
    contentTypes: ["movie", "series"],
    regions: ["RU"],
    baseUrls: ["https://rutor.info"],
    supportsImdbSearch: false,
    reliabilityScore: 70,
    notes: "Russian tracker with international content",
  },
  {
    id: "rutracker",
    name: "RuTracker",
    status: "stub",
    enabled: false,
    tier: 2,
    contentTypes: ["movie", "series"],
    regions: ["RU"],
    baseUrls: ["https://rutracker.org"],
    supportsImdbSearch: false,
    reliabilityScore: 75,
    notes: "Requires registration, high quality releases",
  },

  // ============================================================================
  // TIER 2 - ANIME SPECIALISTS
  // ============================================================================
  {
    id: "nyaa",
    name: "Nyaa.si",
    status: "implemented",
    enabled: true,
    tier: 2,
    contentTypes: ["anime"],
    baseUrls: ["https://nyaa.si"],
    supportsImdbSearch: false,
    reliabilityScore: 90,
    notes: "Primary anime tracker, RSS feed",
  },
  {
    id: "tokyotosho",
    name: "TokyoTosho",
    status: "stub",
    enabled: false,
    tier: 2,
    contentTypes: ["anime"],
    baseUrls: ["https://www.tokyotosho.info"],
    supportsImdbSearch: false,
    reliabilityScore: 70,
  },
  {
    id: "anidex",
    name: "AniDex",
    status: "stub",
    enabled: false,
    tier: 2,
    contentTypes: ["anime"],
    baseUrls: ["https://anidex.info"],
    supportsImdbSearch: false,
    reliabilityScore: 65,
  },
  {
    id: "horriblesubs",
    name: "HorribleSubs",
    status: "deprecated",
    enabled: false,
    tier: 2,
    contentTypes: ["anime"],
    baseUrls: [],
    supportsImdbSearch: false,
    reliabilityScore: 0,
    notes: "Shut down, releases now on SubsPlease",
  },
  {
    id: "subsplease",
    name: "SubsPlease",
    status: "stub",
    enabled: false,
    tier: 2,
    contentTypes: ["anime"],
    baseUrls: ["https://subsplease.org"],
    supportsImdbSearch: false,
    reliabilityScore: 85,
    notes: "Successor to HorribleSubs",
  },

  // ============================================================================
  // TIER 3 - REGIONAL/SPECIALTY SCRAPERS
  // ============================================================================
  {
    id: "comando",
    name: "Comando",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie", "series"],
    regions: ["PT", "BR"],
    baseUrls: ["https://comandotorrents.to"],
    supportsImdbSearch: false,
    reliabilityScore: 60,
    notes: "Portuguese/Brazilian content",
  },
  {
    id: "bludv",
    name: "BluDV",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie", "series"],
    regions: ["PT", "BR"],
    baseUrls: ["https://bludv.tv"],
    supportsImdbSearch: false,
    reliabilityScore: 55,
    notes: "Portuguese/Brazilian content",
  },
  {
    id: "torrent9",
    name: "Torrent9",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie", "series"],
    regions: ["FR"],
    baseUrls: ["https://www.torrent9.fm"],
    supportsImdbSearch: false,
    reliabilityScore: 60,
    notes: "French content",
  },
  {
    id: "ilcorsaronero",
    name: "ilCorSaRoNeRo",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie", "series"],
    regions: ["IT"],
    baseUrls: ["https://ilcorsaronero.link"],
    supportsImdbSearch: false,
    reliabilityScore: 55,
    notes: "Italian content",
  },
  {
    id: "mejortorrent",
    name: "MejorTorrent",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie", "series"],
    regions: ["ES"],
    baseUrls: ["https://mejortorrent.wtf"],
    supportsImdbSearch: false,
    reliabilityScore: 60,
    notes: "Spanish content",
  },
  {
    id: "wolfmax4k",
    name: "Wolfmax4K",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie", "series"],
    regions: ["ES"],
    baseUrls: ["https://wolfmax4k.com"],
    supportsImdbSearch: false,
    reliabilityScore: 55,
    notes: "Spanish 4K content specialist",
  },
  {
    id: "cinecalidad",
    name: "Cinecalidad",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie"],
    regions: ["ES", "MX"],
    baseUrls: ["https://cinecalidad.ec"],
    supportsImdbSearch: false,
    reliabilityScore: 55,
    notes: "Spanish/Latin American movies",
  },
  {
    id: "yggtorrent",
    name: "YggTorrent",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie", "series"],
    regions: ["FR"],
    baseUrls: ["https://www.yggtorrent.do"],
    supportsImdbSearch: false,
    reliabilityScore: 70,
    notes: "French tracker, requires registration",
  },
  {
    id: "cpasbien",
    name: "Cpasbien",
    status: "stub",
    enabled: false,
    tier: 3,
    contentTypes: ["movie", "series"],
    regions: ["FR"],
    baseUrls: ["https://www.cpasbien.tw"],
    supportsImdbSearch: false,
    reliabilityScore: 55,
    notes: "French content",
  },

  // ============================================================================
  // TIER 4 - META-SCRAPERS / BACKUP / INTEGRATION
  // ============================================================================
  {
    id: "torrentio",
    name: "Torrentio",
    status: "implemented",
    enabled: true,
    tier: 4,
    contentTypes: ["movie", "series", "anime"],
    baseUrls: ["https://torrentio.strem.fun"],
    supportsImdbSearch: true,
    reliabilityScore: 98,
    notes: "Stremio addon, aggregates many sources. Used as backup/reference.",
  },
  {
    id: "prowlarr",
    name: "Prowlarr",
    status: "stub",
    enabled: false,
    tier: 4,
    contentTypes: ["movie", "series", "anime"],
    baseUrls: [], // User-configured
    supportsImdbSearch: true,
    reliabilityScore: 90,
    notes: "Self-hosted indexer manager. Optional integration.",
  },
  {
    id: "jackett",
    name: "Jackett",
    status: "stub",
    enabled: false,
    tier: 4,
    contentTypes: ["movie", "series", "anime"],
    baseUrls: [], // User-configured
    supportsImdbSearch: true,
    reliabilityScore: 85,
    notes: "Self-hosted indexer proxy. Optional integration.",
  },
];

// ============================================================================
// PROVIDER REGISTRY UTILITIES
// ============================================================================

export function getProviderById(id: string): ProviderMeta | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getProvidersByTier(tier: 1 | 2 | 3 | 4): ProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.tier === tier);
}

export function getProvidersByContentType(type: ContentType): ProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.contentTypes.includes(type));
}

export function getProvidersByStatus(status: ProviderStatus): ProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.status === status);
}

export function getImplementedProviders(): ProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.status === "implemented");
}

export function getStubProviders(): ProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.status === "stub");
}

export function getEnabledProviders(): ProviderMeta[] {
  return PROVIDER_REGISTRY.filter(
    (p) => p.enabled && p.status === "implemented",
  );
}

export function getProvidersByRegion(region: string): ProviderMeta[] {
  return PROVIDER_REGISTRY.filter(
    (p) => !p.regions || p.regions.includes(region),
  );
}

/**
 * Generate a checklist of provider implementation status
 */
export function generateProviderChecklist(): string {
  const lines: string[] = [
    "# FlowVid Provider Implementation Checklist",
    "",
    "Comparison with Torrentio provider coverage.",
    "",
    "## Implementation Status",
    "",
    "| Provider | Status | Tier | Content Types | Region | Notes |",
    "|----------|--------|------|---------------|--------|-------|",
  ];

  const statusEmoji: Record<ProviderStatus, string> = {
    implemented: "✅",
    stub: "🔲",
    disabled: "⏸️",
    deprecated: "❌",
  };

  for (const provider of PROVIDER_REGISTRY) {
    const status = `${statusEmoji[provider.status]} ${provider.status}`;
    const types = provider.contentTypes.join(", ");
    const regions = provider.regions?.join(", ") || "International";
    const notes = provider.notes || "";

    lines.push(
      `| ${provider.name} | ${status} | ${provider.tier} | ${types} | ${regions} | ${notes} |`,
    );
  }

  lines.push("");
  lines.push("## Summary");
  lines.push("");

  const implemented = PROVIDER_REGISTRY.filter(
    (p) => p.status === "implemented",
  ).length;
  const stubs = PROVIDER_REGISTRY.filter((p) => p.status === "stub").length;
  const deprecated = PROVIDER_REGISTRY.filter(
    (p) => p.status === "deprecated",
  ).length;

  lines.push(`- **Implemented**: ${implemented}`);
  lines.push(`- **Stub (TODO)**: ${stubs}`);
  lines.push(`- **Deprecated**: ${deprecated}`);
  lines.push(`- **Total**: ${PROVIDER_REGISTRY.length}`);

  return lines.join("\n");
}
