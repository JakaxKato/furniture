import { randomUUID } from 'node:crypto';
import { authenticator } from 'otplib';
import request from 'supertest';
import type { Express } from 'express';
import { env } from '../src/config/env';
import { shippingSeeds } from '../src/config/store';
import { encryptSecret, gatewaySignature, randomId } from '../src/lib/crypto';
import { hashPassword } from '../src/lib/authCrypto';
import {
  Inventory,
  Order,
  PaymentAttempt,
  Product,
  ShippingZone,
  User,
  models_,
} from '../src/models';
import { setGateway, GatewayTimeoutError, type CreateTransactionInput, type GatewayStatus, type PaymentGateway } from '../src/modules/paymentGateway';

export const APP_ORIGIN = env.APP_ORIGIN;

export async function teardownDb(): Promise<void> {
  const mongoose = await import('mongoose');
  await mongoose.disconnect().catch(() => undefined);
}

export class TestGateway implements PaymentGateway {
  readonly provider = 'simulation' as const;
  readonly transactions = new Map<string, GatewayStatus>();
  readonly createCalls: CreateTransactionInput[] = [];
  failNextCreate: 'timeout' | 'error' | null = null;

  async createTransaction(input: CreateTransactionInput): Promise<{ redirectUrl: string; token?: string }> {
    if (this.failNextCreate === 'timeout') {
      this.failNextCreate = null;
      throw new GatewayTimeoutError('Simulasi timeout');
    }
    if (this.failNextCreate === 'error') {
      this.failNextCreate = null;
      throw new Error('gateway error');
    }
    this.createCalls.push(input);
    this.transactions.set(input.gatewayOrderId, {
      gatewayOrderId: input.gatewayOrderId,
      transactionId: `TX-${randomId(4).toUpperCase()}`,
      status: 'pending',
      grossAmount: input.amount,
      rawStatus: 'pending',
      statusCode: '201',
    });
    return {
      redirectUrl: `${env.APP_ORIGIN}/pembayaran-simulasi/${encodeURIComponent(input.gatewayOrderId)}`,
      token: `tok_${randomId(4)}`,
    };
  }

  async getStatus(gatewayOrderId: string): Promise<GatewayStatus | null> {
    return this.transactions.get(gatewayOrderId) ?? null;
  }

  setStatus(gatewayOrderId: string, status: GatewayStatus['status'], overrides: Partial<GatewayStatus> = {}): GatewayStatus {
    const existing = this.transactions.get(gatewayOrderId);
    if (!existing) throw new Error(`Transaksi uji ${gatewayOrderId} tidak ditemukan`);
    const next: GatewayStatus = {
      ...existing,
      status,
      rawStatus: status,
      statusCode: status === 'settlement' || status === 'capture' ? '200' : '201',
      ...overrides,
    };
    this.transactions.set(gatewayOrderId, next);
    return next;
  }
}

export const testGateway = new TestGateway();
export { setGateway };

export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  csrf = '';
  constructor(app: Express) {
    this.agent = request.agent(app);
  }

  async init(): Promise<request.Response> {
    const response = await this.agent.get('/api/v1/auth/me');
    this.csrf = response.body.csrfToken as string;
    return response;
  }

  get(path: string) {
    return this.agent.get(path);
  }

  post(path: string, body: unknown = {}) {
    return this.agent
      .post(path)
      .set('origin', APP_ORIGIN)
      .set('x-csrf-token', this.csrf)
      .send(body as object);
  }

  patch(path: string, body: unknown = {}) {
    return this.agent
      .patch(path)
      .set('origin', APP_ORIGIN)
      .set('x-csrf-token', this.csrf)
      .send(body as object);
  }

  delete(path: string) {
    return this.agent.delete(path).set('origin', APP_ORIGIN).set('x-csrf-token', this.csrf);
  }

  async login(email: string, password: string, totp?: string): Promise<request.Response> {
    if (!this.csrf) await this.init();
    const response = await this.post('/api/v1/auth/login', { email, password, ...(totp ? { totp } : {}) });
    if (response.body?.csrfToken) this.csrf = response.body.csrfToken as string;
    return response;
  }
}

export async function resetDb(): Promise<void> {
  await Promise.all(Object.values(models_).map((model) => model.deleteMany({})));
}

export async function seedZones(): Promise<void> {
  await ShippingZone.insertMany(
    shippingSeeds.map((zone) => ({
      code: zone.code,
      name: zone.name,
      province: zone.province,
      cities: zone.cities,
      postalPrefixes: zone.postalPrefixes,
      rates: zone.rates,
      version: 1,
      active: true,
    })),
  );
}

export async function createCustomer(email = `pelanggan-${randomId(3)}@example.com`, password = 'Rahasia12345') {
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    name: 'Pelanggan Uji',
    phone: '+6281200000001',
    passwordHash,
    role: 'customer',
  });
  return { user, email, password };
}

export const ADMIN_PASSWORD = 'AdminRahasia123';
export async function createAdmin(role: 'admin_catalog' | 'admin_ops' | 'admin_finance' | 'super_admin' = 'super_admin') {
  const email = `${role}-${randomId(3)}@example.com`;
  const secret = authenticator.generateSecret();
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await User.create({
    email,
    name: 'Admin Uji',
    passwordHash,
    role,
    mfaEnabled: true,
    mfaSecret: encryptSecret(secret),
  });
  return { email, password: ADMIN_PASSWORD, secret };
}

export type ProductFixture = {
  sku: string;
  price?: number;
  stock?: number;
  category?: 'kasur' | 'bantal' | 'furnitur';
  shippingClass?: 'kasur' | 'bantal' | 'furnitur';
  attributes?: Record<string, string | number>;
  slug?: string;
  name?: string;
  status?: 'published' | 'draft' | 'archived';
  variants?: Array<{
    sku: string;
    price: number;
    stock: number;
    attributes?: Record<string, string | number>;
    label?: string;
  }>;
};

export async function createProduct(fixture: ProductFixture) {
  const category = fixture.category ?? 'kasur';
  const shippingClass = fixture.shippingClass ?? category;
  const slug = fixture.slug ?? `produk-${randomId(3)}`;
  const variants = fixture.variants ?? [
    {
      sku: fixture.sku,
      price: fixture.price ?? 100_000,
      stock: fixture.stock ?? 5,
      attributes: fixture.attributes ?? { size: '160 × 200 cm', firmness: 'Sedang', thicknessCm: 20 },
      label: '160 × 200 cm',
    },
  ];
  const product = await Product.create({
    slug,
    name: fixture.name ?? 'Produk Uji',
    category,
    summary: 'Ringkasan produk uji.',
    description: 'Deskripsi produk uji untuk pengujian integrasi.',
    care: 'Perawatan uji.',
    images: [{ url: '/images/products/kasur-busa.svg', alt: 'Gambar produk uji' }],
    status: fixture.status ?? 'published',
    publishedAt: new Date(),
    variants: variants.map((variant) => ({
      sku: variant.sku,
      label: variant.label ?? 'Standar',
      price: variant.price,
      shippingClass,
      attributes: variant.attributes ?? {},
      images: [],
    })),
  });
  for (const variant of variants) {
    const savedVariant = product.variants.find((item) => item.sku === variant.sku)!;
    await Inventory.create({
      sku: variant.sku,
      productId: product._id,
      variantId: savedVariant._id,
      physical: variant.stock,
      held: 0,
      allocated: 0,
    });
  }
  return product;
}

export const JKT_ADDRESS = {
  recipient: 'Sari Uji',
  phone: '+6281200000001',
  street: 'Jalan Uji No. 1',
  city: 'Jakarta Selatan',
  province: 'DKI Jakarta',
  postalCode: '12140',
};

export async function quoteFor(client: Client, sku: string, quantity = 1, address = JKT_ADDRESS) {
  const response = await client.post('/api/v1/checkout/quote', {
    items: [{ sku, quantity }],
    address,
  });
  return response;
}

export async function createOrderFor(
  client: Client,
  sku: string,
  quantity = 1,
  options: { address?: typeof JKT_ADDRESS; idempotencyKey?: string } = {},
) {
  const quoteResponse = await quoteFor(client, sku, quantity, options.address);
  if (quoteResponse.status !== 200) {
    return { quoteResponse, orderResponse: null, quote: null };
  }
  const quote = quoteResponse.body.quote as { quoteHash: string };
  const orderResponse = await client.agent
    .post('/api/v1/orders')
    .set('origin', APP_ORIGIN)
    .set('x-csrf-token', client.csrf)
    .set('idempotency-key', options.idempotencyKey ?? randomUUID())
    .send({
      items: [{ sku, quantity }],
      address: options.address ?? JKT_ADDRESS,
      quoteHash: quote.quoteHash,
    });
  return { quoteResponse, orderResponse, quote };
}

export async function attemptForOrder(orderNumber: string) {
  const order = await Order.findOne({ orderNumber });
  if (!order) throw new Error(`Order ${orderNumber} tidak ditemukan`);
  const attempt = await PaymentAttempt.findOne({ orderId: order._id }).sort({ createdAt: -1 });
  return { order, attempt };
}

export function webhookFor(
  attempt: { gatewayOrderId: string; amount: number },
  overrides: {
    status?: string;
    grossAmount?: string;
    statusCode?: string;
    transactionId?: string;
    signatureKey?: string;
  } = {},
) {
  const grossAmount = overrides.grossAmount ?? `${attempt.amount}.00`;
  const statusCode = overrides.statusCode ?? '200';
  const signature =
    overrides.signatureKey ??
    gatewaySignature(attempt.gatewayOrderId, statusCode, grossAmount, process.env.MIDTRANS_SERVER_KEY ?? '');
  return {
    order_id: attempt.gatewayOrderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: signature,
    transaction_status: overrides.status ?? 'settlement',
    transaction_id: overrides.transactionId,
    fraud_status: 'accept',
    payment_type: 'qris',
  };
}
