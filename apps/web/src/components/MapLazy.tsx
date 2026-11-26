'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from './ui';

/** Leaflet touches `window`, so it is loaded in the browser only. */
export const MapLazy = dynamic(() => import('./Map'), { ssr: false, loading: () => <Skeleton h={420} /> });
export type { MapMarker } from './Map';
