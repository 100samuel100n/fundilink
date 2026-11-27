'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from './ui';

/** MapLibre needs WebGL and `window`, so both maps load in the browser only. */
export const MapLazy = dynamic(() => import('./Map'), { ssr: false, loading: () => <Skeleton h={420} /> });
export const TrackMapLazy = dynamic(() => import('./TrackMap'), { ssr: false, loading: () => <div className="trk-map trk-boot" aria-hidden="true" /> });
export type { MapMarker } from './Map';
export type { CamMode, Pad, TrackMapProps } from './TrackMap';