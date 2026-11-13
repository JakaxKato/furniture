import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { CATEGORIES, SHIPPING_CLASSES, SHIPPING_CLASS_LABELS } from '../config/store';
import { AppError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rateLimit';
import { asyncHandler } from '../middleware/async';
import { requireAuth, requirePermission } from '../middleware/auth';
import {
  Inventory,
  InventoryEntry,
  Order,
  PaymentAttempt,
  PaymentCase,
  Product,
  ShippingZone,
  User,
} from '../models';
import { writeAudit } from '../modules/audit';
import { adjustPhysical, availableOf, shipAllocation } from '../modules/inventory';
import { refreshAttempt } from '../modules/payments';
import { toAdminOrder } from '../modules/orderDto';
import { recordOrderTransition } from '../modules/analytics';
import { reportRange } from './experience';

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use((req, _res, next) => {
  if (req.method !== 'GET') {
    enforceRateLimit({
      prefix: 'admin-mutation',
      identifier: String(req.auth?.user._id ?? req.ip),
      limit: 120,
      windowSeconds: 60,
    })
      .then(() => next())
      .catch(next);
    return;
  }
  next();
});

const attributeSchema = z
  .object({
    size: z.string().trim().max(60).optional(),
    firmness: z.string().trim().max(60).optional(),
    thicknessCm: z.number().min(0).max(200).optional(),
    fill: z.string().trim().max(80).optional(),
    heightCm: z.number().min(0).max(500).optional(),
    material: z.string().trim().max(80).optional(),
    finish: z.string().trim().max(80).optional(),
    widthCm: z.number().min(0).max(1000).optional(),
    depthCm: z.number().min(0).max(1000).optional(),
  })
  .strict();

const imageSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(500)
      .refine(
        (value) =>
          value.startsWith('https://') || (value.startsWith('/') && !value.startsWith('//')),
        'URL gambar harus relatif atau HTTPS.',
      ),
    alt: z.string().trim().min(3).max(200),
  })
  .strict();

const variantInputSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,64}$/, 'SKU hanya huruf, angka, dan strip.'),
    label: z.string().trim().min(1).max(120),
    price: z.number().int().min(0).max(2_000_000_000),
    shippingClass: z.enum(SHIPPING_CLASSES),
    attributes: attributeSchema.optional(),
    images: z.array(imageSchema).max(6).optional(),
    physicalStock: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

const productCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug tidak valid.'),
    category: z.enum(CATEGORIES),
    summary: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(4000),
    care: z.string().trim().max(1000).optional(),
    images: z.array(imageSchema).min(1).max(8),
    variants: z.array(variantInputSchema).min(1).max(30),
    publish: z.boolean().optional(),
  })
  .strict();

const productPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    summary: z.string().trim().min(1).max(240).optional(),
    description: z.string().trim().min(1).max(4000).optional(),
    care: z.string().trim().max(1000).optional(),
    images: z.array(imageSchema).min(1).max(8).optional(),
  })
  .strict();

const variantPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    price: z.number().int().min(0).max(2_000_000_000).optional(),
    shippingClass: z.enum(SHIPPING_CLASSES).optional(),
    attributes: attributeSchema.optional(),
    images: z.array(imageSchema).max(6).optional(),
  })
  .strict();

const productIdSchema = z.string().regex(/^[a-f0-9]{24}$/);

function guardPublish(product: {
  images: Array<{ alt?: string }>;
  description?: string;
  summary?: string;
  variants: unknown[];
}): void {
  if (!product.images || product.images.length === 0 || product.images.some((image) => !image.alt)) {
    throw new AppError(422, 'PRODUCT_INCOMPLETE', 'Foto dan alt text wajib diisi sebelum publikasi.');
  }
  if (!product.description?.trim() || !product.summary?.trim()) {
    throw new AppError(422, 'PRODUCT_INCOMPLETE', 'Ringkasan dan deskripsi wajib diisi sebelum publikasi.');
  }
  if (!product.variants || product.variants.length === 0) {
    throw new AppError(422, 'PRODUCT_INCOMPLETE', 'Minimal satu varian valid diperlukan.');
  }
}

adminRouter.get(
  '/summary',
  requirePermission('orders:read'),
  asyncHandler(async (_req, res) => {
    const { start, end } = reportRange();
    const [paid, ready, openCases, lowStock, pendingPayments] = await Promise.all([
      Order.countDocuments({ paymentStatus: 'paid', paidAt: { $gte: start, $lt: end } }),
      Order.countDocuments({ shippingStatus: 'ready', 'shippingHold.active': { $ne: true } }),
      PaymentCase.countDocuments({ status: { $ne: 'resolved' } }),
      Inventory.countDocuments({
        $expr: { $lte: [{ $subtract: ['$physical', { $add: ['$held', '$allocated'] }] }, { $ifNull: ['$reorderPoint', 2] }] },
      }),
      Order.countDocuments({ paymentStatus: { $in: ['pending', 'verifying', 'review'] } }),
    ]);
    res.json({ paid, ready, openCases, lowStock, pendingPayments });
  }),
);

adminRouter.get(
  '/products',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        q: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.string().trim().max(120).optional(),
        ),
        status: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.enum(['draft', 'published', 'archived']).optional(),
        ),
        page: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.coerce.number().int().min(1).optional(),
        ),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Parameter tidak valid.');
    const { q, status, page = 1 } = parsed.data;
    const filter: mongoose.FilterQuery<typeof Product> = {};
    if (status) filter.status = status;
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: new RegExp(escaped, 'i') }, { slug: new RegExp(escaped, 'i') }];
    }
    const perPage = 20;
    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Product.countDocuments(filter),
    ]);
    const inventories = await Inventory.find({ sku: { $in: items.flatMap((item) => item.variants.map((v) => v.sku)) } });
    const stock = new Map(inventories.map((inventory) => [inventory.sku, inventory]));
    res.json({
      items: items.map((item) => ({
        id: String(item._id),
        name: item.name,
        slug: item.slug,
        category: item.category,
        status: item.status,
        images: item.images,
        updatedAt: item.updatedAt,
        variants: item.variants.map((variant) => {
          const inv = stock.get(variant.sku);
          return {
            sku: variant.sku,
            label: variant.label,
            price: variant.price,
            physical: inv?.physical ?? 0,
            held: inv?.held ?? 0,
            allocated: inv?.allocated ?? 0,
            available: inv ? availableOf(inv) : 0,
          };
        }),
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  }),
);

adminRouter.get(
  '/products/:id',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const id = productIdSchema.parse(req.params.id);
    const product = await Product.findById(id);
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk tidak ditemukan.');
    const inventories = await Inventory.find({ productId: product._id });
    res.json({
      product: {
        id: String(product._id),
        name: product.name,
        slug: product.slug,
        category: product.category,
        summary: product.summary,
        description: product.description,
        care: product.care ?? '',
        images: product.images,
        status: product.status,
        variants: product.variants.map((variant) => ({
          id: String(variant._id),
          sku: variant.sku,
          label: variant.label,
          price: variant.price,
          shippingClass: variant.shippingClass,
          attributes: variant.attributes ?? {},
          images: variant.images,
          inventory: (() => {
            const inv = inventories.find((item) => item.sku === variant.sku);
            return inv
              ? {
                  physical: inv.physical,
                  held: inv.held,
                  allocated: inv.allocated,
                  available: availableOf(inv),
                }
              : null;
          })(),
        })),
      },
    });
  }),
);

adminRouter.post(
  '/products',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const body = productCreateSchema.parse(req.body);
    const skus = body.variants.map((variant) => variant.sku);
    if (new Set(skus).size !== skus.length) {
      throw new AppError(400, 'DUPLICATE_SKU', 'SKU di dalam produk harus unik.');
    }
    const existingSku = await Product.findOne({ 'variants.sku': { $in: skus } });
    if (existingSku) throw new AppError(409, 'SKU_TAKEN', 'Salah satu SKU sudah dipakai produk lain.');
    if (body.publish) guardPublish({ ...body, variants: body.variants });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [product] = await Product.create(
          [
            {
              name: body.name,
              slug: body.slug,
              category: body.category,
              summary: body.summary,
              description: body.description,
              care: body.care,
              images: body.images,
              variants: body.variants.map((variant) => ({
                sku: variant.sku,
                label: variant.label,
                price: variant.price,
                shippingClass: variant.shippingClass,
                attributes: variant.attributes ?? {},
                images: variant.images ?? [],
              })),
              status: body.publish ? 'published' : 'draft',
              publishedAt: body.publish ? new Date() : undefined,
            },
          ],
          { session },
        );
        if (!product) throw new AppError(500, 'PRODUCT_FAILED', 'Produk gagal dibuat.');
        await Inventory.create(
          product.variants.map((variant, index) => ({
            sku: variant.sku,
            productId: product._id,
            variantId: variant._id,
            physical: body.variants[index]?.physicalStock ?? 0,
            held: 0,
            allocated: 0,
          })),
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    const created = await Product.findOne({ slug: body.slug });
    if (!created) throw new AppError(500, 'PRODUCT_FAILED', 'Produk gagal dibuat.');
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'product.create',
      targetType: 'product',
      targetId: String(created._id),
      correlationId: req.requestId,
      summary: `Membuat produk ${created.name}.`,
      changes: { status: created.status, variants: skus.length },
    });
    res.status(201).json({ productId: String(created._id) });
  }),
);

async function productForAdmin(id: string) {
  const productId = productIdSchema.parse(id);
  const product = await Product.findById(productId);
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk tidak ditemukan.');
  return product;
}

adminRouter.patch(
  '/products/:id',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const product = await productForAdmin(req.params.id ?? '');
    const body = productPatchSchema.parse(req.body);
    if (product.status === 'published' && body.images) {
      guardPublish({ ...product.toObject(), images: body.images });
    }
    Object.assign(product, body);
    if (product.status === 'published') guardPublish(product);
    await product.save();
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'product.update',
      targetType: 'product',
      targetId: String(product._id),
      correlationId: req.requestId,
      summary: `Memperbarui produk ${product.name}.`,
      changes: { fields: Object.keys(body) },
    });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/products/:id/publish',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const product = await productForAdmin(req.params.id ?? '');
    guardPublish(product);
    const inventories = await Inventory.find({ productId: product._id });
    if (inventories.length !== product.variants.length) {
      throw new AppError(422, 'PRODUCT_INCOMPLETE', 'Inventaris setiap varian belum lengkap.');
    }
    product.status = 'published';
    product.publishedAt = product.publishedAt ?? new Date();
    await product.save();
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'product.publish',
      targetType: 'product',
      targetId: String(product._id),
      correlationId: req.requestId,
      summary: `Menerbitkan produk ${product.name}.`,
    });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/products/:id/archive',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const product = await productForAdmin(req.params.id ?? '');
    product.status = 'archived';
    await product.save();
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'product.archive',
      targetType: 'product',
      targetId: String(product._id),
      correlationId: req.requestId,
      summary: `Mengarsipkan produk ${product.name}.`,
    });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/products/:id/variants',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const product = await productForAdmin(req.params.id ?? '');
    const body = variantInputSchema.parse(req.body);
    if (product.variants.some((variant) => variant.sku === body.sku)) {
      throw new AppError(409, 'SKU_TAKEN', 'SKU sudah ada pada produk ini.');
    }
    const other = await Product.findOne({ 'variants.sku': body.sku });
    if (other) throw new AppError(409, 'SKU_TAKEN', 'SKU sudah dipakai produk lain.');
    product.variants.push({
      sku: body.sku,
      label: body.label,
      price: body.price,
      shippingClass: body.shippingClass,
      attributes: body.attributes ?? {},
      images: body.images ?? [],
    } as never);
    await product.save();
    const variant = product.variants[product.variants.length - 1]!;
    await Inventory.create({
      sku: body.sku,
      productId: product._id,
      variantId: variant._id,
      physical: body.physicalStock ?? 0,
      held: 0,
      allocated: 0,
    });
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'variant.create',
      targetType: 'variant',
      targetId: body.sku,
      correlationId: req.requestId,
      summary: `Menambah varian ${body.sku} pada ${product.name}.`,
      changes: { price: body.price, physicalStock: body.physicalStock ?? 0 },
    });
    res.status(201).json({ ok: true });
  }),
);

adminRouter.patch(
  '/products/:id/variants/:sku',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const product = await productForAdmin(req.params.id ?? '');
    const sku = z.string().trim().toUpperCase().min(3).max(64).parse(req.params.sku);
    const body = variantPatchSchema.parse(req.body);
    const variant = product.variants.find((item) => item.sku === sku);
    if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Varian tidak ditemukan.');
    const before = { price: variant.price, label: variant.label, shippingClass: variant.shippingClass };
    if (body.label !== undefined) variant.label = body.label;
    if (body.price !== undefined) variant.price = body.price;
    if (body.shippingClass !== undefined) variant.shippingClass = body.shippingClass;
    if (body.attributes !== undefined) variant.attributes = body.attributes as never;
    if (body.images !== undefined) variant.images = body.images as never;
    await product.save();
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'variant.update',
      targetType: 'variant',
      targetId: sku,
      correlationId: req.requestId,
      summary: `Memperbarui varian ${sku}.`,
      changes: {
        before,
        after: { price: variant.price, label: variant.label, shippingClass: variant.shippingClass },
      },
    });
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/products/:id/variants/:sku',
  requirePermission('catalog:manage'),
  asyncHandler(async (req, res) => {
    const product = await productForAdmin(req.params.id ?? '');
    const sku = z.string().trim().toUpperCase().min(3).max(64).parse(req.params.sku);
    if (product.variants.length <= 1) {
      throw new AppError(409, 'LAST_VARIANT', 'Produk harus memiliki minimal satu varian.');
    }
    const inventory = await Inventory.findOne({ sku });
    if (inventory && (inventory.held > 0 || inventory.allocated > 0)) {
      throw new AppError(409, 'VARIANT_COMMITTED', 'Varian masih memiliki stok ditahan atau dialokasikan.');
    }
    product.variants = product.variants.filter((variant) => variant.sku !== sku) as never;
    await product.save();
    await Inventory.deleteOne({ sku });
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'variant.delete',
      targetType: 'variant',
      targetId: sku,
      correlationId: req.requestId,
      summary: `Menghapus varian ${sku} dari ${product.name}.`,
    });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/inventory',
  requirePermission('inventory:manage'),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        q: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.string().trim().max(120).optional(),
        ),
        page: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.coerce.number().int().min(1).optional(),
        ),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Parameter tidak valid.');
    const page = parsed.data.page ?? 1;
    const perPage = 30;
    const filter: mongoose.FilterQuery<typeof Inventory> = {};
    if (parsed.data.q) {
      const escaped = parsed.data.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.sku = new RegExp(escaped, 'i');
    }
    const [inventories, total] = await Promise.all([
      Inventory.find(filter)
        .sort({ sku: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Inventory.countDocuments(filter),
    ]);
    const products = await Product.find({ _id: { $in: inventories.map((item) => item.productId) } });
    const productById = new Map(products.map((product) => [String(product._id), product]));
    res.json({
      items: inventories.map((inventory) => {
        const product = productById.get(String(inventory.productId));
        const variant = product?.variants.find((item) => item.sku === inventory.sku);
        return {
          sku: inventory.sku,
          productName: product?.name ?? null,
          productSlug: product?.slug ?? null,
          variantLabel: variant?.label ?? null,
          physical: inventory.physical,
          held: inventory.held,
          allocated: inventory.allocated,
          available: availableOf(inventory),
          updatedAt: inventory.updatedAt,
        };
      }),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  }),
);

adminRouter.post(
  '/inventory/:sku/adjust',
  requirePermission('inventory:manage'),
  asyncHandler(async (req, res) => {
    const sku = z.string().trim().toUpperCase().min(3).max(64).parse(req.params.sku);
    const body = z
      .object({
        physical: z.number().int().min(0).max(1_000_000),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(req.body);
    const result = await adjustPhysical(
      sku,
      body.physical,
      body.reason,
      String(req.auth!.user._id),
      req.requestId,
    );
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'inventory.adjust',
      targetType: 'sku',
      targetId: sku,
      correlationId: req.requestId,
      summary: `Menyesuaikan stok fisik ${sku} dari ${result.before} menjadi ${result.after}.`,
      changes: { reason: body.reason, before: result.before, after: result.after },
    });
    res.json(result);
  }),
);

adminRouter.get(
  '/inventory/:sku/entries',
  requirePermission('inventory:manage'),
  asyncHandler(async (req, res) => {
    const sku = z.string().trim().toUpperCase().min(3).max(64).parse(req.params.sku);
    const entries = await InventoryEntry.find({ sku }).sort({ at: -1 }).limit(50);
    res.json({
      items: entries.map((entry) => ({
        type: entry.type,
        quantity: entry.quantity,
        physicalDelta: entry.physicalDelta,
        heldDelta: entry.heldDelta,
        allocatedDelta: entry.allocatedDelta,
        reason: entry.reason ?? null,
        at: entry.at,
      })),
    });
  }),
);

const shippingRateSchema = z
  .object({
    shippingClass: z.enum(SHIPPING_CLASSES),
    price: z.number().int().min(0).max(100_000_000),
    etaMinDays: z.number().int().min(0).max(60).optional(),
    etaMaxDays: z.number().int().min(0).max(60).optional(),
    etaConfirmed: z.boolean().optional(),
  })
  .strict();

adminRouter.get(
  '/shipping-zones',
  requirePermission('shipping:manage'),
  asyncHandler(async (_req, res) => {
    const zones = await ShippingZone.find().sort({ code: 1 });
    res.json({
      items: zones.map((zone) => ({
        id: String(zone._id),
        code: zone.code,
        name: zone.name,
        province: zone.province,
        cities: zone.cities,
        postalPrefixes: zone.postalPrefixes,
        rates: zone.rates.map((rate) => ({
          shippingClass: rate.shippingClass,
          label: SHIPPING_CLASS_LABELS[rate.shippingClass],
          price: rate.price,
          etaMinDays: rate.etaMinDays ?? null,
          etaMaxDays: rate.etaMaxDays ?? null,
          etaConfirmed: rate.etaConfirmed,
        })),
        version: zone.version,
        active: zone.active,
        updatedAt: zone.updatedAt,
      })),
    });
  }),
);

adminRouter.post(
  '/shipping-zones',
  requirePermission('shipping:manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9-]{2,20}$/, 'Kode zona tidak valid.'),
        name: z.string().trim().min(2).max(120),
        province: z.string().trim().min(2).max(120),
        cities: z.array(z.string().trim().min(2).max(120)).min(1).max(50),
        postalPrefixes: z
          .array(z.string().trim().regex(/^\d{2,5}$/))
          .min(1)
          .max(20),
        rates: z.array(shippingRateSchema).max(10).optional(),
        active: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    const existing = await ShippingZone.findOne({ code: body.code });
    if (existing) throw new AppError(409, 'ZONE_EXISTS', 'Kode zona sudah digunakan.');
    const rates = body.rates ?? [];
    const classes = rates.map((rate) => rate.shippingClass);
    if (new Set(classes).size !== classes.length) {
      throw new AppError(400, 'DUPLICATE_RATE', 'Kelas kirim tidak boleh duplikat dalam satu zona.');
    }
    for (const rate of rates) {
      if (rate.etaConfirmed && (rate.etaMinDays === undefined || rate.etaMaxDays === undefined)) {
        throw new AppError(400, 'ETA_INCOMPLETE', 'Estimasi harus diisi bila ditandai terkonfirmasi.');
      }
      if (rate.etaMinDays !== undefined && rate.etaMaxDays !== undefined && rate.etaMinDays > rate.etaMaxDays) {
        throw new AppError(400, 'ETA_INVALID', 'Estimasi minimum tidak boleh melebihi maksimum.');
      }
    }
    const zone = await ShippingZone.create({
      code: body.code,
      name: body.name,
      province: body.province,
      cities: body.cities,
      postalPrefixes: body.postalPrefixes,
      rates,
      version: 1,
      active: body.active ?? false,
      updatedBy: req.auth!.user._id,
    });
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'shipping.create',
      targetType: 'zone',
      targetId: zone.code,
      correlationId: req.requestId,
      summary: `Membuat zona ${zone.name}.`,
      changes: { active: zone.active, rates: rates.length },
    });
    res.status(201).json({ id: String(zone._id), version: zone.version });
  }),
);

adminRouter.patch(
  '/shipping-zones/:id',
  requirePermission('shipping:manage'),
  asyncHandler(async (req, res) => {
    const id = productIdSchema.parse(req.params.id);
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        province: z.string().trim().min(2).max(120).optional(),
        cities: z.array(z.string().trim().min(2).max(120)).min(1).max(50).optional(),
        postalPrefixes: z
          .array(z.string().trim().regex(/^\d{2,5}$/))
          .min(1)
          .max(20)
          .optional(),
        rates: z.array(shippingRateSchema).max(10).optional(),
        active: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    const zone = await ShippingZone.findById(id);
    if (!zone) throw new AppError(404, 'ZONE_NOT_FOUND', 'Zona tidak ditemukan.');
    const before = {
      version: zone.version,
      rates: zone.rates.map((rate) => ({ class: rate.shippingClass, price: rate.price })),
      active: zone.active,
    };
    if (body.rates) {
      const classes = body.rates.map((rate) => rate.shippingClass);
      if (new Set(classes).size !== classes.length) {
        throw new AppError(400, 'DUPLICATE_RATE', 'Kelas kirim tidak boleh duplikat dalam satu zona.');
      }
      for (const rate of body.rates) {
        if (rate.etaConfirmed && (rate.etaMinDays === undefined || rate.etaMaxDays === undefined)) {
          throw new AppError(400, 'ETA_INCOMPLETE', 'Estimasi harus diisi bila ditandai terkonfirmasi.');
        }
        if (rate.etaMinDays !== undefined && rate.etaMaxDays !== undefined && rate.etaMinDays > rate.etaMaxDays) {
          throw new AppError(400, 'ETA_INVALID', 'Estimasi minimum tidak boleh melebihi maksimum.');
        }
      }
      zone.rates = body.rates as never;
    }
    if (body.name !== undefined) zone.name = body.name;
    if (body.province !== undefined) zone.province = body.province;
    if (body.cities !== undefined) zone.cities = body.cities;
    if (body.postalPrefixes !== undefined) zone.postalPrefixes = body.postalPrefixes;
    if (body.active !== undefined) zone.active = body.active;
    zone.version += 1;
    zone.updatedBy = req.auth!.user._id;
    await zone.save();
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'shipping.update',
      targetType: 'zone',
      targetId: zone.code,
      correlationId: req.requestId,
      summary: `Memperbarui zona ${zone.name} ke versi ${zone.version}.`,
      changes: { before, after: { version: zone.version, active: zone.active } },
    });
    res.json({ ok: true, version: zone.version });
  }),
);

adminRouter.get(
  '/orders',
  requirePermission('orders:read'),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        q: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.string().trim().min(3).max(120).optional(),
        ),
        paymentStatus: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.string().max(40).optional(),
        ),
        shippingStatus: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.string().max(40).optional(),
        ),
        page: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.coerce.number().int().min(1).optional(),
        ),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Parameter tidak valid.');
    const page = parsed.data.page ?? 1;
    const perPage = 20;
    const filter: mongoose.FilterQuery<typeof Order> = {};
    if (parsed.data.paymentStatus) filter.paymentStatus = parsed.data.paymentStatus;
    if (parsed.data.shippingStatus) filter.shippingStatus = parsed.data.shippingStatus;
    if (parsed.data.q) {
      const escaped = parsed.data.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { orderNumber: new RegExp(escaped, 'i') },
        { email: new RegExp(escaped, 'i') },
        { 'address.recipient': new RegExp(escaped, 'i') },
      ];
    }
    const [items, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Order.countDocuments(filter),
    ]);
    res.json({
      items: items.map(toAdminOrder),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  }),
);

adminRouter.get(
  '/orders/:orderNumber',
  requirePermission('orders:read'),
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    const [attempts, cases] = await Promise.all([
      PaymentAttempt.find({ orderId: order._id }).sort({ createdAt: -1 }),
      PaymentCase.find({ orderId: order._id }).sort({ createdAt: -1 }),
    ]);
    res.json({
      order: {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        email: order.email,
        address: order.address,
        items: order.items,
        shipping: order.shipping,
        totals: order.totals,
        paymentStatus: order.paymentStatus,
        shippingStatus: order.shippingStatus,
        shippingHold: order.shippingHold,
        reservation: {
          status: order.reservation.status,
          expiresAt: order.reservation.expiresAt,
          releasedAt: order.reservation.releasedAt ?? null,
          allocatedAt: order.reservation.allocatedAt ?? null,
        },
        tracking: order.tracking,
        statusHistory: order.statusHistory,
        paidAt: order.paidAt ?? null,
      },
      attempts: attempts.map((attempt) => ({
        id: String(attempt._id),
        gatewayOrderId: attempt.gatewayOrderId,
        status: attempt.status,
        open: attempt.open,
        amount: attempt.amount,
        gatewayStatus: attempt.gatewayStatus ?? null,
        transactionId: attempt.gatewayTransactionId ?? null,
        fraudStatus: attempt.fraudStatus ?? null,
        paymentType: attempt.paymentType ?? null,
        sessionExpiresAt: attempt.sessionExpiresAt,
        methodWindowEndsAt: attempt.methodWindowEndsAt,
        lastCheckedAt: attempt.lastCheckedAt ?? null,
        createdAt: attempt.createdAt,
      })),
      cases: cases.map((item) => ({
        id: String(item._id),
        caseNumber: item.caseNumber,
        type: item.type,
        status: item.status,
        reason: item.reason,
        createdAt: item.createdAt,
      })),
    });
  }),
);

adminRouter.post(
  '/orders/:orderNumber/reconcile',
  requirePermission('orders:read'),
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    const attempt = await PaymentAttempt.findOne({ orderId: order._id, open: true }).sort({ createdAt: -1 });
    if (!attempt) throw new AppError(409, 'NO_OPEN_ATTEMPT', 'Tidak ada percobaan pembayaran aktif.');
    const outcome = await refreshAttempt(attempt, 'admin');
    const fresh = await Order.findById(order._id);
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'payment.reconcile',
      targetType: 'order',
      targetId: order.orderNumber,
      correlationId: req.requestId,
      summary: `Memeriksa ulang pembayaran; hasil ${outcome}.`,
    });
    res.json({ outcome, paymentStatus: fresh?.paymentStatus ?? null });
  }),
);

adminRouter.post(
  '/orders/:orderNumber/ready',
  requirePermission('orders:fulfill'),
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    if (order.paymentStatus !== 'paid') throw new AppError(409, 'NOT_PAID', 'Pesanan belum lunas.');
    if (order.reservation.status !== 'allocated') {
      throw new AppError(409, 'NOT_ALLOCATED', 'Pesanan belum memiliki alokasi stok.');
    }
    if (order.shippingHold?.active) {
      throw new AppError(409, 'ON_HOLD', 'Pesanan sedang ditahan dan belum dapat diproses.');
    }
    const result = await Order.updateOne(
      { _id: order._id, paymentStatus: 'paid', shippingStatus: 'pending', 'shippingHold.active': { $ne: true } },
      {
        $set: { shippingStatus: 'ready' },
        $push: {
          statusHistory: {
            at: new Date(),
            type: 'shipping',
            from: 'pending',
            to: 'ready',
            actor: String(req.auth!.user._id),
            note: 'Pesanan ditandai siap kirim.',
          },
        },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new AppError(409, 'SHIPPING_STATE_INVALID', 'Status pesanan berubah; muat ulang.');
    }
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'order.ready',
      targetType: 'order',
      targetId: order.orderNumber,
      correlationId: req.requestId,
      summary: `Menandai pesanan ${order.orderNumber} siap kirim.`,
    });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/orders/:orderNumber/shipped',
  requirePermission('orders:fulfill'),
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    const body = z
      .object({
        courier: z.string().trim().min(2).max(80),
        trackingNumber: z.string().trim().min(4).max(120),
      })
      .strict()
      .parse(req.body);
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    if (order.paymentStatus !== 'paid') throw new AppError(409, 'NOT_PAID', 'Pesanan belum lunas.');
    if (order.shippingStatus !== 'ready') {
      throw new AppError(409, 'NOT_READY', 'Pesanan harus berstatus siap kirim.');
    }
    if (order.reservation.status !== 'allocated') {
      throw new AppError(409, 'NOT_ALLOCATED', 'Alokasi stok tidak aktif.');
    }
    if (order.shippingHold?.active) throw new AppError(409, 'ON_HOLD', 'Pesanan sedang ditahan.');

    const session = await Order.startSession();
    try {
      await session.withTransaction(async () => {
        const now = new Date();
        const updated = await Order.findOneAndUpdate(
          {
            _id: order._id,
            paymentStatus: 'paid',
            shippingStatus: 'ready',
            'shippingHold.active': { $ne: true },
          },
          {
            $set: {
              shippingStatus: 'shipped',
              tracking: {
                courier: body.courier,
                trackingNumber: body.trackingNumber,
                shippedAt: now,
              },
            },
            $push: {
              statusHistory: {
                at: now,
                type: 'shipping',
                from: 'ready',
                to: 'shipped',
                actor: String(req.auth!.user._id),
                note: `Dikirim melalui ${body.courier} (${body.trackingNumber}).`,
              },
            },
          },
          { new: true, session },
        );
        if (!updated) throw new AppError(409, 'SHIPPING_STATE_INVALID', 'Status pesanan berubah; muat ulang.');
        await shipAllocation(order._id, order.orderNumber, String(req.auth!.user._id), session);
        await writeAudit({
          actorId: String(req.auth!.user._id),
          actorEmail: req.auth!.user.email,
          action: 'order.shipped',
          targetType: 'order',
          targetId: order.orderNumber,
          correlationId: req.requestId,
          summary: `Mengirim pesanan ${order.orderNumber} melalui ${body.courier}.`,
          changes: { courier: body.courier, trackingNumber: body.trackingNumber },
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    await recordOrderTransition('order_shipped', String(order._id), { courier: body.courier }).catch(() => undefined);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/orders/:orderNumber/delivered',
  requirePermission('orders:fulfill'),
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    if (order.shippingStatus !== 'shipped') {
      throw new AppError(409, 'NOT_SHIPPED', 'Pesanan belum ditandai dikirim.');
    }
    const result = await Order.updateOne(
      { _id: order._id, shippingStatus: 'shipped' },
      {
        $set: { shippingStatus: 'delivered', 'tracking.deliveredAt': new Date() },
        $push: {
          statusHistory: {
            at: new Date(),
            type: 'shipping',
            from: 'shipped',
            to: 'delivered',
            actor: String(req.auth!.user._id),
            note: 'Pesanan diterima pelanggan.',
          },
        },
      },
    );
    if (result.modifiedCount !== 1) throw new AppError(409, 'SHIPPING_STATE_INVALID', 'Status pesanan berubah.');
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'order.delivered',
      targetType: 'order',
      targetId: order.orderNumber,
      correlationId: req.requestId,
      summary: `Menandai pesanan ${order.orderNumber} diterima.`,
    });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/orders/:orderNumber/hold',
  requirePermission('cases:manage'),
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    const body = z.object({ reason: z.string().trim().min(5).max(500) }).strict().parse(req.body);
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    await Order.updateOne(
      { _id: order._id },
      {
        $set: { 'shippingHold.active': true, 'shippingHold.reason': body.reason },
        $push: {
          statusHistory: {
            at: new Date(),
            type: 'hold',
            to: 'on_hold',
            actor: String(req.auth!.user._id),
            note: body.reason,
          },
        },
      },
    );
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'order.hold',
      targetType: 'order',
      targetId: order.orderNumber,
      correlationId: req.requestId,
      summary: `Menahan pengiriman ${order.orderNumber}.`,
      changes: { reason: body.reason },
    });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/orders/:orderNumber/release-hold',
  requirePermission('cases:manage'),
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(5).max(60).parse(req.params.orderNumber);
    const order = await Order.findOne({ orderNumber });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    const openCases = await PaymentCase.countDocuments({ orderId: order._id, status: { $ne: 'resolved' } });
    if (openCases > 0) {
      throw new AppError(409, 'OPEN_CASES', 'Selesaikan kasus terkait sebelum melepas penahanan.');
    }
    await Order.updateOne(
      { _id: order._id },
      {
        $set: { 'shippingHold.active': false, 'shippingHold.reason': undefined, 'shippingHold.caseId': undefined },
        $push: {
          statusHistory: {
            at: new Date(),
            type: 'hold',
            from: 'on_hold',
            to: 'released',
            actor: String(req.auth!.user._id),
            note: 'Penahanan pengiriman dilepas.',
          },
        },
      },
    );
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'order.release_hold',
      targetType: 'order',
      targetId: order.orderNumber,
      correlationId: req.requestId,
      summary: `Melepas penahanan pengiriman ${order.orderNumber}.`,
    });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/cases',
  requirePermission('cases:manage'),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        status: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.enum(['open', 'in_progress', 'resolved']).optional(),
        ),
        page: z.preprocess(
          (value) => (Array.isArray(value) ? value[0] : value || undefined),
          z.coerce.number().int().min(1).optional(),
        ),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Parameter tidak valid.');
    const page = parsed.data.page ?? 1;
    const perPage = 20;
    const filter: mongoose.FilterQuery<typeof PaymentCase> = {};
    if (parsed.data.status) filter.status = parsed.data.status;
    const [items, total] = await Promise.all([
      PaymentCase.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      PaymentCase.countDocuments(filter),
    ]);
    const orders = await Order.find({ _id: { $in: items.map((item) => item.orderId) } });
    const orderById = new Map(orders.map((order) => [String(order._id), order]));
    res.json({
      items: items.map((item) => ({
        id: String(item._id),
        caseNumber: item.caseNumber,
        type: item.type,
        status: item.status,
        priority: item.priority,
        reason: item.reason,
        createdAt: item.createdAt,
        orderNumber: orderById.get(String(item.orderId))?.orderNumber ?? null,
        orderPaymentStatus: orderById.get(String(item.orderId))?.paymentStatus ?? null,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  }),
);

adminRouter.patch(
  '/cases/:id',
  requirePermission('cases:manage'),
  asyncHandler(async (req, res) => {
    const id = productIdSchema.parse(req.params.id);
    const body = z
      .object({
        status: z.enum(['open', 'in_progress', 'resolved']).optional(),
        ownerId: z.string().regex(/^[a-f0-9]{24}$/).nullable().optional(),
        note: z.string().trim().min(3).max(500).optional(),
      })
      .strict()
      .parse(req.body);
    const item = await PaymentCase.findById(id);
    if (!item) throw new AppError(404, 'CASE_NOT_FOUND', 'Kasus tidak ditemukan.');
    if (body.ownerId) {
      const owner = await User.findById(body.ownerId);
      if (!owner || owner.role === 'customer') {
        throw new AppError(400, 'OWNER_INVALID', 'Pemilik kasus harus akun admin.');
      }
    }
    const before = { status: item.status, ownerId: item.ownerId ? String(item.ownerId) : null };
    if (body.status) item.status = body.status;
    if (body.ownerId !== undefined) item.ownerId = body.ownerId ? new Types.ObjectId(body.ownerId) : undefined;
    if (body.note) {
      item.history.push({
        at: new Date(),
        actorId: req.auth!.user._id,
        action: body.status ? `status:${body.status}` : 'note',
        note: body.note,
      } as never);
    }
    await item.save();
    await writeAudit({
      actorId: String(req.auth!.user._id),
      actorEmail: req.auth!.user.email,
      action: 'case.update',
      targetType: 'case',
      targetId: item.caseNumber,
      correlationId: req.requestId,
      summary: `Memperbarui kasus ${item.caseNumber}.`,
      changes: { before, after: { status: item.status }, note: body.note },
    });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/audit',
  requirePermission('audit:read'),
  asyncHandler(async (req, res) => {
    const page = z.coerce.number().int().min(1).optional().parse(req.query.page) ?? 1;
    const perPage = 50;
    const { AuditLog } = await import('../models');
    const [items, total] = await Promise.all([
      AuditLog.find().sort({ at: -1 }).skip((page - 1) * perPage).limit(perPage),
      AuditLog.countDocuments(),
    ]);
    res.json({
      items: items.map((entry) => ({
        at: entry.at,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        summary: entry.summary,
        correlationId: entry.correlationId ?? null,
        changes: entry.changes ?? null,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  }),
);
