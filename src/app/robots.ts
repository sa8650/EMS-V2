import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.SITE_URL?.replace(/\/+$/, '');
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/owner', '/admin', '/shop', '/api/', '/login', '/setup', '/forgot-password', '/verify/'] }],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
