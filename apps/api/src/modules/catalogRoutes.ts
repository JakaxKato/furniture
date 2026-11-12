import { Router } from 'express';
import { z } from 'zod';
import { CATEGORIES, CATEGORY_LABELS, publicConfig } from '../config/store';
import { AppError } from '../lib/errors';
import { asyncHandler } from '../middleware/async';
import { ShippingZone } from '../models';
import { getFacets, getProductBySlug, listProducts, type CatalogQuery } from './catalog';

export const catalogRouter = Router();

const optionalString = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : value),
  z.string().trim().max(120).optional(),
);
const optionalNumber = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : value),
  z.coerce.number().int().min(0).optional(),
);

const querySchema = z
  .object({
    q: optionalString,
    category: z.preprocess(
      (value) => (Array.isArray(value) ? value[0] : value || undefined),
      z.enum(CATEGORIES).optional(),
    ),
    minPrice: optionalNumber,
    maxPrice: optionalNumber,
    inStock: z.preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.enum(['true', 'false']).optional(),
    ),
    sort: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value || undefined),
        z.enum(['terbaru', 'harga_asc', 'harga_desc', 'nama']).optional(),
      ),
    page: z.preprocess(
      (value) => (Array.isArray(value) ? value[0] : value || undefined),
      z.coerce.number().int().min(1).max(10_000).optional(),
    ),
    perPage: z.preprocess(
      (value) => (Array.isArray(value) ? value[0] : value || undefined),
      z.coerce.number().int().min(1).max(48).optional(),
    ),
    size: optionalString,
    firmness: optionalString,
    thickness: optionalNumber,
    fill: optionalString,
    height: optionalNumber,
    material: optionalString,
    finish: optionalString,
    maxWidth: optionalNumber,
  })
  .strict();

function parseQuery(raw: unknown): CatalogQuery {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Parameter katalog tidak valid.', parsed.error.flatten());
  }
  const value = parsed.data;
  if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Harga minimum tidak boleh melebihi harga maksimum.');
  }
  return {
    ...value,
    inStock: value.inStock === 'true' ? true : undefined,
    sort: value.sort ?? 'terbaru',
    page: value.page ?? 1,
    perPage: value.perPage ?? 12,
  };
}

catalogRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listProducts(parseQuery(req.query)));
  }),
);

catalogRouter.get(
  '/facets',
  asyncHandler(async (req, res) => {
    const raw = Array.isArray(req.query.category) ? req.query.category[0] : req.query.category;
    const parsed = z.enum(CATEGORIES).safeParse(raw || undefined);
    if (!parsed.success && raw) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Kategori tidak valid.');
    }
    res.json(await getFacets(parsed.success ? parsed.data : undefined));
  }),
);

catalogRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json(CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })));
  }),
);

catalogRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const slug = z.string().trim().min(1).max(120).parse(req.params.slug);
    res.json(await getProductBySlug(slug));
  }),
);

export const storeRouter = Router();
storeRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const zones = await ShippingZone.find({ active: true }).sort({ name: 1 }).lean();
    res.json({
      ...publicConfig,
      areas: zones.map((zone) => ({
        name: zone.name,
        province: zone.province,
        cities: zone.cities,
        postalPrefixes: zone.postalPrefixes,
      })),
    });
  }),
);
