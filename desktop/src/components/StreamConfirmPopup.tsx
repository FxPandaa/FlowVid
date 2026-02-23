import { useEffect, useCallback } from "react";
import { TorrentResult } from "../services/scraping/types";
import {
  parseStreamInfo,
  BADGE_COLORS,
  formatFileSize,
} from "../utils/streamParser";
import { X, Film, Sparkles, Volume2, Folder, Play, Bolt } from "./Icons";
import "./StreamConfirmPopup.css";

interface StreamConfirmPopupProps {
  torrent: TorrentResult;
  onPlay: () => void;
  onCancel: () => void;
  isInstant?: boolean;
}

export function StreamConfirmPopup({
  torrent,
  onPlay,
  onCancel,
  isInstant = false,
}: StreamConfirmPopupProps) {
  const streamInfo = parseStreamInfo(torrent.title);

  // Handle ESC key and click outside
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter") {
        onPlay();
      }
    },
    [onCancel, onPlay],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div className="stream-popup-backdrop" onClick={handleBackdropClick}>
      <div className="stream-popup">
        <div className="stream-popup-header">
          <h2>Stream Details</h2>
          <button className="stream-popup-close" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="stream-popup-content">
          {/* Title */}
          <div className="stream-popup-title">{torrent.title}</div>

          {/* Quick Badges */}
          <div className="stream-quick-badges">
            <ResolutionBadge resolution={streamInfo.resolutionBadge} />
            <HDRBadge
              hdrType={streamInfo.hdrType}
              profile={streamInfo.dolbyVisionProfile}
            />
            {streamInfo.videoCodec && (
              <CodecBadge codec={streamInfo.videoCodec} />
            )}
            {streamInfo.hasAtmos && <AtmosBadge />}
            {streamInfo.isRemux && <RemuxBadge />}
            {isInstant && <InstantBadge />}
          </div>

          {/* Detailed Info Sections */}
          <div className="stream-info-sections">
            {/* Video Section */}
            <InfoSection title="Video" icon={<Film size={16} />}>
              <InfoRow label="Resolution" value={streamInfo.resolution} />
              {streamInfo.videoCodec && (
                <InfoRow label="Codec" value={streamInfo.videoCodec} />
              )}
              {streamInfo.bitDepth && (
                <InfoRow label="Bit Depth" value={streamInfo.bitDepth} />
              )}
            </InfoSection>

            {/* HDR Section */}
            <InfoSection title="HDR" icon={<Sparkles size={16} />}>
              <div className="hdr-display">
                <HDRBadgeLarge
                  hdrType={streamInfo.hdrType}
                  profile={streamInfo.dolbyVisionProfile}
                />
                {streamInfo.isHDR && (
                  <p className="hdr-explanation">
                    {getHDRExplanation(
                      streamInfo.hdrType,
                      streamInfo.dolbyVisionProfile,
                    )}
                  </p>
                )}
              </div>
            </InfoSection>

            {/* Audio Section */}
            <InfoSection title="Audio" icon={<Volume2 size={16} />}>
              {streamInfo.audioCodec && (
                <InfoRow label="Codec" value={streamInfo.audioCodec} />
              )}
              {streamInfo.audioChannels && (
                <InfoRow label="Channels" value={streamInfo.audioChannels} />
              )}
              {streamInfo.hasAtmos && (
                <InfoRow label="Spatial" value="Dolby Atmos" highlight />
              )}
              {streamInfo.languages.length > 0 && (
                <InfoRow
                  label="Languages"
                  value={streamInfo.languages.join(", ")}
                />
              )}
            </InfoSection>

            {/* Source Section */}
            <InfoSection title="Source" icon={<Folder size={16} />}>
              <InfoRow
                label="Size"
                value={torrent.sizeFormatted || formatFileSize(torrent.size)}
              />
              {streamInfo.source && (
                <InfoRow label="Source" value={streamInfo.source} />
              )}
              {streamInfo.releaseGroup && (
                <InfoRow label="Release" value={streamInfo.releaseGroup} />
              )}
              <InfoRow label="Seeders" value={`${torrent.seeds}`} />
              <InfoRow label="Provider" value={torrent.provider} />
            </InfoSection>
          </div>
        </div>

        <div className="stream-popup-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary btn-play" onClick={onPlay}>
            <span className="play-icon">
              <Play size={14} />
            </span>
            Play
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-components
function InfoSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="info-section">
      <h3>
        <span className="info-icon">{icon}</span>
        {title}
      </h3>
      <div className="info-section-content">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`info-row ${highlight ? "highlight" : ""}`}>
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function ResolutionBadge({ resolution }: { resolution: string }) {
  const color =
    BADGE_COLORS[resolution as keyof typeof BADGE_COLORS] ||
    BADGE_COLORS["480p"];
  return (
    <span className="badge badge-resolution" style={{ backgroundColor: color }}>
      {resolution}
    </span>
  );
}

function HDRBadge({ hdrType, profile }: { hdrType: string; profile?: string }) {
  if (hdrType === "SDR") {
    return (
      <span
        className="badge badge-sdr"
        style={{ backgroundColor: BADGE_COLORS.SDR }}
      >
        SDR
      </span>
    );
  }

  const color =
    BADGE_COLORS[hdrType as keyof typeof BADGE_COLORS] || BADGE_COLORS.HDR10;
  const label =
    hdrType === "Dolby Vision"
      ? profile
        ? `DV ${profile}`
        : "Dolby Vision"
      : hdrType;

  return (
    <span className="badge badge-hdr" style={{ backgroundColor: color }}>
      {label}
    </span>
  );
}

function HDRBadgeLarge({
  hdrType,
  profile,
}: {
  hdrType: string;
  profile?: string;
}) {
  const color =
    BADGE_COLORS[hdrType as keyof typeof BADGE_COLORS] || BADGE_COLORS.SDR;

  let label = hdrType;
  if (hdrType === "Dolby Vision" && profile) {
    label = `Dolby Vision ${profile}`;
  }

  return (
    <div className="hdr-badge-large" style={{ backgroundColor: color }}>
      {hdrType === "Dolby Vision" && <span className="dv-icon">◆</span>}
      {label}
    </div>
  );
}

function CodecBadge({ codec }: { codec: string }) {
  const color = BADGE_COLORS[codec as keyof typeof BADGE_COLORS] || "#6B7280";
  return (
    <span className="badge badge-codec" style={{ backgroundColor: color }}>
      {codec}
    </span>
  );
}

function AtmosBadge() {
  return (
    <span
      className="badge badge-atmos"
      style={{ backgroundColor: BADGE_COLORS.Atmos }}
    >
      Atmos
    </span>
  );
}

function RemuxBadge() {
  return (
    <span
      className="badge badge-remux"
      style={{ backgroundColor: BADGE_COLORS.Remux }}
    >
      Remux
    </span>
  );
}

function InstantBadge() {
  return (
    <span className="badge badge-instant">
      <Bolt size={12} /> Instant
    </span>
  );
}

function getHDRExplanation(hdrType: string, profile?: string): string {
  switch (hdrType) {
    case "Dolby Vision":
      if (profile?.includes("8.4")) {
        return "Dolby Vision Profile 8.4 with HDR10 fallback. Compatible with most modern TVs.";
      }
      if (profile?.includes("8.1")) {
        return "Dolby Vision Profile 8.1 with SDR fallback. Streaming optimized.";
      }
      if (profile?.includes("7")) {
        return "Dolby Vision Profile 7. Dual-layer format, best quality but limited compatibility.";
      }
      if (profile?.includes("5")) {
        return "Dolby Vision Profile 5. Single-layer, streaming optimized.";
      }
      return "Dolby Vision provides dynamic HDR metadata for enhanced picture quality.";
    case "HDR10+":
      return "HDR10+ with dynamic metadata. Samsung TVs have best support.";
    case "HDR10":
      return "HDR10 with static metadata. Widely supported on all HDR displays.";
    case "HLG":
      return "Hybrid Log-Gamma. Broadcast-friendly HDR format.";
    default:
      return "Standard Dynamic Range. Compatible with all displays.";
  }
}
