/* Chartly · stroke SVG icon set (no emojis) from the redesign bundle. */

type IconProps = { size?: number; className?: string };

function S({ size = 22, children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const Icons = {
  wallet: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M3 7.5C3 6.4 3.9 5.5 5 5.5h12.5c.55 0 1 .45 1 1V8" />
      <path d="M3 7.5v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V11c0-1.1-.9-2-2-2H5c-1.1 0-2-.9-2-2Z" />
      <circle cx="17" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    </S>
  ),
  shift: (p: IconProps = {}) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </S>
  ),
  chart: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M4 19h16" />
      <rect x="6" y="10" width="3" height="7" rx="1" />
      <rect x="11" y="6" width="3" height="11" rx="1" />
      <rect x="16" y="13" width="3" height="4" rx="1" />
    </S>
  ),
  agenda: (p: IconProps = {}) => (
    <S {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <circle cx="8.5" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
    </S>
  ),
  projects: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M14.7 6.3a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.6 19.4l-4 1 1-4 9.1-9.1Z" />
      <path d="m13 8 3 3" />
    </S>
  ),
  trabajos: (p: IconProps = {}) => (
    <S {...p}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </S>
  ),
  plus: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  arrowUp: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </S>
  ),
  arrowDown: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </S>
  ),
  bolt: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
    </S>
  ),
  search: (p: IconProps = {}) => (
    <S {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-3.5-3.5" />
    </S>
  ),
  bell: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 1.5h-15L6 17Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </S>
  ),
  more: (p: IconProps = {}) => (
    <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  ),
  send: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M5 12 19 5l-3 14-4-5-7-2Z" />
    </S>
  ),
  receive: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M12 4v12M6 11l6 6 6-6" />
      <path d="M5 20h14" />
    </S>
  ),
  scan: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />
      <path d="M7 12h10" />
    </S>
  ),
  fuel: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M3 21h14" />
      <path d="M15 9h2.5a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3" />
      <path d="M7 7h6" />
    </S>
  ),
  filter: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </S>
  ),
  flame: (p: IconProps = {}) => (
    <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden>
      <path d="M12 22a6 6 0 0 1-6-6c0-2 1-3.5 2-5 .5 1 1.5 1 2-1 0-2-1-3-1-5 3 0 5 2 5 5 1-1 1-2 1-4 3 2 4 5 4 8.5A6.5 6.5 0 0 1 12 22Z" />
    </svg>
  ),
  briefcase: (p: IconProps = {}) => (
    <S {...p}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </S>
  ),
  check: (p: IconProps = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  chevronRight: (p: IconProps = {}) => (
    <S {...p}>
      <path d="M9 5l7 7-7 7" />
    </S>
  ),
  settings: (p: IconProps = {}) => (
    <S {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </S>
  ),
};
