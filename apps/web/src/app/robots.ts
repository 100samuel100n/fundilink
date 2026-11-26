import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/api';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*', allow: '/',
      // Trailing slashes matter: "/professional" would also block every "/professionals/<slug>" page.
      disallow: ['/app/', '/professional/', '/admin/', '/enterprise/', '/auth/', '/login', '/register', '/*?*sort=', '/*?*lat=', '/*?*county='],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}