/**
 * Metadata service — hybrid strategy.
 *
 * Each source is used for what it does best:
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ Data point             │ Source    │ Why                            │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ Title, year, overview  │ Cinemeta  │ CDN, no rate limit, has IMDb   │
 * │ Poster, backdrop, logo │ Cinemeta  │ CDN-backed, unlimited, fast    │
 * │ IMDb rating            │ Cinemeta  │ Canonical source (from OMDB)   │
 * │ Genres, runtime        │ Cinemeta  │ Available in base response     │
 * │ Episode list + stills  │ Cinemeta  │ All episodes in one call       │
 * │ Catalog / Search       │ Cinemeta  │ Only source with browse API    │
 * │ Cast + photos + chars  │ TMDB     │ Cinemeta only has name strings │
 * │ Crew (director, etc.)  │ TMDB     │ Not available in Cinemeta      │
 * │ Trailers               │ TMDB     │ Better sort + metadata         │
 * │ Certification          │ TMDB     │ Only source (MPAA / TV rating) │
 * │ Tagline                │ TMDB     │ Not available in Cinemeta      │
 * │ Budget / Revenue       │ TMDB     │ Not available in Cinemeta      │
 * │ Status (Ended, etc.)   │ TMDB     │ Not available in Cinemeta      │
 * │ Networks / Studios     │ TMDB     │ Logos, not available elsewhere  │
 * │ Recommendations        │ TMDB     │ Not available in Cinemeta      │
 * │ Person details         │ TMDB     │ Only source with /person API   │
 * │ Episode ratings        │ TMDB     │ Per-episode vote_average       │
 * │ TMDB vote average      │ TMDB     │ Secondary rating alongside IMDb│
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Loading strategy:
 *   1. Cinemeta loads first (base shell — title, poster, episodes)
 *   2. TMDB enrichment loads in parallel (non-blocking)
 *   3. Episode ratings load lazily per-season when user selects one
 *   4. Person details load on demand (user clicks a cast member)
 *
 * This avoids wasting TMDB rate-limit budget (~40 req/10s) on data
 * that Cinemeta serves for free from its CDN.
 */

export * from "./cinemeta";
export * from "./tmdb";
