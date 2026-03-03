import React from "react";

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const S: React.FC<
  IconProps & { children: React.ReactNode; viewBox?: string; fill?: string }
> = ({
  size = 20,
  className,
  style,
  children,
  viewBox = "0 0 24 24",
  fill = "none",
}) => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    fill={fill}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{
      display: "inline-block",
      verticalAlign: "middle",
      flexShrink: 0,
      ...style,
    }}
    xmlns="http://www.w3.org/2000/svg"
  >
    {children}
  </svg>
);

/* ─── Playback ─── */

export const Play = (props: IconProps) => (
  <S {...props} fill="none">
    <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />
  </S>
);

export const Pause = (props: IconProps) => (
  <S {...props}>
    <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
    <rect
      x="14"
      y="4"
      width="4"
      height="16"
      fill="currentColor"
      stroke="none"
    />
  </S>
);

/* ─── Stars / Ratings ─── */

export const StarFilled = (props: IconProps) => (
  <S {...props} fill="currentColor">
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      stroke="none"
    />
  </S>
);

export const StarOutline = (props: IconProps) => (
  <S {...props}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </S>
);

/* ─── Navigation / Actions ─── */

export const X = (props: IconProps) => (
  <S {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </S>
);

export const Settings = (props: IconProps) => (
  <S {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </S>
);

export const Search = (props: IconProps) => (
  <S {...props}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </S>
);

/* ─── Media Types ─── */

export const Film = (props: IconProps) => (
  <S {...props}>
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
    <line x1="17" y1="17" x2="22" y2="17" />
  </S>
);

export const Tv = (props: IconProps) => (
  <S {...props}>
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
    <polyline points="17 2 12 7 7 2" />
  </S>
);

/* ─── Status / Alerts ─── */

export const Bolt = (props: IconProps) => (
  <S {...props} fill="currentColor">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="none" />
  </S>
);

export const AlertTriangle = (props: IconProps) => (
  <S {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </S>
);

export const Check = (props: IconProps) => (
  <S {...props}>
    <polyline points="20 6 9 17 4 12" />
  </S>
);

export const XCircle = (props: IconProps) => (
  <S {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </S>
);

/* ─── Objects ─── */

export const Globe = (props: IconProps) => (
  <S {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </S>
);

export const Flag = (props: IconProps) => (
  <S {...props}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </S>
);

export const Lock = (props: IconProps) => (
  <S {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </S>
);

export const Mail = (props: IconProps) => (
  <S {...props}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </S>
);

export const Clock = (props: IconProps) => (
  <S {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </S>
);

export const Folder = (props: IconProps) => (
  <S {...props}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </S>
);

export const Clipboard = (props: IconProps) => (
  <S {...props}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </S>
);

export const Pencil = (props: IconProps) => (
  <S {...props}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </S>
);

export const BookOpen = (props: IconProps) => (
  <S {...props}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </S>
);

export const Users = (props: IconProps) => (
  <S {...props}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </S>
);

export const Volume2 = (props: IconProps) => (
  <S {...props}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </S>
);

export const Sparkles = (props: IconProps) => (
  <S {...props}>
    <path
      d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"
      fill="currentColor"
      stroke="none"
    />
    <path
      d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"
      fill="currentColor"
      stroke="none"
    />
  </S>
);

export const ChevronLeft = (props: IconProps) => (
  <S {...props}>
    <polyline points="15 18 9 12 15 6" />
  </S>
);

export const ChevronRight = (props: IconProps) => (
  <S {...props}>
    <polyline points="9 18 15 12 9 6" />
  </S>
);

export const Calendar = (props: IconProps) => (
  <S {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </S>
);

export const ArrowLeft = (props: IconProps) => (
  <S {...props}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </S>
);

export const VolumeX = (props: IconProps) => (
  <S {...props}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </S>
);

export const Volume1 = (props: IconProps) => (
  <S {...props}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </S>
);

export const SkipForward = (props: IconProps) => (
  <S {...props}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </S>
);

export const Maximize = (props: IconProps) => (
  <S {...props}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </S>
);

export const Minimize = (props: IconProps) => (
  <S {...props}>
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
  </S>
);

/* ─── Format / HDR Logo Badges ─── */

interface BadgeProps {
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "middle",
  flexShrink: 0,
};

/**
 * Dolby Vision logo badge – iconic double-D with "VISION" on black pill, purple accent.
 */
export const DolbyVisionBadge = ({
  height = 18,
  className,
  style,
}: BadgeProps) => (
  <svg
    height={height}
    viewBox="0 0 100 28"
    fill="none"
    className={className}
    style={{ ...badgeStyle, ...style }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100" height="28" rx="4" fill="#000" />
    <rect
      x="1"
      y="1"
      width="98"
      height="26"
      rx="3.5"
      stroke="#a78bfa"
      strokeWidth="1"
      fill="none"
    />
    {/* Left D */}
    <path
      d="M8 6 L12 6 C16.97 6 21 10.03 21 14 C21 17.97 16.97 22 12 22 L8 22 Z"
      fill="#a78bfa"
    />
    <path
      d="M10.5 9 L12 9 C14.76 9 17 11.24 17 14 C17 16.76 14.76 19 12 19 L10.5 19 Z"
      fill="#000"
    />
    {/* Right D (mirrored) */}
    <path
      d="M31 6 L27 6 C22.03 6 18 10.03 18 14 C18 17.97 22.03 22 27 22 L31 22 Z"
      fill="#a78bfa"
    />
    <path
      d="M28.5 9 L27 9 C24.24 9 22 11.24 22 14 C22 16.76 24.24 19 27 19 L28.5 19 Z"
      fill="#000"
    />
    <text
      x="38"
      y="18"
      fontFamily="system-ui, -apple-system, sans-serif"
      fontSize="11"
      fontWeight="700"
      letterSpacing="1.2"
      fill="#a78bfa"
    >
      VISION
    </text>
  </svg>
);

/**
 * HDR10 logo badge – dark pill with amber text and subtle gold border.
 */
export const HDR10Badge = ({ height = 18, className, style }: BadgeProps) => (
  <svg
    height={height}
    viewBox="0 0 60 28"
    fill="none"
    className={className}
    style={{ ...badgeStyle, ...style }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="60" height="28" rx="4" fill="#000" />
    <rect
      x="1"
      y="1"
      width="58"
      height="26"
      rx="3.5"
      stroke="#d97706"
      strokeWidth="1"
      fill="none"
    />
    <text
      x="30"
      y="18.5"
      fontFamily="system-ui, -apple-system, sans-serif"
      fontSize="12"
      fontWeight="800"
      letterSpacing="0.6"
      fill="#fbbf24"
      textAnchor="middle"
    >
      HDR10
    </text>
  </svg>
);

/**
 * HDR10+ logo badge – dark pill with gold text and gold accent border.
 */
export const HDR10PlusBadge = ({
  height = 18,
  className,
  style,
}: BadgeProps) => (
  <svg
    height={height}
    viewBox="0 0 72 28"
    fill="none"
    className={className}
    style={{ ...badgeStyle, ...style }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="72" height="28" rx="4" fill="#000" />
    <rect
      x="1"
      y="1"
      width="70"
      height="26"
      rx="3.5"
      stroke="#f59e0b"
      strokeWidth="1"
      fill="none"
    />
    <text
      x="36"
      y="18.5"
      fontFamily="system-ui, -apple-system, sans-serif"
      fontSize="12"
      fontWeight="800"
      letterSpacing="0.5"
      fill="#fbbf24"
      textAnchor="middle"
    >
      HDR10+
    </text>
  </svg>
);

/**
 * Dolby Atmos logo badge – double-D with "ATMOS" on black pill, blue accent.
 */
export const DolbyAtmosBadge = ({
  height = 18,
  className,
  style,
}: BadgeProps) => (
  <svg
    height={height}
    viewBox="0 0 96 28"
    fill="none"
    className={className}
    style={{ ...badgeStyle, ...style }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="96" height="28" rx="4" fill="#000" />
    <rect
      x="1"
      y="1"
      width="94"
      height="26"
      rx="3.5"
      stroke="#60a5fa"
      strokeWidth="1"
      fill="none"
    />
    {/* Left D */}
    <path
      d="M8 6 L12 6 C16.97 6 21 10.03 21 14 C21 17.97 16.97 22 12 22 L8 22 Z"
      fill="#60a5fa"
    />
    <path
      d="M10.5 9 L12 9 C14.76 9 17 11.24 17 14 C17 16.76 14.76 19 12 19 L10.5 19 Z"
      fill="#000"
    />
    {/* Right D (mirrored) */}
    <path
      d="M31 6 L27 6 C22.03 6 18 10.03 18 14 C18 17.97 22.03 22 27 22 L31 22 Z"
      fill="#60a5fa"
    />
    <path
      d="M28.5 9 L27 9 C24.24 9 22 11.24 22 14 C22 16.76 24.24 19 27 19 L28.5 19 Z"
      fill="#000"
    />
    <text
      x="37"
      y="18"
      fontFamily="system-ui, -apple-system, sans-serif"
      fontSize="11"
      fontWeight="700"
      letterSpacing="1.2"
      fill="#60a5fa"
    >
      ATMOS
    </text>
  </svg>
);

/**
 * Generic HDR badge – dark pill with amber text.
 */
export const HDRBadge = ({ height = 18, className, style }: BadgeProps) => (
  <svg
    height={height}
    viewBox="0 0 48 28"
    fill="none"
    className={className}
    style={{ ...badgeStyle, ...style }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="48" height="28" rx="4" fill="#000" />
    <rect
      x="1"
      y="1"
      width="46"
      height="26"
      rx="3.5"
      stroke="#92400e"
      strokeWidth="1"
      fill="none"
    />
    <text
      x="24"
      y="18.5"
      fontFamily="system-ui, -apple-system, sans-serif"
      fontSize="13"
      fontWeight="800"
      letterSpacing="0.8"
      fill="#fbbf24"
      textAnchor="middle"
    >
      HDR
    </text>
  </svg>
);

interface VideoCodecBadgeProps extends BadgeProps {
  codec: string;
}

function getCodecVisual(codec: string) {
  const normalized = codec.toUpperCase();

  if (
    normalized.includes("HEVC") ||
    normalized.includes("H265") ||
    normalized.includes("X265")
  ) {
    return { label: "HEVC", accent: "#60a5fa", width: 68 };
  }

  if (normalized.includes("AV1")) {
    return { label: "AV1", accent: "#f472b6", width: 56 };
  }

  if (
    normalized.includes("H264") ||
    normalized.includes("X264") ||
    normalized.includes("AVC")
  ) {
    return { label: "H.264", accent: "#9ca3af", width: 70 };
  }

  return { label: normalized.slice(0, 8), accent: "#9ca3af", width: 74 };
}

export const VideoCodecBadge = ({
  codec,
  height = 18,
  className,
  style,
}: VideoCodecBadgeProps) => {
  const visual = getCodecVisual(codec);
  const h = 28;

  return (
    <svg
      height={height}
      viewBox={`0 0 ${visual.width} ${h}`}
      fill="none"
      className={className}
      style={{ ...badgeStyle, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={visual.width} height={h} rx="4" fill="#000" />
      <rect
        x="0.5"
        y="0.5"
        width={visual.width - 1}
        height={h - 1}
        rx="3.5"
        stroke={visual.accent}
        strokeWidth="1"
        fill="none"
      />
      <rect
        x="6"
        y="8"
        width="10"
        height="12"
        rx="1.5"
        fill={visual.accent}
        opacity="0.2"
      />
      <path d="M9 11.5L13.5 14L9 16.5V11.5Z" fill={visual.accent} />
      <text
        x="22"
        y="18"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="11"
        fontWeight="700"
        letterSpacing="0.7"
        fill={visual.accent}
      >
        {visual.label}
      </text>
    </svg>
  );
};
