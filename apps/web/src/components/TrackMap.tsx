'use client';
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { KENYA_CENTER, type LatLng } from '@fundilink/sdk';
import {
  bearingDeg, clamp, destinationEl, ensure3dBuildings, lerp, lerpAngle, ll, metres, nearestIndex, palette, prefersReducedMotion,
  resolveStyle, setBubble, setLine, useMapTheme, widthByZoom,
} from './mapKit';
import { vehicleSvg, type Vehicle } from './vehicles';

export type CamMode = 'follow' | 'overview' | 'free';
export interface Pad { top: number; bottom: number; left: number; right: number }
export interface TrackMapProps {
  route?: LatLng[]; trail?: LatLng[]; live?: LatLng | null; heading?: number | null; speedKmh?: number | null;
  dest?: LatLng | null; destLabel: string; destBubble?: string | null;
  vehicle: Vehicle; stale: boolean; arrived: boolean; near: boolean;
  mode: CamMode; onModeChange(m: CamMode): void; pad: Pad; recenterKey: number; className?: string;
}

const FLOW = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];

/**
 * The live journey map: a vector, tilted, rotating navigation view.
 * - The vehicle glides between GPS fixes (interpolated every frame) and turns to its real heading.
 * - In `follow` mode the camera rides behind the vehicle like a navigation app; any touch hands control back to the person.
 * - The route is split at the vehicle: what is behind it fades, what is ahead flows toward the destination.
 */
export default function TrackMap(props: TrackMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const P = useRef(props); P.current = props;
  const theme = useMapTheme(); const themeRef = useRef(theme); themeRef.current = theme;
  const S = useRef({
    map: null as maplibregl.Map | null, car: null as maplibregl.Marker | null, carEl: null as HTMLElement | null, dest: null as maplibregl.Marker | null, destEl: null as HTMLElement | null,
    cur: null as LatLng | null, from: null as LatLng | null, to: null as LatLng | null, t0: 0, dur: 1500, lastFix: 0,
    h: 0, targetH: 0, camH: 0, idx: 0, easingUntil: 0, lastLine: 0, lastFlow: 0, flowStep: 0, vehicle: '' as string, tint: false, firstFit: false,
  });

  /* ---------- layers: (re)built on every style load so theme switches keep the route ---------- */
  const draw = () => {
    const s = S.current; const map = s.map; const p = P.current; if (!map || !map.isStyleLoaded()) return;
    const c = palette(themeRef.current); const route = p.route ?? [];
    const here = s.cur ?? p.live ?? null;
    if (route.length > 1) s.idx = nearestIndex(route, here ?? route[0], Math.min(s.idx, route.length - 1));
    const ahead = route.slice(s.idx + (here ? 1 : 0)).map(ll); if (here) ahead.unshift(ll(here));
    const behind = route.slice(0, s.idx + 1).map(ll); if (here && behind.length) behind.push(ll(here));
    const w = widthByZoom(4, 9, 18); const wc = widthByZoom(7, 14, 26);
    setLine(map, 'fl-case', ahead, { 'line-color': c.casing, 'line-width': wc, 'line-opacity': 0.95 });
    setLine(map, 'fl-done', behind, { 'line-color': c.done, 'line-width': w, 'line-opacity': 0.55 });
    setLine(map, 'fl-route', ahead, { 'line-color': c.route, 'line-width': w });
    setLine(map, 'fl-flow', ahead, { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 0.6, 'line-dasharray': [0, 4, 3] });
    setLine(map, 'fl-trail', (p.trail ?? []).map(ll), { 'line-color': c.trail, 'line-width': 2.5, 'line-opacity': 0.5, 'line-dasharray': [0.5, 2.5] });
    ensure3dBuildings(map, themeRef.current);
  };

  /* ---------- camera ---------- */
  const fit = (animate = true) => {
    const s = S.current; const map = s.map; const p = P.current; if (!map) return;
    const pts = [...(p.route ?? []), ...(s.cur ? [s.cur] : []), ...(p.dest ? [p.dest] : [])];
    if (!pts.length) return;
    const b = new maplibregl.LngLatBounds(); pts.forEach((x) => b.extend(ll(x)));
    s.easingUntil = performance.now() + (animate ? 1100 : 0);
    map.fitBounds(b, { padding: p.pad, maxZoom: 17, pitch: 0, bearing: 0, duration: animate && !prefersReducedMotion() ? 1000 : 0 });
  };
  const follow = () => {
    const s = S.current; const map = s.map; const p = P.current; if (!map || !s.cur) return;
    s.easingUntil = performance.now() + 1000;
    s.camH = s.h;
    map.easeTo({ center: ll(s.cur), bearing: s.camH, pitch: 60, zoom: p.near ? 17.4 : 16.4, duration: prefersReducedMotion() ? 0 : 950, essential: true });
  };

  /* ---------- init once ---------- */
  useEffect(() => {
    const s = S.current; const p0 = P.current; if (!host.current) return;
    const first = p0.live ?? p0.dest ?? KENYA_CENTER;
    const style = resolveStyle(themeRef.current); s.tint = style.tint;
    const map = new maplibregl.Map({ container: host.current, style: style.url, center: ll(first), zoom: 14, pitch: 0, maxPitch: 75, attributionControl: false, fadeDuration: 120 });
    s.map = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.touchZoomRotate.enableRotation();
    host.current.classList.toggle('tint', style.tint);

    const user = (e: { originalEvent?: unknown }) => { if (e.originalEvent && P.current.mode !== 'free') P.current.onModeChange('free'); };
    map.on('dragstart', user); map.on('rotatestart', user); map.on('pitchstart', user); map.on('zoomstart', user);
    map.on('style.load', () => { draw(); });
    map.on('load', () => { draw(); if (P.current.mode === 'overview') fit(false); });

    // destination
    s.destEl = destinationEl(p0.destLabel);
    if (p0.dest) s.dest = new maplibregl.Marker({ element: s.destEl, anchor: 'bottom' }).setLngLat(ll(p0.dest)).addTo(map);

    // vehicle
    const root = document.createElement('div'); root.className = 'vm';
    root.innerHTML = '<span class="vm-ring"></span><span class="vm-ring b"></span><span class="vm-cone"></span><div class="vm-body"></div>';
    s.carEl = root;
    s.car = new maplibregl.Marker({ element: root, rotationAlignment: 'map', pitchAlignment: 'map' });

    // render loop
    let raf = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const p = P.current; const m = s.map; if (!m) return;
      if (s.to && s.from) {
        const k = clamp((t - s.t0) / s.dur, 0, 1);
        const ease = k; // linear: GPS fixes are already evenly spaced, easing would make the vehicle stutter
        s.cur = { lat: lerp(s.from.lat, s.to.lat, ease), lng: lerp(s.from.lng, s.to.lng, ease) };
        s.h = lerpAngle(s.h, s.targetH, 0.14);
        s.camH = lerpAngle(s.camH, s.targetH, 0.045);
        s.car?.setLngLat(ll(s.cur)); s.car?.setRotation(s.h);
        if (p.mode === 'follow' && t > s.easingUntil) m.jumpTo({ center: ll(s.cur), bearing: s.camH });
        if (t - s.lastLine > 110 && k < 1.02) { s.lastLine = t; draw(); }
      }
      // flowing dashes along the road ahead
      if (t - s.lastFlow > 90 && !prefersReducedMotion() && m.getLayer('fl-flow') && !document.hidden) {
        s.lastFlow = t; s.flowStep = (s.flowStep + 1) % FLOW.length;
        try { m.setPaintProperty('fl-flow', 'line-dasharray', FLOW[s.flowStep]); } catch { /* style swapping */ }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => { cancelAnimationFrame(raf); s.car?.remove(); s.dest?.remove(); map.remove(); s.map = null; s.car = null; s.dest = null; s.cur = null; s.from = null; s.to = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- theme switch: swap the basemap, keep everything else ---------- */
  useEffect(() => {
    const s = S.current; if (!s.map) return;
    const style = resolveStyle(theme); s.tint = style.tint; host.current?.classList.toggle('tint', style.tint);
    s.map.setStyle(style.url);
  }, [theme]);

  /* ---------- vehicle artwork ---------- */
  useEffect(() => {
    const s = S.current; if (!s.carEl || s.vehicle === props.vehicle) return;
    s.vehicle = props.vehicle; (s.carEl.querySelector('.vm-body') as HTMLElement).innerHTML = vehicleSvg(props.vehicle, props.vehicle === 'walk' ? 52 : 68);
  }, [props.vehicle]);
  useEffect(() => { S.current.carEl?.classList.toggle('stale', props.stale); S.current.carEl?.classList.toggle('still', (props.speedKmh ?? 1) < 2); }, [props.stale, props.speedKmh]);

  /* ---------- destination marker ---------- */
  useEffect(() => {
    const s = S.current; if (!s.map || !s.destEl) return;
    (s.destEl.querySelector('.fm-tag') as HTMLElement).textContent = props.destLabel;
    setBubble(s.destEl, props.arrived ? 'Arrived' : props.destBubble ?? null);
    s.destEl.classList.toggle('arrived', props.arrived);
    if (props.dest) { if (!s.dest) s.dest = new maplibregl.Marker({ element: s.destEl, anchor: 'bottom' }).setLngLat(ll(props.dest)).addTo(s.map); else s.dest.setLngLat(ll(props.dest)); }
  }, [props.dest?.lat, props.dest?.lng, props.destLabel, props.destBubble, props.arrived]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- a new GPS fix: glide to it, turn to face it ---------- */
  useEffect(() => {
    const s = S.current; const map = s.map; const p = props; if (!map || !p.live) return;
    const next = p.live; const now = performance.now();
    if (!s.car!.getElement().isConnected) s.car!.setLngLat(ll(next)).addTo(map);
    const prev = s.to;
    // heading: trust the device when it is moving, otherwise derive it from the path, otherwise keep the last one
    if (p.heading != null && (p.speedKmh ?? 5) > 3) s.targetH = p.heading;
    else if (prev && metres(prev, next) > 4) s.targetH = bearingDeg(prev, next);
    else if (!prev && p.route && p.route.length > 1) s.targetH = bearingDeg(p.route[0], p.route[Math.min(3, p.route.length - 1)]);
    const jump = prev ? metres(prev, next) : 0;
    if (!s.cur || jump > 800 || prefersReducedMotion()) {
      s.cur = next; s.from = next; s.to = next; s.t0 = now; s.h = s.targetH; s.camH = s.targetH; s.car!.setLngLat(ll(next)); s.car!.setRotation(s.h);
      if (P.current.mode === 'follow') follow();
    } else {
      s.from = s.cur; s.to = next; s.t0 = now; s.dur = clamp(s.lastFix ? (now - s.lastFix) * 1.05 : 1500, 800, 3500);
    }
    s.lastFix = now; draw();
  }, [props.live?.lat, props.live?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw(); }, [props.route, props.trail]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- camera mode, padding, recenter ---------- */
  useEffect(() => { S.current.map?.setPadding(props.pad); }, [props.pad.top, props.pad.bottom, props.pad.left, props.pad.right]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = S.current; if (!s.map) return;
    if (props.mode === 'follow') { if (s.cur) follow(); else fit(); }
    else if (props.mode === 'overview') fit();
  }, [props.mode, props.recenterKey, props.near]); // eslint-disable-line react-hooks/exhaustive-deps
  // the very first time we know the route / destination, frame the whole trip
  useEffect(() => {
    const s = S.current; if (s.firstFit || !s.map) return;
    if ((props.route?.length ?? 0) > 1 || props.dest) { s.firstFit = true; if (props.mode !== 'follow') fit(false); }
  }, [props.route, props.dest?.lat]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className={props.className ?? 'trk-map'} role="region" aria-label="Live map" />;
}