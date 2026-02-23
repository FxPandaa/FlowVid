import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { cinemetaService, MediaItem } from "../services";
import { MediaCard } from "../components";
import { Search, Film } from "../components/Icons";
import "./SearchPage.css";

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  const [results, setResults] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "movie" | "series">("all");

  useEffect(() => {
    if (query) {
      performSearch();
    }
  }, [query]);

  const performSearch = async () => {
    setIsLoading(true);
    try {
      const searchResult = await cinemetaService.search(query);
      setResults(searchResult.results);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredResults =
    filter === "all" ? results : results.filter((item) => item.type === filter);

  return (
    <div className="search-page">
      <div className="search-header">
        <h1>
          {query ? (
            <>
              Search results for "<span className="query">{query}</span>"
            </>
          ) : (
            "Search"
          )}
        </h1>

        {results.length > 0 && (
          <div className="filter-tabs">
            <button
              className={`filter-tab ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All ({results.length})
            </button>
            <button
              className={`filter-tab ${filter === "movie" ? "active" : ""}`}
              onClick={() => setFilter("movie")}
            >
              Movies ({results.filter((r) => r.type === "movie").length})
            </button>
            <button
              className={`filter-tab ${filter === "series" ? "active" : ""}`}
              onClick={() => setFilter("series")}
            >
              TV Shows ({results.filter((r) => r.type === "series").length})
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="search-loading">
          <div className="spinner"></div>
          <p>Searching...</p>
        </div>
      ) : filteredResults.length > 0 ? (
        <div className="search-results">
          {filteredResults.map((item) => (
            <MediaCard
              key={`${item.type}-${item.id}`}
              item={item}
              size="large"
            />
          ))}
        </div>
      ) : query ? (
        <div className="search-empty">
          <span className="empty-icon">
            <Search size={40} />
          </span>
          <h2>No results found</h2>
          <p>Try adjusting your search terms</p>
        </div>
      ) : (
        <div className="search-empty">
          <span className="empty-icon">
            <Film size={40} />
          </span>
          <h2>Start searching</h2>
          <p>Find movies and TV shows</p>
        </div>
      )}
    </div>
  );
}
