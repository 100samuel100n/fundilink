/**
 * Kenya location catalogue: all 47 counties (with their headquarters coordinates), plus major towns and Nairobi estates.
 * Shared by the web app, the mobile app and the API seed so nothing is ever "left out".
 * Coordinates are town centres (approximate, ~1 km). Exact addresses are always geocoded or taken from GPS.
 * Add more places in Admin > Locations (they are stored in `service_locations`) or by extending PLACES below.
 */
export interface County { name: string; hq: string; lat: number; lng: number; region: string }
export interface Place { name: string; county: string; lat: number; lng: number; kind: 'town' | 'estate' }

export const COUNTIES: County[] = [
  { name: 'Mombasa', hq: 'Mombasa', lat: -4.0435, lng: 39.6682, region: 'Coast' },
  { name: 'Kwale', hq: 'Kwale', lat: -4.1737, lng: 39.4521, region: 'Coast' },
  { name: 'Kilifi', hq: 'Kilifi', lat: -3.6305, lng: 39.8499, region: 'Coast' },
  { name: 'Tana River', hq: 'Hola', lat: -1.5017, lng: 40.0319, region: 'Coast' },
  { name: 'Lamu', hq: 'Lamu', lat: -2.2717, lng: 40.902, region: 'Coast' },
  { name: 'Taita-Taveta', hq: 'Mwatate', lat: -3.5042, lng: 38.3775, region: 'Coast' },
  { name: 'Garissa', hq: 'Garissa', lat: -0.4532, lng: 39.6461, region: 'North Eastern' },
  { name: 'Wajir', hq: 'Wajir', lat: 1.7471, lng: 40.0573, region: 'North Eastern' },
  { name: 'Mandera', hq: 'Mandera', lat: 3.9366, lng: 41.867, region: 'North Eastern' },
  { name: 'Marsabit', hq: 'Marsabit', lat: 2.3284, lng: 37.9899, region: 'Eastern' },
  { name: 'Isiolo', hq: 'Isiolo', lat: 0.3546, lng: 37.5822, region: 'Eastern' },
  { name: 'Meru', hq: 'Meru', lat: 0.0463, lng: 37.6559, region: 'Eastern' },
  { name: 'Tharaka-Nithi', hq: 'Kathwana', lat: -0.2955, lng: 37.9805, region: 'Eastern' },
  { name: 'Embu', hq: 'Embu', lat: -0.5389, lng: 37.4596, region: 'Eastern' },
  { name: 'Kitui', hq: 'Kitui', lat: -1.3667, lng: 38.0106, region: 'Eastern' },
  { name: 'Machakos', hq: 'Machakos', lat: -1.5177, lng: 37.2634, region: 'Eastern' },
  { name: 'Makueni', hq: 'Wote', lat: -1.781, lng: 37.628, region: 'Eastern' },
  { name: 'Nyandarua', hq: 'Ol Kalou', lat: -0.2724, lng: 36.3786, region: 'Central' },
  { name: 'Nyeri', hq: 'Nyeri', lat: -0.4201, lng: 36.9476, region: 'Central' },
  { name: 'Kirinyaga', hq: 'Kerugoya', lat: -0.4989, lng: 37.2803, region: 'Central' },
  { name: "Murang'a", hq: "Murang'a", lat: -0.721, lng: 37.1526, region: 'Central' },
  { name: 'Kiambu', hq: 'Kiambu', lat: -1.1714, lng: 36.8356, region: 'Central' },
  { name: 'Turkana', hq: 'Lodwar', lat: 3.1191, lng: 35.5973, region: 'Rift Valley' },
  { name: 'West Pokot', hq: 'Kapenguria', lat: 1.2389, lng: 35.1119, region: 'Rift Valley' },
  { name: 'Samburu', hq: 'Maralal', lat: 1.0969, lng: 36.6985, region: 'Rift Valley' },
  { name: 'Trans Nzoia', hq: 'Kitale', lat: 1.0191, lng: 35.002, region: 'Rift Valley' },
  { name: 'Uasin Gishu', hq: 'Eldoret', lat: 0.5143, lng: 35.2698, region: 'Rift Valley' },
  { name: 'Elgeyo-Marakwet', hq: 'Iten', lat: 0.6703, lng: 35.5081, region: 'Rift Valley' },
  { name: 'Nandi', hq: 'Kapsabet', lat: 0.2039, lng: 35.1069, region: 'Rift Valley' },
  { name: 'Baringo', hq: 'Kabarnet', lat: 0.4919, lng: 35.743, region: 'Rift Valley' },
  { name: 'Laikipia', hq: 'Rumuruti', lat: 0.2667, lng: 36.533, region: 'Rift Valley' },
  { name: 'Nakuru', hq: 'Nakuru', lat: -0.3031, lng: 36.08, region: 'Rift Valley' },
  { name: 'Narok', hq: 'Narok', lat: -1.0833, lng: 35.8667, region: 'Rift Valley' },
  { name: 'Kajiado', hq: 'Kajiado', lat: -1.8523, lng: 36.782, region: 'Rift Valley' },
  { name: 'Kericho', hq: 'Kericho', lat: -0.3689, lng: 35.2863, region: 'Rift Valley' },
  { name: 'Bomet', hq: 'Bomet', lat: -0.7813, lng: 35.3416, region: 'Rift Valley' },
  { name: 'Kakamega', hq: 'Kakamega', lat: 0.2827, lng: 34.7519, region: 'Western' },
  { name: 'Vihiga', hq: 'Mbale', lat: 0.0833, lng: 34.7167, region: 'Western' },
  { name: 'Bungoma', hq: 'Bungoma', lat: 0.5635, lng: 34.5606, region: 'Western' },
  { name: 'Busia', hq: 'Busia', lat: 0.4608, lng: 34.1115, region: 'Western' },
  { name: 'Siaya', hq: 'Siaya', lat: 0.0607, lng: 34.2881, region: 'Nyanza' },
  { name: 'Kisumu', hq: 'Kisumu', lat: -0.0917, lng: 34.768, region: 'Nyanza' },
  { name: 'Homa Bay', hq: 'Homa Bay', lat: -0.5273, lng: 34.4571, region: 'Nyanza' },
  { name: 'Migori', hq: 'Migori', lat: -1.0634, lng: 34.4731, region: 'Nyanza' },
  { name: 'Kisii', hq: 'Kisii', lat: -0.6773, lng: 34.7796, region: 'Nyanza' },
  { name: 'Nyamira', hq: 'Nyamira', lat: -0.5633, lng: 34.9358, region: 'Nyanza' },
  { name: 'Nairobi', hq: 'Nairobi', lat: -1.2921, lng: 36.8219, region: 'Nairobi' },
];

// [name, county, lat, lng, kind?]  kind defaults to 'town'
type Row = [string, string, number, number, ('estate' | 'town')?];
const ROWS: Row[] = [
  // Nairobi: estates & neighbourhoods
  ['Kilimani', 'Nairobi', -1.2896, 36.7872, 'estate'], ['Westlands', 'Nairobi', -1.2676, 36.8108, 'estate'], ['Karen', 'Nairobi', -1.319, 36.7073, 'estate'],
  ['Lavington', 'Nairobi', -1.28, 36.769, 'estate'], ['Kileleshwa', 'Nairobi', -1.283, 36.784, 'estate'], ['Parklands', 'Nairobi', -1.263, 36.818, 'estate'],
  ['South B', 'Nairobi', -1.31, 36.833, 'estate'], ['South C', 'Nairobi', -1.32, 36.825, 'estate'], ['Embakasi', 'Nairobi', -1.32, 36.9, 'estate'],
  ['Kasarani', 'Nairobi', -1.22, 36.897, 'estate'], ['Roysambu', 'Nairobi', -1.219, 36.882, 'estate'], ["Lang'ata", 'Nairobi', -1.34, 36.75, 'estate'],
  ['Donholm', 'Nairobi', -1.295, 36.894, 'estate'], ['Eastleigh', 'Nairobi', -1.274, 36.849, 'estate'], ['Kawangware', 'Nairobi', -1.283, 36.743, 'estate'],
  ['Kangemi', 'Nairobi', -1.27, 36.745, 'estate'], ['Githurai', 'Nairobi', -1.193, 36.925, 'estate'], ['Buruburu', 'Nairobi', -1.2864, 36.8767, 'estate'],
  ['Umoja', 'Nairobi', -1.2858, 36.9, 'estate'], ['Kibera', 'Nairobi', -1.3133, 36.7889, 'estate'], ['Ngong Road', 'Nairobi', -1.3, 36.77, 'estate'],
  ['Upper Hill', 'Nairobi', -1.2985, 36.8165, 'estate'], ['Runda', 'Nairobi', -1.2108, 36.8, 'estate'], ['Muthaiga', 'Nairobi', -1.2565, 36.8344, 'estate'],
  ['Gigiri', 'Nairobi', -1.2297, 36.8056, 'estate'], ['Industrial Area', 'Nairobi', -1.3068, 36.8514, 'estate'], ['CBD', 'Nairobi', -1.2864, 36.8172, 'estate'],
  ['Utawala', 'Nairobi', -1.3, 36.97, 'estate'], ['Ruai', 'Nairobi', -1.2733, 36.9811, 'estate'], ['Dagoretti', 'Nairobi', -1.2922, 36.7467, 'estate'],
  // Kiambu / Nairobi metro
  ['Thika', 'Kiambu', -1.0332, 37.0693], ['Ruiru', 'Kiambu', -1.1461, 36.9611], ['Juja', 'Kiambu', -1.1, 37.0144], ['Kikuyu', 'Kiambu', -1.2461, 36.6631],
  ['Limuru', 'Kiambu', -1.11, 36.642], ['Ruaka', 'Kiambu', -1.206, 36.774], ['Kiambu', 'Kiambu', -1.1714, 36.8356], ['Githunguri', 'Kiambu', -1.0633, 36.7769],
  ['Gatundu', 'Kiambu', -1.0, 36.9], ['Karuri', 'Kiambu', -1.1833, 36.7333],
  ['Ongata Rongai', 'Kajiado', -1.396, 36.751], ['Kitengela', 'Kajiado', -1.475, 36.959], ['Ngong', 'Kajiado', -1.352, 36.658], ['Kiserian', 'Kajiado', -1.4167, 36.6833],
  ['Namanga', 'Kajiado', -2.545, 36.79], ['Loitokitok', 'Kajiado', -2.915, 37.524], ['Kajiado', 'Kajiado', -1.8523, 36.782], ['Isinya', 'Kajiado', -1.6833, 36.85],
  ['Syokimau', 'Machakos', -1.36, 36.936], ['Athi River', 'Machakos', -1.456, 36.978], ['Mlolongo', 'Machakos', -1.3925, 36.9356], ['Machakos', 'Machakos', -1.5177, 37.2634],
  ['Matuu', 'Machakos', -1.15, 37.55], ['Kangundo', 'Machakos', -1.3, 37.35], ['Tala', 'Machakos', -1.3333, 37.3333],
  // Central
  ['Nyeri', 'Nyeri', -0.4201, 36.9476], ['Karatina', 'Nyeri', -0.483, 37.128], ['Othaya', 'Nyeri', -0.5333, 36.9442], ['Mukurweini', 'Nyeri', -0.5667, 37.05],
  ["Murang'a", "Murang'a", -0.721, 37.1526], ['Kenol', "Murang'a", -0.8, 37.0], ['Maragua', "Murang'a", -0.7833, 37.1333],
  ['Kerugoya', 'Kirinyaga', -0.4989, 37.2803], ['Sagana', 'Kirinyaga', -0.67, 37.21], ['Wanguru', 'Kirinyaga', -0.6, 37.3],
  ['Ol Kalou', 'Nyandarua', -0.2724, 36.3786], ['Nyahururu', 'Laikipia', 0.04, 36.367], ['Engineer', 'Nyandarua', -0.5333, 36.6],
  // Rift Valley
  ['Naivasha', 'Nakuru', -0.7172, 36.431], ['Gilgil', 'Nakuru', -0.496, 36.319], ['Molo', 'Nakuru', -0.248, 35.734], ['Njoro', 'Nakuru', -0.331, 35.939],
  ['Nakuru', 'Nakuru', -0.3031, 36.08], ['Subukia', 'Nakuru', -0.0167, 36.2], ['Rongai', 'Nakuru', -0.1667, 35.9], ['Mai Mahiu', 'Nakuru', -0.9833, 36.5833],
  ['Nanyuki', 'Laikipia', 0.007, 37.0722], ['Rumuruti', 'Laikipia', 0.2667, 36.533], ['Maralal', 'Samburu', 1.0969, 36.6985],
  ['Eldoret', 'Uasin Gishu', 0.5143, 35.2698], ['Burnt Forest', 'Uasin Gishu', 0.6, 35.4], ['Moi\'s Bridge', 'Uasin Gishu', 0.8, 35.1],
  ['Iten', 'Elgeyo-Marakwet', 0.6703, 35.5081], ['Kapsowar', 'Elgeyo-Marakwet', 0.9, 35.55],
  ['Kapsabet', 'Nandi', 0.2039, 35.1069], ['Nandi Hills', 'Nandi', 0.103, 35.179], ['Mosoriot', 'Nandi', 0.2833, 35.1333],
  ['Kabarnet', 'Baringo', 0.4919, 35.743], ['Eldama Ravine', 'Baringo', 0.05, 35.717], ['Marigat', 'Baringo', 0.4667, 35.9833],
  ['Kitale', 'Trans Nzoia', 1.0191, 35.002], ['Kapenguria', 'West Pokot', 1.2389, 35.1119], ['Lodwar', 'Turkana', 3.1191, 35.5973], ['Kakuma', 'Turkana', 3.716, 34.859],
  ['Kericho', 'Kericho', -0.3689, 35.2863], ['Litein', 'Kericho', -0.57, 35.19], ['Londiani', 'Kericho', -0.1667, 35.6],
  ['Bomet', 'Bomet', -0.7813, 35.3416], ['Sotik', 'Bomet', -0.681, 35.117],
  ['Narok', 'Narok', -1.0833, 35.8667], ['Kilgoris', 'Narok', -1.0, 34.878], ['Maasai Mara (Talek)', 'Narok', -1.4, 35.1],
  // Western
  ['Kakamega', 'Kakamega', 0.2827, 34.7519], ['Mumias', 'Kakamega', 0.335, 34.489], ['Malava', 'Kakamega', 0.4333, 34.85], ['Butere', 'Kakamega', 0.2167, 34.4833],
  ['Mbale', 'Vihiga', 0.0833, 34.7167], ['Luanda', 'Vihiga', 0.0, 34.5833], ['Hamisi', 'Vihiga', 0.1, 34.8],
  ['Bungoma', 'Bungoma', 0.5635, 34.5606], ['Webuye', 'Bungoma', 0.607, 34.77], ['Kimilili', 'Bungoma', 0.786, 34.714], ['Chwele', 'Bungoma', 0.7, 34.65],
  ['Busia', 'Busia', 0.4608, 34.1115], ['Malaba', 'Busia', 0.635, 34.28], ['Port Victoria', 'Busia', 0.0988, 33.9718],
  // Nyanza
  ['Kisumu', 'Kisumu', -0.0917, 34.768], ['Ahero', 'Kisumu', -0.17, 34.92], ['Maseno', 'Kisumu', -0.0049, 34.6014], ['Muhoroni', 'Kisumu', -0.15, 35.2],
  ['Siaya', 'Siaya', 0.0607, 34.2881], ['Bondo', 'Siaya', 0.236, 34.275], ['Ugunja', 'Siaya', 0.185, 34.289], ['Usenge', 'Siaya', 0.0833, 34.0167],
  ['Homa Bay', 'Homa Bay', -0.5273, 34.4571], ['Mbita', 'Homa Bay', -0.42, 34.206], ['Oyugis', 'Homa Bay', -0.509, 34.737], ['Kendu Bay', 'Homa Bay', -0.36, 34.64],
  ['Migori', 'Migori', -1.0634, 34.4731], ['Rongo', 'Migori', -0.755, 34.604], ['Awendo', 'Migori', -0.88, 34.53], ['Isebania', 'Migori', -1.2333, 34.4833],
  ['Kisii', 'Kisii', -0.6773, 34.7796], ['Keroka', 'Kisii', -0.78, 34.95], ['Ogembo', 'Kisii', -0.8, 34.7],
  ['Nyamira', 'Nyamira', -0.5633, 34.9358], ['Nyansiongo', 'Nyamira', -0.7, 34.9],
  // Eastern
  ['Meru', 'Meru', 0.0463, 37.6559], ['Nkubu', 'Meru', -0.098, 37.656], ['Maua', 'Meru', 0.233, 37.938], ['Timau', 'Meru', 0.0833, 37.2333],
  ['Chuka', 'Tharaka-Nithi', -0.3333, 37.65], ['Kathwana', 'Tharaka-Nithi', -0.2955, 37.9805],
  ['Embu', 'Embu', -0.5389, 37.4596], ['Runyenjes', 'Embu', -0.417, 37.57], ['Siakago', 'Embu', -0.6833, 37.65],
  ['Isiolo', 'Isiolo', 0.3546, 37.5822], ['Marsabit', 'Marsabit', 2.3284, 37.9899], ['Moyale', 'Marsabit', 3.523, 39.057],
  ['Kitui', 'Kitui', -1.3667, 38.0106], ['Mwingi', 'Kitui', -0.93, 38.06], ['Mutomo', 'Kitui', -1.85, 38.2],
  ['Wote', 'Makueni', -1.781, 37.628], ['Emali', 'Makueni', -2.083, 37.467], ['Mtito Andei', 'Makueni', -2.686, 38.165], ['Kibwezi', 'Makueni', -2.409, 37.966],
  // North Eastern
  ['Garissa', 'Garissa', -0.4532, 39.6461], ['Dadaab', 'Garissa', 0.0556, 40.3125], ['Wajir', 'Wajir', 1.7471, 40.0573], ['Mandera', 'Mandera', 3.9366, 41.867],
  // Coast
  ['Nyali', 'Mombasa', -4.02, 39.715, 'estate'], ['Bamburi', 'Mombasa', -3.983, 39.723, 'estate'], ['Likoni', 'Mombasa', -4.0833, 39.65, 'estate'],
  ['Changamwe', 'Mombasa', -4.0, 39.6167, 'estate'], ['Kisauni', 'Mombasa', -3.9833, 39.7, 'estate'], ['Mtwapa', 'Kilifi', -3.95, 39.74], ['Mariakani', 'Kilifi', -3.86, 39.47],
  ['Kilifi', 'Kilifi', -3.6305, 39.8499], ['Malindi', 'Kilifi', -3.2192, 40.1169], ['Watamu', 'Kilifi', -3.355, 40.024], ['Kaloleni', 'Kilifi', -3.8167, 39.6167],
  ['Ukunda', 'Kwale', -4.29, 39.57], ['Diani', 'Kwale', -4.32, 39.578], ['Kwale', 'Kwale', -4.1737, 39.4521], ['Msambweni', 'Kwale', -4.4667, 39.4833], ['Lunga Lunga', 'Kwale', -4.55, 39.1167],
  ['Voi', 'Taita-Taveta', -3.3961, 38.556], ['Taveta', 'Taita-Taveta', -3.4, 37.677], ['Wundanyi', 'Taita-Taveta', -3.4, 38.364], ['Mwatate', 'Taita-Taveta', -3.5042, 38.3775],
  ['Hola', 'Tana River', -1.5017, 40.0319], ['Garsen', 'Tana River', -2.269, 40.116], ['Lamu', 'Lamu', -2.2717, 40.902], ['Mpeketoni', 'Lamu', -2.3667, 40.7833],
];

export const PLACES: Place[] = (() => {
  const seen = new Set<string>();
  const out: Place[] = [];
  const add = (name: string, county: string, lat: number, lng: number, kind: 'town' | 'estate') => {
    const k = `${name}|${county}`.toLowerCase();
    if (seen.has(k)) return; seen.add(k); out.push({ name, county, lat, lng, kind });
  };
  for (const r of ROWS) add(r[0], r[1], r[2], r[3], r[4] ?? 'town');
  for (const c of COUNTIES) add(c.hq, c.name, c.lat, c.lng, 'town'); // every county HQ is always present
  return out.sort((a, b) => a.name.localeCompare(b.name));
})();

export const KENYA_COUNTIES: string[] = COUNTIES.map((c) => c.name).sort((a, b) => a.localeCompare(b));
export const COUNTY_REGIONS = Array.from(new Set(COUNTIES.map((c) => c.region)));

export const slugify = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Resolve a county or town/estate by name or URL slug. Returns the county and a centre point. */
export function resolveLocation(nameOrSlug: string): { name: string; county: string; lat: number; lng: number; kind: 'county' | 'town' | 'estate' } | null {
  const s = slugify(nameOrSlug);
  const c = COUNTIES.find((x) => slugify(x.name) === s);
  if (c) return { name: c.name, county: c.name, lat: c.lat, lng: c.lng, kind: 'county' };
  const p = PLACES.find((x) => slugify(x.name) === s);
  return p ? { name: p.name, county: p.county, lat: p.lat, lng: p.lng, kind: p.kind } : null;
}

export const placesInCounty = (county: string) => PLACES.filter((p) => p.county === county);

/** Type-ahead over counties + towns + estates. */
export function searchPlaces(q: string, limit = 8): { name: string; county: string; lat: number; lng: number; kind: 'county' | 'town' | 'estate' }[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const all = [
    ...COUNTIES.map((c) => ({ name: c.name, county: c.name, lat: c.lat, lng: c.lng, kind: 'county' as const })),
    ...PLACES.map((p) => ({ ...p })),
  ];
  const seen = new Set<string>();
  const uniq = all.filter((x) => { const k = `${x.name}|${x.county}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const starts = uniq.filter((x) => x.name.toLowerCase().startsWith(s));
  const has = uniq.filter((x) => !x.name.toLowerCase().startsWith(s) && (x.name.toLowerCase().includes(s) || x.county.toLowerCase().includes(s)));
  return [...starts, ...has].slice(0, limit);
}
