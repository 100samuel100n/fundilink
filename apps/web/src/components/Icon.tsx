import React from 'react';

/** One outline icon family for the whole web app: 24px grid, 1.75 stroke, round joins. Replaces emoji everywhere. */
const P = (d: string, k?: number) => <path key={k ?? d} d={d} />;
const C = (cx: number, cy: number, r: number) => <circle key={`${cx}${cy}${r}`} cx={cx} cy={cy} r={r} />;
const R = (x: number, y: number, w: number, h: number, rx = 2) => <rect key={`${x}${y}${w}`} x={x} y={y} width={w} height={h} rx={rx} />;

const ICONS = {
  wrench: [P('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z')],
  zap: [P('M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z')],
  droplet: [P('M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z')],
  brush: [P('M9.5 14.5 19.5 4.5a1.5 1.5 0 0 1 2 2l-10 10'), P('M4 20c2.5 0 4-1.2 4-3.5a2.5 2.5 0 0 1 2.5-2.5 2.5 2.5 0 0 1 2.5 2.5c0 2.5-3 3.5-9 3.5z')],
  hammer: [P('M13 11 4.5 19.5a1.4 1.4 0 0 0 2 2L15 13'), P('M12 6l4-3 5 5-3 4z')],
  sparkles: [P('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'), P('M19 3v4M17 5h4M5 17v4M3 19h4')],
  truck: [R(2, 6, 11, 10, 1), P('M13 9h4l4 4v3h-8'), C(6.5, 18, 2), C(17.5, 18, 2)],
  leaf: [P('M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z'), P('M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12')],
  bug: [P('M12 8c3 0 4.5 2 4.5 5s-1.5 6-4.5 6-4.5-3-4.5-6S9 8 12 8z'), P('M8 12H3M16 12h5M8.5 16.5 5 19M15.5 16.5 19 19M9 5.5l1.5 2M15 5.5l-1.5 2')],
  flame: [P('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z')],
  home: [P('M3 11l9-8 9 8'), P('M5 10v10h14V10'), P('M10 20v-6h4v6')],
  camera: [P('M4 8h3l2-3h6l2 3h3v11H4z'), C(12, 13, 3.5)],
  laptop: [R(4, 5, 16, 11, 1), P('M2 19h20')],
  book: [P('M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2z'), P('M4 20a2 2 0 0 0 2 1h14')],
  scissors: [C(6, 6, 3), C(6, 18, 3), P('M8.1 8.1 20 20M14.5 9.5 20 4M8.1 15.9 12 12')],
  car: [P('M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11'), R(3, 11, 18, 6, 1), C(7, 17, 1.5), C(17, 17, 1.5)],
  sun: [C(12, 12, 4), P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  snowflake: [P('M12 2v20M4.2 7l15.6 10M4.2 17 19.8 7'), P('M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5')],
  scale: [P('M12 3v18M5 21h14M5 7h14'), P('M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z')],
  receipt: [P('M6 3h12v18l-3-2-3 2-3-2-3 2z'), P('M9 8h6M9 12h6')],
  building: [P('M6 21V4h12v17M3 21h18'), P('M10 8h4M10 12h4M10 16h4')],
  brick: [R(3, 5, 18, 14, 1), P('M3 12h18M9 5v7M15 12v7')],
  hardhat: [P('M3 17h18v2H3z'), P('M5 17a7 7 0 0 1 14 0'), P('M12 5v4')],
  toolbox: [R(3, 8, 18, 12, 2), P('M9 8V5h6v3M3 13h18')],
  shield: [P('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'), P('m9 12 2 2 4-4')],
  search: [C(11, 11, 7), P('m20 20-3.5-3.5')],
  pin: [P('M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z'), C(12, 10, 3)],
  clock: [C(12, 12, 9), P('M12 7v5l3 2')],
  star: [P('M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z')],
  check: [P('M5 12l5 5L20 7')],
  alert: [P('M12 3 2 21h20z'), P('M12 10v5M12 18v.01')],
  alertCircle: [C(12, 12, 9), P('M12 8v5M12 16v.01')],
  wallet: [P('M3 7a2 2 0 0 1 2-2h13v4'), P('M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z'), C(16.5, 14.5, 1)],
  lock: [R(5, 11, 14, 10, 2), P('M8 11V8a4 4 0 0 1 8 0v3')],
  message: [P('M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6A8 8 0 1 1 21 12z')],
  users: [C(9, 8, 3.5), P('M2.5 20a6.5 6.5 0 0 1 13 0'), P('M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7')],
  navigation: [P('M3 11l18-8-8 18-2-8z')],
  phone: [P('M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z')],
  arrowRight: [P('M5 12h14M13 6l6 6-6 6')],
  heart: [P('M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11z')],
  repeat: [P('M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3')],
  calendar: [R(3, 5, 18, 16, 2), P('M3 10h18M8 3v4M16 3v4')],
  image: [R(3, 4, 18, 16, 2), C(9, 10, 1.5), P('M21 16l-5-5-8 8')],
  menu: [P('M4 7h16M4 12h16M4 17h16')],
  x: [P('M6 6l12 12M18 6 6 18')],
  maximize: [P('M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3')],
  minimize: [P('M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3')],
  flag: [P('M5 21V4M5 4h11l-2 4 2 4H5')],
  fileCheck: [P('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'), P('M14 3v5h5M9 14l2 2 4-4')],
  badgeCheck: [P('M12 3l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9L3.2 14.8l1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z'), P('m9 12 2 2 4-4')],
  bell: [P('M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8'), P('M10 20a2 2 0 0 0 4 0')],
  list: [P('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01')],
  user: [C(12, 8, 4), P('M4 21a8 8 0 0 1 16 0')],
  key: [C(8, 15, 4), P('m11 12 9-9M16 7l3 3')],
} as const;

export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 20, stroke = 1.75, className, label }: { name: IconName; size?: number; stroke?: number; className?: string; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      {ICONS[name]}
    </svg>
  );
}

const CAT: [string, IconName][] = [
  ['plumb', 'droplet'], ['electric', 'zap'], ['clean', 'sparkles'], ['paint', 'brush'], ['carpent', 'hammer'], ['appliance', 'wrench'], ['mov', 'truck'],
  ['construct', 'hardhat'], ['mason', 'brick'], ['garden', 'leaf'], ['landscap', 'leaf'], ['pest', 'bug'], ['weld', 'flame'], ['roof', 'home'], ['cctv', 'camera'],
  ['security', 'shield'], ['solar', 'sun'], ['it-', 'laptop'], ['it', 'laptop'], ['photo', 'camera'], ['tutor', 'book'], ['beauty', 'scissors'], ['event', 'calendar'],
  ['mechanic', 'car'], ['auto', 'car'], ['legal', 'scale'], ['account', 'receipt'], ['ac', 'snowflake'], ['refrig', 'snowflake'],
];
export const catIconName = (slug: string): IconName => { const s = slug.toLowerCase(); return CAT.find(([k]) => s.includes(k))?.[1] ?? 'toolbox'; };
export function CatIcon({ slug, size = 24 }: { slug: string; size?: number }) { return <Icon name={catIconName(slug)} size={size} />; }
