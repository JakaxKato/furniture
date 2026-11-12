import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { storeConfig } from '../config/store';
import { Product } from '../models';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function xmlEscape(value: string): string {
  return escapeHtml(value);
}

export async function sitemapHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const products = await Product.find({ status: 'published' }).select('slug updatedAt').lean();
    const base = env.SITE_URL.replace(/\/$/, '');
    const urls = [
      { loc: `${base}/`, lastmod: undefined },
      { loc: `${base}/katalog`, lastmod: undefined },
      { loc: `${base}/bantuan`, lastmod: undefined },
      ...products.map((product) => ({
        loc: `${base}/produk/${product.slug}`,
        lastmod: product.updatedAt?.toISOString(),
      })),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(
        (entry) =>
          `  <url><loc>${xmlEscape(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`,
      )
      .join('\n')}\n</urlset>`;
    res.type('application/xml').send(body);
  } catch (error) {
    next(error);
  }
}

export function robotsHandler(_req: Request, res: Response): void {
  const base = env.SITE_URL.replace(/\/$/, '');
  res
    .type('text/plain')
    .send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /akun\nDisallow: /keranjang\nDisallow: /checkout\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`);
}

export async function productPageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const webDist = resolve(__dirname, '../../../web/dist');
    const indexFile = resolve(webDist, 'index.html');
    let template: string;
    try {
      template = readFileSync(indexFile, 'utf8');
    } catch {
      next();
      return;
    }
    const product = await Product.findOne({ slug: String(req.params.slug), status: 'published' });
    if (!product) {
      next();
      return;
    }
    const title = `${product.name} — ${storeConfig.brand.name}`;
    const description = product.summary;
    const canonical = `${env.SITE_URL.replace(/\/$/, '')}/produk/${product.slug}`;
    const image = product.images[0];
    const imageUrl = image?.url.startsWith('http') ? image.url : `${env.SITE_URL.replace(/\/$/, '')}${image?.url ?? ''}`;
    let html = template
      .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
        `<meta name="description" content="${escapeHtml(description)}" />`,
      );
    html = html.replace(
      '</head>',
      [
        `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
        `<meta property="og:type" content="product" />`,
        `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
        image ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : '',
        image ? `<meta property="og:image:alt" content="${escapeHtml(image.alt)}" />` : '',
        '</head>',
      ].join('\n'),
    );
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
}
