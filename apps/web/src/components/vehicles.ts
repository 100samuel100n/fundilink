/**
 * Top-down vehicle artwork for the live map and the trip sheet. Every glyph faces UP (north) so the map can rotate it to the
 * real heading. Static, trusted strings: safe to inject with dangerouslySetInnerHTML.
 */
export type Vehicle = 'bike' | 'car' | 'van' | 'walk';
export const VEHICLES: { id: Vehicle; label: string }[] = [
  { id: 'bike', label: 'Bike' }, { id: 'car', label: 'Car' }, { id: 'van', label: 'Van' }, { id: 'walk', label: 'On foot' },
];

const DEFS = `<defs>
<linearGradient id="vb" x1="0" x2="1"><stop offset="0" stop-color="#0FA192"/><stop offset="1" stop-color="#075E55"/></linearGradient>
<linearGradient id="vg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#16324A"/><stop offset="1" stop-color="#0B1F33"/></linearGradient>
<filter id="vs" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="2.6" flood-color="#000" flood-opacity=".38"/></filter>
</defs>`;

const car = `<g filter="url(#vs)">
<rect x="9" y="5" width="30" height="70" rx="13" fill="url(#vb)"/>
<rect x="6.5" y="19" width="5" height="12" rx="2.5" fill="#0B1F33"/><rect x="36.5" y="19" width="5" height="12" rx="2.5" fill="#0B1F33"/>
<rect x="6.5" y="50" width="5" height="12" rx="2.5" fill="#0B1F33"/><rect x="36.5" y="50" width="5" height="12" rx="2.5" fill="#0B1F33"/>
<path d="M14 23c0-4 4-7 10-7s10 3 10 7l-2 8H16z" fill="url(#vg)"/>
<rect x="14.5" y="33" width="19" height="19" rx="4" fill="#fff" opacity=".22"/>
<path d="M16 55h16l2 7c0 3-4 5-10 5s-10-2-10-5z" fill="url(#vg)"/>
<rect x="13" y="7.5" width="6" height="3" rx="1.5" fill="#FFE9A8"/><rect x="29" y="7.5" width="6" height="3" rx="1.5" fill="#FFE9A8"/>
<rect x="13" y="69.5" width="6" height="2.6" rx="1.3" fill="#FF5A5A"/><rect x="29" y="69.5" width="6" height="2.6" rx="1.3" fill="#FF5A5A"/>
</g>`;

const van = `<g filter="url(#vs)">
<rect x="9" y="3" width="30" height="76" rx="9" fill="#F4F7FA"/>
<rect x="9" y="3" width="30" height="22" rx="9" fill="url(#vb)"/>
<rect x="6.5" y="14" width="5" height="12" rx="2.5" fill="#0B1F33"/><rect x="36.5" y="14" width="5" height="12" rx="2.5" fill="#0B1F33"/>
<rect x="6.5" y="56" width="5" height="13" rx="2.5" fill="#0B1F33"/><rect x="36.5" y="56" width="5" height="13" rx="2.5" fill="#0B1F33"/>
<path d="M14 12c0-3 4-5 10-5s10 2 10 5l-1.5 8h-17z" fill="url(#vg)"/>
<rect x="13" y="29" width="22" height="46" rx="4" fill="#fff"/><rect x="13" y="29" width="22" height="46" rx="4" fill="none" stroke="#CBD5E1"/>
<rect x="19" y="45" width="10" height="10" rx="3" fill="#0FA192"/>
<rect x="12.5" y="4.5" width="6" height="2.8" rx="1.4" fill="#FFE9A8"/><rect x="29.5" y="4.5" width="6" height="2.8" rx="1.4" fill="#FFE9A8"/>
<rect x="12.5" y="75.2" width="6" height="2.6" rx="1.3" fill="#FF5A5A"/><rect x="29.5" y="75.2" width="6" height="2.6" rx="1.3" fill="#FF5A5A"/>
</g>`;

const bike = `<g filter="url(#vs)">
<rect x="21.5" y="4" width="5" height="19" rx="2.5" fill="#0B1F33"/>
<rect x="21.5" y="56" width="5" height="20" rx="2.5" fill="#0B1F33"/>
<rect x="21" y="22" width="6" height="40" rx="3" fill="#5C7088"/>
<rect x="9" y="24" width="30" height="3.4" rx="1.7" fill="#0B1F33"/>
<circle cx="9.5" cy="25.7" r="2.6" fill="#0B1F33"/><circle cx="38.5" cy="25.7" r="2.6" fill="#0B1F33"/>
<ellipse cx="24" cy="40" rx="12" ry="7.5" fill="url(#vb)"/>
<rect x="17.5" y="45" width="13" height="11" rx="5.5" fill="#0B1F33" opacity=".85"/>
<circle cx="24" cy="38" r="6.2" fill="#fff"/><circle cx="24" cy="38" r="6.2" fill="none" stroke="#0B1F33" stroke-width="1.6"/>
<rect x="20.5" y="31" width="7" height="3.2" rx="1.6" fill="#FFE9A8"/>
<rect x="21.4" y="69" width="5.2" height="2.6" rx="1.3" fill="#FF5A5A"/>
</g>`;

const walk = `<g filter="url(#vs)">
<ellipse cx="24" cy="44" rx="15" ry="8.5" fill="url(#vb)"/>
<circle cx="24" cy="42" r="7" fill="#F1C9A5"/><path d="M17.5 41c1-6 12-6 13 0z" fill="#0B1F33"/>
<ellipse cx="11" cy="46" rx="3.2" ry="4.4" fill="#0FA192"/><ellipse cx="37" cy="46" rx="3.2" ry="4.4" fill="#0FA192"/>
<path d="M24 21l6 9h-12z" fill="#0FA192" opacity=".9"/>
</g>`;

const BODY: Record<Vehicle, { svg: string; w: number; h: number }> = {
  car: { svg: car, w: 48, h: 80 }, van: { svg: van, w: 48, h: 82 }, bike: { svg: bike, w: 48, h: 80 }, walk: { svg: walk, w: 48, h: 64 },
};

export const vehicleSvg = (v: Vehicle, height = 64): string => {
  const b = BODY[v] ?? BODY.car;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.w} ${b.h}" width="${Math.round((height * b.w) / b.h)}" height="${height}" aria-hidden="true">${DEFS}${b.svg}</svg>`;
};

/** Heavier trades arrive in a van, couriers on a bike; used only as a default when the API does not say. */
export function guessVehicle(hint?: string | null): Vehicle {
  const s = (hint ?? '').toLowerCase();
  if (/(bike|motor|boda|courier|delivery)/.test(s)) return 'bike';
  if (/(walk|foot)/.test(s)) return 'walk';
  if (/(van|truck|pickup|move|plumb|electric|build|mason|weld|carpent|garden|paint)/.test(s)) return 'van';
  return 'car';
}