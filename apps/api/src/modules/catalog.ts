import type { FilterQuery, PipelineStage, Types } from 'mongoose';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../config/store';
import { AppError } from '../lib/errors';
import { Inventory, Product, type ProductDoc } from '../models';
import { availableOf } from './inventory';

export type CatalogQuery = {
  q?: string;
  category?: Category;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort: 'terbaru' | 'harga_asc' | 'harga_desc' | 'nama';
  page: number;
  perPage: number;
  size?: string;
  firmness?: string;
  thickness?: number;
  fill?: string;
  height?: number;
  material?: string;
  finish?: string;
  maxWidth?: number;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type ListItem = {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  category: Category;
  summary: string;
  images: Array<{ url: string; alt: string }>;
  minPrice: number;
  maxPrice: number;
  availableTotal: number;
  matchedVariantCount: number;
};

function availabilityExpression(): unknown {
  return {
    $max: [
      0,
      {
        $subtract: [
          { $ifNull: [{ $first: '$inventory.physical' }, 0] },
          {
            $add: [
              { $ifNull: [{ $first: '$inventory.held' }, 0] },
              { $ifNull: [{ $first: '$inventory.allocated' }, 0] },
            ],
          },
        ],
      },
    ],
  };
}

export async function listProducts(query: CatalogQuery): Promise<{
  items: Array<{
    id: string;
    slug: string;
    name: string;
    category: Category;
    categoryLabel: string;
    summary: string;
    images: Array<{ url: string; alt: string }>;
    minPrice: number;
    maxPrice: number;
    inStock: boolean;
    matchedVariantCount: number;
  }>;
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  priceRange: { min: number; max: number } | null;
}> {
  const productMatch: FilterQuery<ProductDoc> = { status: 'published' };
  if (query.category) productMatch.category = query.category;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    productMatch.$or = [{ name: pattern }, { summary: pattern }, { description: pattern }];
  }

  const variantMatch: Record<string, string | number> = {};
  if (query.size) variantMatch['variants.attributes.size'] = query.size;
  if (query.firmness) variantMatch['variants.attributes.firmness'] = query.firmness;
  if (query.thickness !== undefined) variantMatch['variants.attributes.thicknessCm'] = query.thickness;
  if (query.fill) variantMatch['variants.attributes.fill'] = query.fill;
  if (query.height !== undefined) variantMatch['variants.attributes.heightCm'] = query.height;
  if (query.material) variantMatch['variants.attributes.material'] = query.material;
  if (query.finish) variantMatch['variants.attributes.finish'] = query.finish;
  if (query.maxWidth !== undefined) {
    variantMatch['variants.attributes.widthCm'] = { $lte: query.maxWidth } as unknown as number;
  }

  const pipeline: PipelineStage[] = [
    { $match: productMatch },
    { $unwind: '$variants' },
  ];
  if (Object.keys(variantMatch).length > 0) pipeline.push({ $match: variantMatch });
  pipeline.push(
    {
      $lookup: {
        from: Inventory.collection.name,
        localField: 'variants.sku',
        foreignField: 'sku',
        as: 'inventory',
      },
    },
    { $set: { available: availabilityExpression() as number } },
  );
  if (query.inStock) pipeline.push({ $match: { available: { $gt: 0 } } });
  pipeline.push(
    { $set: { matchedPrice: '$variants.price' } },
    {
      $group: {
        _id: '$_id',
        slug: { $first: '$slug' },
        name: { $first: '$name' },
        category: { $first: '$category' },
        summary: { $first: '$summary' },
        images: { $first: '$images' },
        publishedAt: { $first: '$publishedAt' },
        minPrice: { $min: '$matchedPrice' },
        maxPrice: { $max: '$matchedPrice' },
        availableTotal: { $sum: '$available' },
        matchedVariantCount: { $sum: 1 },
      },
    },
  );
  if (query.minPrice !== undefined) pipeline.push({ $match: { maxPrice: { $gte: query.minPrice } } });
  if (query.maxPrice !== undefined) pipeline.push({ $match: { minPrice: { $lte: query.maxPrice } } });

  const sortStage: Record<string, 1 | -1> =
    query.sort === 'harga_asc'
      ? { minPrice: 1, name: 1 }
      : query.sort === 'harga_desc'
        ? { minPrice: -1, name: 1 }
        : query.sort === 'nama'
          ? { name: 1 }
          : { publishedAt: -1, _id: -1 };

  const facet: PipelineStage = {
    $facet: {
      items: [{ $sort: sortStage }, { $skip: (query.page - 1) * query.perPage }, { $limit: query.perPage }],
      total: [{ $count: 'count' }],
      priceRange: [{ $group: { _id: null, min: { $min: '$minPrice' }, max: { $max: '$maxPrice' } } }],
    },
  };
  pipeline.push(facet);

  const result = await Product.aggregate<{
    items: ListItem[];
    total: Array<{ count: number }>;
    priceRange: Array<{ min: number; max: number }>;
  }>(pipeline);

  const row = result[0] ?? { items: [], total: [], priceRange: [] };
  const total = row.total[0]?.count ?? 0;
  return {
    items: row.items.map((item) => ({
      id: String(item._id),
      slug: item.slug,
      name: item.name,
      category: item.category,
      categoryLabel: CATEGORY_LABELS[item.category],
      summary: item.summary,
      images: item.images,
      minPrice: item.minPrice,
      maxPrice: item.maxPrice,
      inStock: item.availableTotal > 0,
      matchedVariantCount: item.matchedVariantCount,
    })),
    total,
    page: query.page,
    perPage: query.perPage,
    totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    priceRange: row.priceRange[0] ? { min: row.priceRange[0].min, max: row.priceRange[0].max } : null,
  };
}

export async function getFacets(category?: Category) {
  const match: FilterQuery<ProductDoc> = { status: 'published' };
  if (category) match.category = category;
  const products = await Product.find(match).select('category variants').lean();
  const facets: Record<string, { size: Set<string>; firmness: Set<string>; thickness: Set<number>; fill: Set<string>; height: Set<number>; material: Set<string>; finish: Set<string>; width: Set<number> }> = {};
  for (const cat of CATEGORIES) {
    facets[cat] = {
      size: new Set(),
      firmness: new Set(),
      thickness: new Set(),
      fill: new Set(),
      height: new Set(),
      material: new Set(),
      finish: new Set(),
      width: new Set(),
    };
  }
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = 0;
  for (const product of products) {
    const bucket = facets[product.category];
    if (!bucket) continue;
    for (const variant of product.variants) {
      const attributes = variant.attributes ?? {};
      if (attributes.size) bucket.size.add(attributes.size);
      if (attributes.firmness) bucket.firmness.add(attributes.firmness);
      if (typeof attributes.thicknessCm === 'number') bucket.thickness.add(attributes.thicknessCm);
      if (attributes.fill) bucket.fill.add(attributes.fill);
      if (typeof attributes.heightCm === 'number') bucket.height.add(attributes.heightCm);
      if (attributes.material) bucket.material.add(attributes.material);
      if (attributes.finish) bucket.finish.add(attributes.finish);
      if (typeof attributes.widthCm === 'number') bucket.width.add(attributes.widthCm);
      minPrice = Math.min(minPrice, variant.price);
      maxPrice = Math.max(maxPrice, variant.price);
    }
  }
  const serialise = (bucket: (typeof facets)[string]) => ({
    size: [...bucket.size].sort(),
    firmness: [...bucket.firmness].sort(),
    thickness: [...bucket.thickness].sort((a, b) => a - b),
    fill: [...bucket.fill].sort(),
    height: [...bucket.height].sort((a, b) => a - b),
    material: [...bucket.material].sort(),
    finish: [...bucket.finish].sort(),
    width: [...bucket.width].sort((a, b) => a - b),
  });
  return {
    categories: CATEGORIES.map((cat) => ({ value: cat, label: CATEGORY_LABELS[cat] })),
    filters: Object.fromEntries(CATEGORIES.map((cat) => [cat, serialise(facets[cat]!)])),
    priceRange: Number.isFinite(minPrice) ? { min: minPrice, max: maxPrice } : null,
  };
}

export async function getProductBySlug(slug: string) {
  const product = await Product.findOne({ slug, status: 'published' });
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk tidak ditemukan.');
  const inventories = await Inventory.find({ sku: { $in: product.variants.map((variant) => variant.sku) } });
  const stockBySku = new Map(inventories.map((inventory) => [inventory.sku, availableOf(inventory)]));
  const variants = product.variants.map((variant) => ({
    id: String(variant._id),
    sku: variant.sku,
    label: variant.label,
    price: variant.price,
    shippingClass: variant.shippingClass,
    attributes: variant.attributes ?? {},
    images: variant.images.length > 0 ? variant.images : product.images,
    available: stockBySku.get(variant.sku) ?? 0,
    inStock: (stockBySku.get(variant.sku) ?? 0) > 0,
  }));
  return {
    id: String(product._id),
    slug: product.slug,
    name: product.name,
    category: product.category,
    categoryLabel: CATEGORY_LABELS[product.category],
    summary: product.summary,
    description: product.description,
    care: product.care ?? null,
    images: product.images,
    variants,
    minPrice: variants.length > 0 ? Math.min(...variants.map((variant) => variant.price)) : 0,
    maxPrice: variants.length > 0 ? Math.max(...variants.map((variant) => variant.price)) : 0,
    inStock: variants.some((variant) => variant.inStock),
  };
}
