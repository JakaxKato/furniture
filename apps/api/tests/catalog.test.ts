import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AnalyticsEvent } from '../src/models';
import { Client, createProduct, resetDb, teardownDb, testGateway } from './helpers';

afterAll(teardownDb);
const app = createApp({ gateway: testGateway });

beforeEach(async () => {
  await resetDb();
  testGateway.transactions.clear();
  testGateway.createCalls.length = 0;
});

describe('katalog publik', () => {
  it('menyembunyikan draft/arsip dan memfilter atribut pada satu varian yang sama', async () => {
    await createProduct({
      sku: 'KSR-160',
      name: 'Kasur Uji Serat',
      category: 'kasur',
      stock: 2,
      variants: [
        {
          sku: 'KSR-160',
          price: 2_500_000,
          stock: 2,
          attributes: { size: '160 × 200 cm', firmness: 'Sedang', thicknessCm: 20 },
          label: '160 × 200 cm',
        },
        {
          sku: 'KSR-180',
          price: 3_000_000,
          stock: 1,
          attributes: { size: '180 × 200 cm', firmness: 'Keras', thicknessCm: 25 },
          label: '180 × 200 cm',
        },
      ],
    });
    await createProduct({
      sku: 'BTL-10',
      name: 'Bantal Uji',
      category: 'bantal',
      shippingClass: 'bantal',
      stock: 3,
      attributes: { fill: 'Serat poliester', heightCm: 10, size: '50 × 70 cm' },
    });
    await createProduct({ sku: 'DRF-1', name: 'Draf Uji', status: 'draft' });
    await createProduct({ sku: 'ARS-1', name: 'Arsip Uji', status: 'archived' });

    const all = await new Client(app).get('/api/v1/products');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    expect(all.body.items.map((item: { name: string }) => item.name)).not.toContain('Draf Uji');

    const filtered = await new Client(app).get(
      '/api/v1/products?category=kasur&size=180%20%C3%97%20200%20cm&firmness=Keras&thickness=25',
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].minPrice).toBe(3_000_000);
    expect(filtered.body.items[0].matchedVariantCount).toBe(1);

    const contradictory = await new Client(app).get(
      '/api/v1/products?size=160%20%C3%97%20200%20cm&firmness=Keras',
    );
    expect(contradictory.body.total).toBe(0);
  });

  it('mendukung pencarian, harga, stok, dan facet kategori', async () => {
    const product = await createProduct({
      sku: 'FUR-SOFA',
      name: 'Sofa Linen Uji',
      category: 'furnitur',
      shippingClass: 'furnitur',
      stock: 0,
      attributes: { material: 'Linen', finish: 'Krem alami', widthCm: 160, depthCm: 85, heightCm: 78 },
    });
    const other = await createProduct({
      sku: 'BTL-LATEKS',
      name: 'Bantal Lateks Uji',
      category: 'bantal',
      shippingClass: 'bantal',
      stock: 4,
      attributes: { fill: 'Lateks alami', heightCm: 11 },
    });
    const search = await new Client(app).get('/api/v1/products?q=sofa');
    expect(search.body.total).toBe(1);
    expect(search.body.items[0].inStock).toBe(false);
    expect(search.body.items[0].slug).toBe(product.slug);

    const inStock = await new Client(app).get('/api/v1/products?inStock=true');
    expect(inStock.body.total).toBe(1);
    expect(inStock.body.items[0].slug).toBe(other.slug);

    const price = await new Client(app).get('/api/v1/products?minPrice=200000');
    expect(price.body.total).toBe(0);

    const facets = await new Client(app).get('/api/v1/products/facets');
    expect(facets.status).toBe(200);
    expect(facets.body.filters.furnitur.material).toContain('Linen');
    expect(facets.body.filters.bantal.fill).toContain('Lateks alami');
    expect(facets.body.priceRange.min).toBeGreaterThan(0);
  });

  it('menampilkan detail varian, stok, dan mengembalikan 404 untuk draf', async () => {
    const product = await createProduct({
      sku: 'DETAIL-1',
      name: 'Detail Uji',
      stock: 2,
      variants: [
        { sku: 'DETAIL-1', price: 100_000, stock: 2, label: 'Standar' },
        { sku: 'DETAIL-2', price: 150_000, stock: 0, label: 'Besar' },
      ],
    });
    const detail = await new Client(app).get(`/api/v1/products/${product.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.variants).toHaveLength(2);
    expect(detail.body.variants.find((v: { sku: string }) => v.sku === 'DETAIL-2').inStock).toBe(false);
    expect(detail.body.minPrice).toBe(100_000);
    expect(detail.body.maxPrice).toBe(150_000);

    const draft = await createProduct({ sku: 'DRAFT-ONLY', status: 'draft' });
    const missing = await new Client(app).get(`/api/v1/products/${draft.slug}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('memvalidasi query secara ketat', async () => {
    const response = await new Client(app).get('/api/v1/products?perPage=1000');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const unknown = await new Client(app).get('/api/v1/products?evil=1');
    expect(unknown.status).toBe(400);
  });

  it('mencatat event funnel tanpa data pribadi dan memvalidasi field', async () => {
    const product = await createProduct({ sku: 'EVENT-1' });
    const client = new Client(app);
    await client.init();
    const response = await client.post('/api/v1/analytics/events', {
      type: 'view_product',
      productId: product.id,
    });
    expect(response.status).toBe(204);
    const events = await AnalyticsEvent.find({ type: 'view_product' });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0]!.metadata ?? {})).not.toContain('@');
    const invalid = await client.post('/api/v1/analytics/events', {
      type: 'view_product',
      email: 'pribadi@example.com',
    });
    expect(invalid.status).toBe(400);
  });

  it('menyajikan sitemap produk terbit dan robots', async () => {
    await createProduct({ sku: 'SEO-1', slug: 'produk-seo' });
    const sitemap = await new Client(app).get('/sitemap.xml');
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers['content-type']).toContain('xml');
    expect(sitemap.text).toContain('/produk/produk-seo');
    expect(sitemap.text).toContain('/katalog');
    const robots = await new Client(app).get('/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.text).toContain('Disallow: /admin');
    expect(robots.text).toContain('Sitemap:');
    expect(robots.text).toContain('/sitemap.xml');
  });
});
