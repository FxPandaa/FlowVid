export { cinemetaService } from "./metadata";
export { tmdbService } from "./metadata";
export type {
  MediaItem,
  MovieDetails,
  SeriesDetails,
  Episode,
  TmdbEnrichedData,
  TmdbCastMember,
  TmdbCrewMember,
  TmdbTrailer,
  TmdbProductionCompany,
  TmdbNetwork,
  TmdbRecommendation,
  TmdbPersonDetails,
  TmdbPersonCredit,
  TmdbEpisodeRating,
  TmdbDiscoverItem,
} from "./metadata";

export { searchTorrents, scrapingEngine } from "./scraping";
export type { TorrentResult, MediaQuery, ScrapingResult } from "./scraping";

export { debridService } from "./debrid";
export type { StreamLink } from "./debrid/service";
export type { DebridServiceConfig } from "./debrid/types";

export { openSubtitlesService } from "./subtitles";
export type { Subtitle, SubtitleSearchParams } from "./subtitles";
export { createSubtitleBlobUrl, adjustSubtitleTiming } from "./subtitles";

export { embeddedMpvService } from "./embeddedMpvService";
export type {
  AudioTrack as EmbeddedAudioTrack,
  SubtitleTrack as EmbeddedSubtitleTrack,
  EmbeddedPlayerState,
} from "./embeddedMpvService";

export { skipIntroService } from "./skipIntro";
export type { SkipSegment } from "./skipIntro";
