import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { SHIPPING_CLASS_LABELS, storeConfig } from '../config/store';
import { AppError } from '../lib/errors';
import { orderNumber } from '../lib/money';
import { sha256 } from '../lib/crypto';
import { CheckoutKey, Inventory, Order, Product } from '../models';
import { availableOf, reserveStock } from './inventory';
import { quoteShipping } from './shipping';
import { recordEvent } from './analytics';

export const addressInputSchema = z
  .object({
    recipient: z.string().trim().min(2, 'Nama penerima wajib diisi.').max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{8,20}$/, 'Nomor telepon tidak valid.'),
    street: z.string().trim().min(5, 'Alamat jalan wajib diisi.').max(300),
    district: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2, 'Kota wajib dipilih.').max(120),
    province: z.string().trim().min(2, 'Provinsi wajib diisi.').max(120),
    postalCode: z.string().trim().regex(/^\d{5}$/, 'Kode pos harus 5 digit.'),
    notes: z.string().trim().max(300).optional(),
  })
  .strict();

export type AddressInput = z.infer<typeof addressInputSchema>;

export const itemsInputSchema = z
  .array(
    z
      .object({
        sku: z.string().trim().toUpperCase().min(3).max(64),
        quantity: z.number().int().min(1).max(99),
      })
      .strict(),
  )
  .min(1, 'Keranjang kosong.')
  .max(30, 'Maksimal 30 baris keranjang.');

export type CartInput = z.infer<typeof itemsInputSchema>;

type QuoteLine = {
  sku: string;
  productId: string;
  variantId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  imageAlt: string | null;
  attributes: Record<string, unknown>;
  shippingClass: 'kasur' | 'bantal' | 'furnitur';
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  available: number;
  inStock: boolean;
  issue: string | null;
};

export type Quote = {
  items: QuoteLine[];
  address: AddressInput;
  subtotal: number;
  shipping: {
    zoneId: string;
    zoneCode: string;
    zoneName: string;
    zoneVersion: number;
    classes: Array<{ shippingClass: string; label: string; amount: number }>;
    total: number;
    estimatedDays: { min: number; max: number; confirmed: boolean } | null;
  };
  totals: { subtotal: number; shipping: number; grandTotal: number };
  quoteHash: string;
  payable: boolean;
  issues: Array<{ code: string; sku?: string; message: string; available?: number; requested?: number }>;
};

function normaliseAddress(address: AddressInput): AddressInput {
  return {
    recipient: address.recipient.trim(),
    phone: address.phone.trim(),
    street: address.street.trim(),
    district: address.district?.trim() || undefined,
    city: address.city.trim(),
    province: address.province.trim(),
    postalCode: address.postalCode.trim(),
    notes: address.notes?.trim() || undefined,
  };
}

function quoteHashOf(quote: Omit<Quote, 'quoteHash' | 'payable' | 'issues'>): string {
  const canonical = {
    items: [...quote.items]
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((item) => ({ sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice })),
    address: quote.address,
    shipping: {
      zoneCode: quote.shipping.zoneCode,
      zoneVersion: quote.shipping.zoneVersion,
      classes: [...quote.shipping.classes]
        .sort((a, b) => a.shippingClass.localeCompare(b.shippingClass))
        .map((line) => ({ shippingClass: line.shippingClass, amount: line.amount })),
      total: quote.shipping.total,
    },
    totals: quote.totals,
  };
  return sha256(JSON.stringify(canonical));
}

export async function buildQuote(rawAddress: AddressInput, items: CartInput): Promise<Quote> {
  const address = normaliseAddress(rawAddress);
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.sku, (merged.get(item.sku) ?? 0) + item.quantity);
  }
  const mergedItems = [...merged.entries()].map(([sku, quantity]) => ({ sku, quantity }));
  if (mergedItems.some((item) => item.quantity > 99)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Kuantitas per SKU maksimal 99.');
  }

  const products = await Product.find({
    status: 'published',
    'variants.sku': { $in: mergedItems.map((item) => item.sku) },
  });
  const variants = new Map<
    string,
    {
      product: (typeof products)[number];
      variant: (typeof products)[number]['variants'][number];
    }
  >();
  for (const product of products) {
    for (const variant of product.variants) {
      variants.set(variant.sku, { product, variant });
    }
  }
  const missing = mergedItems.filter((item) => !variants.has(item.sku));
  if (missing.length > 0) {
    throw new AppError(409, 'ITEM_UNAVAILABLE', 'Salah satu varian tidak tersedia.', {
      skus: missing.map((item) => item.sku),
    });
  }

  const inventories = await Inventory.find({ sku: { $in: mergedItems.map((item) => item.sku) } });
  const availableBySku = new Map(inventories.map((inventory) => [inventory.sku, availableOf(inventory)]));

  const issues: Quote['issues'] = [];
  const lines: QuoteLine[] = [];
  for (const input of mergedItems) {
    const found = variants.get(input.sku)!;
    const { product, variant } = found;
    const available = availableBySku.get(input.sku) ?? 0;
    const inStock = available >= input.quantity;
    if (!inStock) {
      issues.push({
        code: 'OUT_OF_STOCK',
        sku: input.sku,
        message:
          available === 0
            ? 'Stok habis untuk varian ini.'
            : `Hanya tersedia ${available} unit untuk varian ini.`,
        available,
        requested: input.quantity,
      });
    }
    const image = variant.images[0] ?? product.images[0];
    lines.push({
      sku: variant.sku,
      productId: String(product._id),
      variantId: String(variant._id),
      productSlug: product.slug,
      productName: product.name,
      variantLabel: variant.label,
      imageUrl: image?.url ?? null,
      imageAlt: image?.alt ?? null,
      attributes: (variant.attributes ?? {}) as Record<string, unknown>,
      shippingClass: variant.shippingClass,
      unitPrice: variant.price,
      quantity: input.quantity,
      lineTotal: variant.price * input.quantity,
      available,
      inStock,
      issue: inStock ? null : 'OUT_OF_STOCK',
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const shipping = await quoteShipping(
    address,
    lines.map((line) => line.shippingClass),
  ).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'SHIPPING_UNAVAILABLE') {
      throw new AppError(422, 'SHIPPING_UNAVAILABLE', error.message, {
        ...(typeof error.details === 'object' && error.details ? error.details : {}),
        contact: {
          email: storeConfig.contact.email,
          whatsapp: storeConfig.contact.whatsapp,
        },
      });
    }
    throw error;
  });

  const base = {
    items: lines,
    address,
    subtotal,
    shipping: {
      zoneId: String(shipping.zoneId),
      zoneCode: shipping.zoneCode,
      zoneName: shipping.zoneName,
      zoneVersion: shipping.zoneVersion,
      classes: shipping.classes.map((line) => ({
        shippingClass: line.shippingClass,
        label: SHIPPING_CLASS_LABELS[line.shippingClass],
        amount: line.amount,
      })),
      total: shipping.total,
      estimatedDays: shipping.estimatedDays,
    },
    totals: { subtotal, shipping: shipping.total, grandTotal: subtotal + shipping.total },
  };
  return {
    ...base,
    quoteHash: quoteHashOf(base),
    payable: issues.length === 0,
    issues,
  };
}

export type CreatedOrderResult = {
  order: InstanceType<typeof Order>;
  idempotent: boolean;
};

function requestHashOf(items: CartInput, address: AddressInput, quoteHash: string): string {
  const canonical = {
    items: [...items]
      .map((item) => ({ sku: item.sku, quantity: item.quantity }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
    address: normaliseAddress(address),
    quoteHash,
  };
  return sha256(JSON.stringify(canonical));
}

export async function createOrder(input: {
  userId: Types.ObjectId;
  email: string;
  items: CartInput;
  address: AddressInput;
  quoteHash: string;
  idempotencyKey: string;
}): Promise<CreatedOrderResult> {
  const keyHash = sha256(input.idempotencyKey);
  const requestHash = requestHashOf(input.items, input.address, input.quoteHash);
  const existingKey = await CheckoutKey.findOne({ userId: input.userId, key: keyHash });
  if (existingKey) {
    if (existingKey.requestHash !== requestHash) {
      throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Kunci idempotensi sudah dipakai untuk isi berbeda.');
    }
    const order = await Order.findOne({ _id: existingKey.orderId, userId: input.userId });
    if (!order) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Pesanan untuk kunci ini tidak ditemukan.');
    return { order, idempotent: true };
  }

  const quote = await buildQuote(input.address, input.items);
  if (quote.quoteHash !== input.quoteHash) {
    throw new AppError(
      409,
      'QUOTE_CHANGED',
      'Harga, stok, atau ongkir berubah. Periksa ringkasan terbaru lalu konfirmasi ulang.',
      { quote },
    );
  }
  if (!quote.payable) {
    throw new AppError(409, 'OUT_OF_STOCK', 'Stok tidak mencukupi untuk melanjutkan.', {
      issues: quote.issues,
      quote,
    });
  }

  const reservationExpiresAt = new Date(
    Date.now() + Math.max(env.RESERVATION_MINUTES, env.PAYMENT_METHOD_WINDOW_MINUTES) * 60 * 1000,
  );
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await Order.startSession();
    const number = orderNumber();
    try {
      await session.withTransaction(async () => {
        const order = new Order({
          orderNumber: number,
          userId: input.userId,
          email: input.email,
          items: quote.items.map((line) => ({
            productId: new Types.ObjectId(line.productId),
            productSlug: line.productSlug,
            productName: line.productName,
            variantId: new Types.ObjectId(line.variantId),
            variantLabel: line.variantLabel,
            sku: line.sku,
            attributes: line.attributes,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            lineTotal: line.lineTotal,
            shippingClass: line.shippingClass,
            imageUrl: line.imageUrl,
            imageAlt: line.imageAlt,
          })),
          address: quote.address,
          shipping: {
            zoneId: new Types.ObjectId(quote.shipping.zoneId),
            zoneCode: quote.shipping.zoneCode,
            zoneName: quote.shipping.zoneName,
            zoneVersion: quote.shipping.zoneVersion,
            classes: quote.shipping.classes,
            total: quote.shipping.total,
            estimatedDays: quote.shipping.estimatedDays ?? undefined,
          },
          totals: quote.totals,
          quoteHash: quote.quoteHash,
          paymentStatus: 'pending',
          shippingStatus: 'pending',
          reservation: { status: 'held', expiresAt: reservationExpiresAt },
          statusHistory: [
            {
              at: new Date(),
              type: 'note',
              to: 'pending',
              actor: 'customer',
              note: 'Pesanan dibuat dan stok ditahan hingga batas pembayaran.',
            },
          ],
        });
        const saved = await order.save({ session });
        await reserveStock(
          quote.items.map((line) => ({
            sku: line.sku,
            productId: new Types.ObjectId(line.productId),
            variantId: new Types.ObjectId(line.variantId),
            quantity: line.quantity,
          })),
          saved._id as Types.ObjectId,
          number,
          session,
        );
        await CheckoutKey.create(
          [
            {
              userId: input.userId,
              key: keyHash,
              requestHash,
              orderId: saved._id,
            },
          ],
          { session },
        );
      });
      const created = await Order.findOne({ orderNumber: number, userId: input.userId });
      if (!created) throw new AppError(500, 'ORDER_FAILED', 'Pesanan gagal dibuat.');
      await recordEvent({ type: 'order_created', orderId: String(created._id), dedupeKey: `order_created:${created._id}` });
      return { order: created, idempotent: false };
    } catch (error) {
      lastError = error;
      const mongoError = error as { code?: number; keyPattern?: Record<string, unknown> };
      if (mongoError.code === 11000) {
        if (mongoError.keyPattern && 'orderNumber' in mongoError.keyPattern) continue;
        if (mongoError.keyPattern && 'userId' in mongoError.keyPattern) {
          const raced = await CheckoutKey.findOne({ userId: input.userId, key: keyHash });
          if (raced) {
            if (raced.requestHash !== requestHash) {
              throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Kunci idempotensi sudah dipakai untuk isi berbeda.');
            }
            const order = await Order.findOne({ _id: raced.orderId, userId: input.userId });
            if (order) return { order, idempotent: true };
          }
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new AppError(500, 'ORDER_FAILED', 'Pesanan gagal dibuat.');
}
