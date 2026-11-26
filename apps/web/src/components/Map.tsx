'use client';
import React, { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLng } from '@fundilink/sdk';

export interface MapMarker { id: string; lat: number; lng: number; label: string; href?: string; kind?: 'pro' | 'dest' | 'live' }
const BRAND = '#0FA192';

const pin = (kind: MapMarker['kind'] = 'pro', stale = false) => L.divIcon({
  className: '',
  html: `<div style="width:${kind === 'live' ? 22 : 18}px;height:${kind === 'live' ? 22 : 18}px;border-radius:50%;background:${kind === 'dest' ? '#142A3B' : stale ? '#94A3B8' : BRAND};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)${kind === 'live' ? `;outline:6px solid ${stale ? 'rgba(148,163,184,.3)' : 'rgba(22,140,131,.25)'}` : ''}"></div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});

/**
 * Stable camera: fit everything once, then only pan when the live marker drifts near the edge of the view.
 * The map never recentres on every GPS tick, so it does not jump around while the customer is looking at it.
 */
function Fit({ points, follow, fitKey }: { points: LatLng[]; follow?: LatLng | null; fitKey?: string | number }) {
  const map = useMap();
  const fitted = React.useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (fitted.current !== fitKey) {
      fitted.current = fitKey;
      if (points.length > 1) map.fitBounds(points.map((p) => [p.lat, p.lng] as [number, number]), { padding: [48, 48], maxZoom: 16 });
      else if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    if (follow && !map.getBounds().pad(-0.2).contains([follow.lat, follow.lng])) map.panTo([follow.lat, follow.lng], { animate: true, duration: 0.8 });
  }, [map, follow?.lat, follow?.lng, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MapView({ center, markers = [], route, trail, live, className = 'mapbox', stale = false, fitKey }: {
  center: LatLng; markers?: MapMarker[]; route?: LatLng[]; trail?: LatLng[]; live?: LatLng | null; className?: string; stale?: boolean; fitKey?: string | number;
}) {
  const pts = [...markers, ...(live ? [{ ...live }] : []), ...(route ?? [])].map((m) => ({ lat: m.lat, lng: m.lng }));
  const line = (a?: LatLng[]) => (a ?? []).map((p) => [p.lat, p.lng] as [number, number]);
  return (
    <div className={className} role="region" aria-label="Map">
      <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {route && route.length > 1 ? (
          <>
            <Polyline positions={line(route)} pathOptions={{ color: '#B5DCD8', weight: 11, opacity: 0.9 }} />
            <Polyline positions={line(route)} pathOptions={{ color: BRAND, weight: 6, opacity: 1 }} />
          </>
        ) : null}
        {trail && trail.length > 1 ? <Polyline positions={line(trail)} pathOptions={{ color: '#142A3B', weight: 3, dashArray: '2 8' }} /> : null}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={pin(m.kind)}>
            <Popup>{m.href ? <a href={m.href}>{m.label}</a> : m.label}</Popup>
          </Marker>
        ))}
        {live ? <Marker position={[live.lat, live.lng]} icon={pin('live', stale)} zIndexOffset={1000} /> : null}
        <Fit points={pts} follow={live} fitKey={fitKey ?? markers.length} />
      </MapContainer>
    </div>
  );
}
