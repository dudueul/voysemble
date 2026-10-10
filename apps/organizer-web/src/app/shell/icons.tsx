// Copyright 2026- At Day. All rights reserved.
// Inline stroke icons (24x24 grid). No icon dependency: smaller bundle, no supply-chain surface.
// Icons are always decorative (aria-hidden); the adjacent text or aria-label carries meaning.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...rest }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  today: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  ),
  itinerary: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </Svg>
  ),
  graph: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 7.5l3 8M16 7.5l-3 8M8.5 6h7" />
    </Svg>
  ),
  people: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0113 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.5a5 5 0 016 5.5" />
    </Svg>
  ),
  chat: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 5h16v11H9l-5 4z" />
    </Svg>
  ),
  plane: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 12.5l19-8-5 17-4-7z" />
      <path d="M12.5 14.5l9-10" />
    </Svg>
  ),
  shield: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  media: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-8 8" />
    </Svg>
  ),
  checklist: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 6l2 2 3-3M4 13l2 2 3-3M4 20l2 2 3-3" />
      <path d="M12 7h9M12 14h9M12 21h9" />
    </Svg>
  ),
  chart: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  ),
  card: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </Svg>
  ),
  settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </Svg>
  ),
  bell: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 16V11a6 6 0 1112 0v5l2 2H4z" />
      <path d="M10 21h4" />
    </Svg>
  ),
  bus: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="14" rx="3" />
      <path d="M4 11h16M8 18v2M16 18v2M8 14.5h.01M16 14.5h.01" />
    </Svg>
  ),
  meal: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 3v8M9 3v8M7.5 11v10M17 3c-2 1-3 3-3 6v12M17 3v18" />
    </Svg>
  ),
  pin: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 21s-6-5.3-6-11a6 6 0 1112 0c0 5.7-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </Svg>
  ),
  hotel: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 21V7l9-4 9 4v14" />
      <path d="M9 21v-5h6v5M9 11h.01M15 11h.01M12 11h.01" />
    </Svg>
  ),
  flag: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 21V4h12l-2 4 2 4H5" />
    </Svg>
  ),
  alert: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v4M12 17.5h.01" />
    </Svg>
  ),
  info: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 12l4 4L19 7" />
    </Svg>
  ),
  offline: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 3l18 18M8.5 8.6A9 9 0 002.5 12M5.5 15.5a5 5 0 0110.4-1.6M12 19h.01M21.5 12a9 9 0 00-5.4-3.2" />
    </Svg>
  ),
  plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  arrow: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  logo: (p: IconProps) => (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" {...p}>
      <path
        d="M4 7l12 19L28 7"
        fill="none"
        stroke="var(--vy-brand)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="8" r="4" fill="var(--vy-color-brand-sun)" />
    </svg>
  ),
} as const;

export type IconName = keyof typeof Icons;
