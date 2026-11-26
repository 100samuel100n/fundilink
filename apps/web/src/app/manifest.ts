import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FundiLink', short_name: 'FundiLink', description: 'Hire trusted professionals across Kenya.', start_url: '/', display: 'standalone',
    background_color: '#142A3B', theme_color: '#142A3B', lang: 'en-KE',
    icons: [{ src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  };
}