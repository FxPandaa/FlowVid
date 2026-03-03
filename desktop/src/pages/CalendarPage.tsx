import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLibraryStore } from "../stores";
import { cinemetaService } from "../services";
import type { Episode } from "../services";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "../components/Icons";
import "./CalendarPage.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CalendarEpisode {
  imdbId: string; // Series IMDb ID
  seriesTitle: string;
  poster?: string;
  season: number;
  episode: number;
  title: string;
  released: string; // ISO date string
  thumbnail?: string;
  overview?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(iso: string): Date | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Construct a reliable Cinemeta poster URL from an IMDb ID. */
function cinemetaPoster(imdbId: string): string {
  return `https://images.metahub.space/poster/medium/${imdbId}/img`;
}

/** Build an array of CalendarEpisode from Cinemeta episodes + series metadata. */
function mapEpisodes(
  imdbId: string,
  seriesTitle: string,
  poster: string | undefined,
  episodes: Episode[],
): CalendarEpisode[] {
  // Use the library poster, or fall back to a constructed Cinemeta URL
  const seriesPoster = poster || cinemetaPoster(imdbId);
  return episodes
    .filter((ep) => ep.released)
    .map((ep) => ({
      imdbId,
      seriesTitle,
      poster: seriesPoster,
      season: ep.season,
      episode: ep.episodeNumber ?? ep.episode,
      title: ep.title || ep.name || `Episode ${ep.episode}`,
      released: ep.released!,
      thumbnail: ep.thumbnail || ep.still,
      overview: ep.overview,
    }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CalendarPage() {
  const navigate = useNavigate();
  const library = useLibraryStore((s) => s.library);

  // Current viewed month
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Selected day key for detail panel
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // All calendar episodes & loading state
  const [episodes, setEpisodes] = useState<CalendarEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);

  // How many library series we need to fetch
  const seriesItems = useMemo(
    () => library.filter((item) => item.type === "series"),
    [library],
  );

  /* ---- Fetch episodes for all library series ---- */
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setLoadedCount(0);

      const allEps: CalendarEpisode[] = [];

      // Fetch in parallel, batched to avoid hammering the CDN
      const BATCH_SIZE = 6;
      for (let i = 0; i < seriesItems.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = seriesItems.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (item) => {
            const details = await cinemetaService.getSeriesDetails(
              item.imdbId,
            );
            if (details.videos) {
              return mapEpisodes(
                item.imdbId,
                item.title,
                item.poster,
                details.videos,
              );
            }
            return [];
          }),
        );

        for (const r of results) {
          if (r.status === "fulfilled") {
            allEps.push(...r.value);
          }
        }

        if (!cancelled) {
          setLoadedCount(Math.min(i + BATCH_SIZE, seriesItems.length));
        }
      }

      if (!cancelled) {
        setEpisodes(allEps);
        setLoading(false);
      }
    }

    if (seriesItems.length > 0) {
      fetchAll();
    } else {
      setEpisodes([]);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [seriesItems]);

  /* ---- Group episodes by date key ---- */
  const episodesByDay = useMemo(() => {
    const map = new Map<string, CalendarEpisode[]>();
    for (const ep of episodes) {
      const d = parseDate(ep.released);
      if (!d) continue;
      const key = toDateKey(d);
      const list = map.get(key) || [];
      list.push(ep);
      map.set(key, list);
    }
    return map;
  }, [episodes]);

  /* ---- Build calendar grid ---- */
  const calendarGrid = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    // Previous month padding
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

    const cells: {
      day: number;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      episodes: CalendarEpisode[];
    }[] = [];

    // Fill in previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dateKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        day,
        dateKey,
        isCurrentMonth: false,
        isToday: false,
        episodes: episodesByDay.get(dateKey) || [],
      });
    }

    // Current month days
    const todayKey = toDateKey(today);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        day,
        dateKey,
        isCurrentMonth: true,
        isToday: dateKey === todayKey,
        episodes: episodesByDay.get(dateKey) || [],
      });
    }

    // Next month padding to fill 6 rows
    const remaining = 42 - cells.length; // 6 rows × 7
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    for (let day = 1; day <= remaining; day++) {
      const dateKey = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        day,
        dateKey,
        isCurrentMonth: false,
        isToday: false,
        episodes: episodesByDay.get(dateKey) || [],
      });
    }

    return cells;
  }, [year, month, episodesByDay, today]);

  /* ---- Month navigation ---- */
  const goToPrevMonth = useCallback(() => {
    setSelectedDay(null);
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }, [month]);

  const goToNextMonth = useCallback(() => {
    setSelectedDay(null);
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }, [month]);

  const goToToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(toDateKey(today));
  }, [today]);

  /* ---- Selected day episodes ---- */
  const selectedEpisodes = useMemo(() => {
    if (!selectedDay) return [];
    return episodesByDay.get(selectedDay) || [];
  }, [selectedDay, episodesByDay]);

  /* ---- Upcoming episodes (next 30 days) ---- */
  const upcomingEpisodes = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    return episodes
      .filter((ep) => {
        const d = parseDate(ep.released);
        return d && d >= now && d <= thirtyDays;
      })
      .sort((a, b) => {
        const da = parseDate(a.released)!;
        const db = parseDate(b.released)!;
        return da.getTime() - db.getTime();
      })
      .slice(0, 20);
  }, [episodes]);

  /* ---- Format a date key for display ---- */
  function formatDateLabel(dateKey: string): string {
    const d = new Date(dateKey + "T00:00:00");
    const todayKey = toDateKey(today);
    if (dateKey === todayKey) return "Today";

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateKey === toDateKey(tomorrow)) return "Tomorrow";

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateKey === toDateKey(yesterday)) return "Yesterday";

    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  function formatUpcomingDate(iso: string): string {
    const d = parseDate(iso);
    if (!d) return "";
    const key = toDateKey(d);
    const todayKey = toDateKey(today);
    if (key === todayKey) return "Today";
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (key === toDateKey(tomorrow)) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  /* ---- Render ---- */
  return (
    <div className="calendar-page">
      <div className={`calendar-container${selectedDay ? " detail-open" : ""}`}>
        {/* Left: Calendar grid */}
        <div className="calendar-main">
          <div className="calendar-header">
            <h1 className="calendar-title">Calendar</h1>
            <div className="calendar-nav">
              <button className="cal-nav-btn" onClick={goToPrevMonth}>
                <ChevronLeft size={20} />
              </button>
              <button className="cal-month-label" onClick={goToToday}>
                {MONTH_NAMES[month]} {year}
              </button>
              <button className="cal-nav-btn" onClick={goToNextMonth}>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="calendar-loading">
              <div className="calendar-spinner" />
              <p>
                Loading episodes&hellip;{" "}
                {seriesItems.length > 0 &&
                  `(${loadedCount}/${seriesItems.length} series)`}
              </p>
            </div>
          ) : seriesItems.length === 0 ? (
            <div className="calendar-empty">
              <div className="calendar-empty-icon"><CalendarIcon size={40} /></div>
              <p className="calendar-empty-title">No series in your library</p>
              <p className="calendar-empty-sub">
                Add TV shows to your library to see upcoming episodes here.
              </p>
            </div>
          ) : (
            <div className="calendar-grid">
              {/* Day headers */}
              {DAY_NAMES.map((day) => (
                <div key={day} className="calendar-day-header">
                  {day}
                </div>
              ))}

              {/* Day cells */}
              {calendarGrid.map((cell) => {
                const hasEpisodes = cell.episodes.length > 0;
                const isSelected = selectedDay === cell.dateKey;
                const isPast =
                  new Date(cell.dateKey + "T00:00:00") <
                  new Date(toDateKey(today) + "T00:00:00");

                return (
                  <button
                    key={cell.dateKey}
                    className={[
                      "calendar-cell",
                      !cell.isCurrentMonth && "other-month",
                      cell.isToday && "today",
                      isSelected && "selected",
                      hasEpisodes && "has-episodes",
                      isPast && hasEpisodes && "past",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() =>
                      setSelectedDay(isSelected ? null : cell.dateKey)
                    }
                  >
                    <span className="cell-day-number">{cell.day}</span>
                    {hasEpisodes && (
                      <div className="cell-episode-posters">
                        {cell.episodes.slice(0, 3).map((ep, i) => (
                          <img
                            key={i}
                            className="cell-poster"
                            src={ep.poster || cinemetaPoster(ep.imdbId)}
                            alt={ep.seriesTitle}
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget;
                              const fallback = cinemetaPoster(ep.imdbId);
                              if (target.src !== fallback) target.src = fallback;
                              else target.style.display = "none";
                            }}
                          />
                        ))}
                        {cell.episodes.length > 3 && (
                          <span className="cell-poster-more">
                            +{cell.episodes.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Detail panel */}
        <div className={`calendar-detail ${selectedDay ? "open" : ""}`}>
          {selectedDay ? (
            <>
              <div className="detail-header">
                <h2 className="detail-date">{formatDateLabel(selectedDay)}</h2>
                <button
                  className="detail-close"
                  onClick={() => setSelectedDay(null)}
                >
                  ✕
                </button>
              </div>
              {selectedEpisodes.length > 0 ? (
                <div className="detail-episodes">
                  {selectedEpisodes.map((ep, i) => (
                    <button
                      key={i}
                      className="detail-episode-card"
                      onClick={() =>
                        navigate(`/details/series/${ep.imdbId}`)
                      }
                    >
                      <div className="detail-ep-poster">
                        <img
                          src={ep.thumbnail || ep.poster || cinemetaPoster(ep.imdbId)}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            // Final fallback: try constructed Cinemeta poster
                            const target = e.currentTarget;
                            const fallback = cinemetaPoster(ep.imdbId);
                            if (target.src !== fallback) target.src = fallback;
                          }}
                        />
                      </div>
                      <div className="detail-ep-info">
                        <span className="detail-ep-series">
                          {ep.seriesTitle}
                        </span>
                        <span className="detail-ep-number">
                          S{ep.season} E{ep.episode}
                        </span>
                        <span className="detail-ep-title">{ep.title}</span>
                        {ep.overview && (
                          <span className="detail-ep-overview">
                            {ep.overview}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="detail-no-eps">No episodes on this day.</p>
              )}
            </>
          ) : (
            <div className="detail-placeholder">
              <p>Select a day to see episode details</p>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming episodes section */}
      {!loading && upcomingEpisodes.length > 0 && (
        <div className="upcoming-section">
          <h2 className="upcoming-title">Upcoming Episodes</h2>
          <div className="upcoming-list">
            {upcomingEpisodes.map((ep, i) => (
              <button
                key={i}
                className="upcoming-card"
                onClick={() => navigate(`/details/series/${ep.imdbId}`)}
              >
                <div className="upcoming-poster">
                  <img
                    src={ep.poster || cinemetaPoster(ep.imdbId)}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      const fallback = cinemetaPoster(ep.imdbId);
                      if (target.src !== fallback) target.src = fallback;
                    }}
                  />
                </div>
                <div className="upcoming-info">
                  <span className="upcoming-series">{ep.seriesTitle}</span>
                  <span className="upcoming-ep">
                    S{ep.season} E{ep.episode} · {ep.title}
                  </span>
                  <span className="upcoming-date">
                    {formatUpcomingDate(ep.released)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
