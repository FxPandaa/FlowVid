import { useState, useEffect } from "react";
import { X, Volume2 } from "./Icons";
import "./AudioTrackSelector.css";

export interface AudioTrack {
  id: string;
  label: string;
  language: string;
  kind: string;
  enabled: boolean;
  // Additional metadata
  channels?: string; // e.g., "2.0", "5.1", "7.1"
  codec?: string; // e.g., "AAC", "AC3", "DTS", "Atmos"
}

interface AudioTrackSelectorProps {
  tracks: AudioTrack[];
  activeTrackId: string | null;
  onSelect: (trackId: string) => void;
}

export function AudioTrackSelector({
  tracks,
  activeTrackId,
  onSelect,
}: AudioTrackSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const activeTrack = tracks.find((t) => t.id === activeTrackId);

  // Parse language name from code
  const getLanguageName = (langCode: string): string => {
    const languageNames: Record<string, string> = {
      en: "English",
      eng: "English",
      es: "Spanish",
      spa: "Spanish",
      fr: "French",
      fre: "French",
      de: "German",
      ger: "German",
      it: "Italian",
      ita: "Italian",
      pt: "Portuguese",
      por: "Portuguese",
      ru: "Russian",
      rus: "Russian",
      ja: "Japanese",
      jpn: "Japanese",
      ko: "Korean",
      kor: "Korean",
      zh: "Chinese",
      chi: "Chinese",
      ar: "Arabic",
      ara: "Arabic",
      nl: "Dutch",
      dut: "Dutch",
      nld: "Dutch",
    };

    return languageNames[langCode.toLowerCase()] || langCode.toUpperCase();
  };

  // Extract audio format from label
  const parseAudioFormat = (
    label: string,
  ): { language: string; format: string } => {
    let language = "Unknown";
    let format = "";

    // Try to extract language
    const langMatch = label.match(
      /\b(English|Spanish|French|German|Italian|Portuguese|Russian|Japanese|Korean|Chinese|Arabic|Dutch)\b/i,
    );
    if (langMatch) {
      language = langMatch[1];
    }

    // Try to extract format info (5.1, Atmos, etc.)
    const formatMatch = label.match(
      /\b(Stereo|2\.0|5\.1|7\.1|Atmos|DTS|AC3|AAC|TrueHD|DTS-HD)\b/i,
    );
    if (formatMatch) {
      format = formatMatch[1];
    }

    return { language, format };
  };

  if (tracks.length === 0) {
    return null; // No audio tracks available
  }

  if (!isOpen) {
    return (
      <button className="audio-toggle-btn" onClick={() => setIsOpen(true)}>
        <span className="audio-icon">
          <Volume2 size={16} />
        </span>
        {activeTrack && (
          <span className="audio-active-lang">
            {getLanguageName(activeTrack.language)}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="audio-selector">
      <div className="audio-header">
        <h3>Audio Tracks</h3>
        <button className="close-btn" onClick={() => setIsOpen(false)}>
          <X size={14} />
        </button>
      </div>

      <div className="audio-list">
        {tracks.map((track) => {
          const { language, format } = parseAudioFormat(track.label);
          const isActive = track.id === activeTrackId;

          return (
            <button
              key={track.id}
              className={`audio-option ${isActive ? "active" : ""}`}
              onClick={() => {
                onSelect(track.id);
                setIsOpen(false);
              }}
            >
              <div className="audio-info">
                <span className="audio-language">
                  {language !== "Unknown"
                    ? language
                    : getLanguageName(track.language)}
                </span>
                {format && <span className="audio-format-badge">{format}</span>}
              </div>
              {track.label && <div className="audio-label">{track.label}</div>}
            </button>
          );
        })}
      </div>

      {tracks.length === 1 && (
        <div className="audio-hint">
          <p>Only one audio track available</p>
        </div>
      )}
    </div>
  );
}
