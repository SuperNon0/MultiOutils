import type { ReactNode } from 'react';

/** Petit jeu d'icônes interne (SVG inline, stroke = currentColor). */
const PATHS: Record<string, ReactNode> = {
  screenshot: (
    <>
      <path d="M4 7h2l1.5-2h9L18 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 21 11.9h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.6-.9Z" />
    </>
  ),
  fullscreen: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M8 21h8" />
    </>
  ),
  region: (
    <>
      <path d="M7 3v14a2 2 0 0 0 2 2h12" />
      <path d="M3 7h14a2 2 0 0 1 2 2v12" />
    </>
  ),
  window: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 9h18" />
      <path d="M6.5 6.6h.01M9.5 6.6h.01" />
    </>
  ),
  screen: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="1.5" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="1.5" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  save: (
    <>
      <path d="M12 3v11" />
      <path d="m7.5 10.5 4.5 4 4.5-4" />
      <path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </>
  ),
  edit: (
    <>
      <path d="M14.5 4.5 19.5 9.5 8 21H3v-5L14.5 4.5Z" />
      <path d="m12.5 6.5 5 5" />
    </>
  ),
  send: (
    <>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14 21l-3.5-7.5L3 10l18-7Z" />
    </>
  ),
  reveal: (
    <>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
    </>
  ),
  restore: (
    <>
      <path d="M3.5 8a9 9 0 1 1-1 6" />
      <path d="M3 3v5h5" />
    </>
  ),
  close: <path d="m5 5 14 14M19 5 5 19" />,
  check: <path d="m4.5 12.5 5 5L19.5 6.5" />,
  star: (
    <path d="m12 3 2.7 5.8 6.3.8-4.6 4.3 1.2 6.1L12 17l-5.6 3 1.2-6.1L3 9.6l6.3-.8L12 3Z" />
  ),
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-5 3 3 4-4 4 4" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9" />
    </>
  )
};

export function Icon({
  name,
  size = 16
}: {
  name: string;
  size?: number;
}): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.image}
    </svg>
  );
}
