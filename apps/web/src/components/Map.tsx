'use client';
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLng } from '@fundilink/sdk';
import { ensure3dBuildings, liveDotEl, ll, palette, proPinEl, resolveStyle, setLine, useMapTheme, widthByZoom } from './mapKit';

export interface MapMarker { id: string; lat: number; lng: number; label: string; href?: string; kind?: 'pro' | 'dest' | 'live' }

/**
 * General-purpose vector map (explore results, profile service area). Same props as the old Leaflet map.
 * The live journey screen uses TrackMap instead.
 */
export default function MapView({ center, markers = [], route, trail, live, className = 'mapbox', stale = false, fitKey }: {
  center: LatLng; markers?: MapMarker[]; route?: LatLng[]; trail?: LatLng[]; live?: LatLng | null; className?: string; stale?: boolean; fitKey?: string | number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pins = useRef<maplibregl.Marker[]>([]);
  const liveM = useRef<maplibregl.Marker | null>(null);
  const fitted = useRef<string | number | undefined>(undefined);
  const theme = useMapTheme(); const themeRef = useRef(theme); themeRef.current = theme;
  const latest = useRef({ route, trail }); latest.current = { route, trail };

  const lines = () => {
    const m = map.current; if (!m || !m.isStyleLoaded()) return;
    const c = palette(themeRef.current); const w = widthByZoom(3, 6, 12);
    setLine(m, 'm-case', (latest.current.route ?? []).map(ll), { 'line-color': c.casing, 'line-width': widthByZoom(6, 11, 20) });
    setLine(m, 'm-route', (latest.current.route ?? []).map(ll), { 'line-color': c.route, 'line-width': w });
    setLine(m, 'm-trail', (latest.current.trail ?? []).map(ll), { 'line-color': c.trail, 'line-width': 2.5, 'line-dasharray': [0.5, 2.5], 'line-opacity': 0.6 });
    ensure3dBuildings(m, themeRef.current);
  };

  useEffect(() => {
    if (!host.current) return;
    const st = resolveStyle(themeRef.current);
    const m = new maplibregl.Map({ container: host.current, style: st.url, center: ll(center), zoom: 12, attributionControl: false, cooperativeGestures: false });
    host.current.classList.toggle('tint', st.tint);
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    m.on('style.load', lines); map.current = m;
    return () => { pins.current.forEach((x) => x.remove()); liveM.current?.remove(); m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const m = map.current; if (!m) return; const st = resolveStyle(theme); host.current?.classList.toggle('tint', st.tint); m.setStyle(st.url); }, [theme]);

  // markers
  useEffect(() => {
    const m = map.current; if (!m) return;
    pins.current.forEach((x) => x.remove());
    pins.current = markers.map((k) => {
      const mk = new maplibregl.Marker({ element: proPinEl(k.kind), anchor: 'center' }).setLngLat([k.lng, k.lat]);
      const box = document.createElement('div');
      if (k.href) { const a = document.createElement('a'); a.href = k.href; a.textContent = k.label; box.appendChild(a); } else box.textContent = k.label;
      mk.setPopup(new maplibregl.Popup({ offset: 16, closeButton: false, className: 'fm-popup' }).setDOMContent(box));
      return mk.addTo(m);
    });
  }, [markers]);

  // live dot
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!live) { liveM.current?.remove(); liveM.current = null; return; }
    if (!liveM.current) liveM.current = new maplibregl.Marker({ element: liveDotEl(stale) }).setLngLat(ll(live)).addTo(m);
    else { liveM.current.setLngLat(ll(live)); liveM.current.getElement().classList.toggle('stale', stale); }
  }, [live?.lat, live?.lng, stale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { lines(); }, [route, trail]); // eslint-disable-line react-hooks/exhaustive-deps

  // frame everything once per fitKey, then only pan if the live dot drifts toward the edge
  useEffect(() => {
    const m = map.current; if (!m) return;
    const pts = [...markers, ...(live ? [live] : []), ...(route ?? [])];
    const key = fitKey ?? markers.length;
    if (fitted.current !== key) {
      fitted.current = key;
      if (pts.length > 1) { const b = new maplibregl.LngLatBounds(); pts.forEach((p) => b.extend([p.lng, p.lat])); m.fitBounds(b, { padding: 56, maxZoom: 16, duration: 700 }); }
      else if (pts.length === 1) m.easeTo({ center: [pts[0].lng, pts[0].lat], zoom: 14, duration: 700 });
      return;
    }
    if (live && !m.getBounds().contains([live.lng, live.lat])) m.easeTo({ center: [live.lng, live.lat], duration: 800 });
  }, [markers, live?.lat, live?.lng, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className={className} role="region" aria-label="Map"><div ref={host} style={{ width: '100%', height: '100%' }} /></div>;
}