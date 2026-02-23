import { useState, useEffect } from "react";
import { Subtitle } from "../services";
import { X, StarFilled } from "./Icons";
import "./SubtitleSelector.css";

interface SubtitleSelectorProps {
  subtitles: Subtitle[];
  activeSubtitleId: string | null;
  onSelect: (subtitle: Subtitle | null) => void;
  onTimingAdjust: (offset: number) => void;
  currentOffset: number;
  activeSource?: "embedded" | "addon" | null;
}

export function SubtitleSelector({
  subtitles,
  activeSubtitleId,
  onSelect,
  onTimingAdjust,
  currentOffset,
  activeSource = null,
}: SubtitleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [timingOffset, setTimingOffset] = useState(currentOffset);

  useEffect(() => {
    setTimingOffset(currentOffset);
  }, [currentOffset]);

  const handleTimingChange = (delta: number) => {
    const newOffset = timingOffset + delta;
    setTimingOffset(newOffset);
    onTimingAdjust(newOffset);
  };

  const activeSubtitle = subtitles.find((s) => s.id === activeSubtitleId);

  // Group subtitles by language
  const groupedSubtitles = subtitles.reduce(
    (acc, subtitle) => {
      const lang = subtitle.language;
      if (!acc[lang]) {
        acc[lang] = [];
      }
      acc[lang].push(subtitle);
      return acc;
    },
    {} as Record<string, Subtitle[]>,
  );

  if (!isOpen) {
    return (
      <button
        className={`subtitle-toggle-btn ${activeSubtitle ? "has-subtitle" : ""}`}
        onClick={() => setIsOpen(true)}
        title={
          activeSubtitle
            ? `Subtitles: ${activeSubtitle.language}`
            : "Subtitles: Off"
        }
      >
        <span className="subtitle-icon">CC</span>
        <span className="subtitle-status">
          {activeSource === "embedded" ? "EMB" : activeSubtitle ? "ADD" : "OFF"}
        </span>
      </button>
    );
  }

  return (
    <div className="subtitle-selector">
      <div className="subtitle-header">
        <h3>Subtitles</h3>
        <button className="close-btn" onClick={() => setIsOpen(false)}>
          <X size={14} />
        </button>
      </div>

      <div className="subtitle-list">
        {/* Off option */}
        <button
          className={`subtitle-option ${!activeSubtitleId ? "active" : ""}`}
          onClick={() => {
            onSelect(null);
            setIsOpen(false);
          }}
        >
          <span className="subtitle-lang">Off</span>
        </button>

        {/* Subtitles grouped by language */}
        {Object.entries(groupedSubtitles).map(([language, subs]) => (
          <div key={language} className="subtitle-language-group">
            <div className="subtitle-language-header">{language}</div>
            {subs.map((subtitle) => (
              <button
                key={subtitle.id}
                className={`subtitle-option ${
                  activeSubtitleId === subtitle.id ? "active" : ""
                }`}
                onClick={() => {
                  onSelect(subtitle);
                  setIsOpen(false);
                }}
              >
                <div className="subtitle-info">
                  <span className="subtitle-filename">{subtitle.language}</span>
                  <div className="subtitle-meta">
                    <span className="subtitle-badge">ADDON</span>
                    {subtitle.hearing_impaired && (
                      <span className="subtitle-badge">HI</span>
                    )}
                    {subtitle.foreignPartsOnly && (
                      <span className="subtitle-badge">Foreign</span>
                    )}
                    <span className="subtitle-downloads">
                      ↓ {subtitle.downloads.toLocaleString()}
                    </span>
                    {subtitle.rating > 0 && (
                      <span className="subtitle-rating">
                        <StarFilled size={12} /> {subtitle.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Timing controls (only show when subtitle is active) */}
      {activeSubtitleId && (
        <div className="subtitle-timing">
          <div className="timing-header">
            <span>Timing Adjustment</span>
            <span className="timing-value">
              {timingOffset > 0 ? "+" : ""}
              {timingOffset.toFixed(1)}s
            </span>
          </div>
          <div className="timing-controls">
            <button
              className="timing-btn"
              onClick={() => handleTimingChange(-1)}
            >
              -1s
            </button>
            <button
              className="timing-btn"
              onClick={() => handleTimingChange(-0.1)}
            >
              -0.1s
            </button>
            <button
              className="timing-btn"
              onClick={() => {
                setTimingOffset(0);
                onTimingAdjust(0);
              }}
            >
              Reset
            </button>
            <button
              className="timing-btn"
              onClick={() => handleTimingChange(0.1)}
            >
              +0.1s
            </button>
            <button
              className="timing-btn"
              onClick={() => handleTimingChange(1)}
            >
              +1s
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
