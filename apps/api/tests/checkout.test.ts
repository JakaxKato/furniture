import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { Order, Product } from '../src/models';
import {
  Client,
  JKT_ADDRESS,
  createCustomer,
  createOrderFor,
  createProduct,
  quoteFor,
  resetDb,
  seedZones,
  teardownDb,
  testGateway,
} from './helpers';

afterAll(teardownDb);
const app = createApp({ gateway: testGateway });

beforeEach(async () => {
  await resetDb();
  testGateway.transactions.clear();
  testGateway.createCalls.length = 0;
  await seedZones();
});

const DENPASAR_ADDRESS = {
  recipient: 'Made Uji',
  phone: '+6281200000002',
  street: 'Jalan Uji Denpasar 2',
  city: 'Denpasar',
  province: 'Bali',
  postalCode: '80233',
};

async function loginCustomer(email = `checkout-${Date.now()}@example.com`) {
  const customer = await createCustomer(email);
  const client = new Client(app);
  await client.init();
  const login = await client.login(customer.email, customer.password);
  expect(login.status).toBe(200);
  return client;
}

describe('quote dan ongkir', () => {
  it('menjumlahkan tarif per kelas untuk keranjang campuran', async () => {
    await createProduct({
      sku: 'MIX-KASUR',
      category: 'kasur',
      shippingClass: 'kasur',
      price: 2_000_000,
      stock: 2,
    });
    await createProduct({
      sku: 'MIX-BANTAL',
      category: 'bantal',
      shippingClass: 'bantal',
      price: 200_000,
      stock: 2,
    });
    const client = await loginCustomer();
    const response = await client.post('/api/v1/checkout/quote', {
      items: [
        { sku: 'MIX-KASUR', quantity: 1 },
        { sku: 'MIX-BANTAL', quantity: 2 },
      ],
      address: JKT_ADDRESS,
    });
    expect(response.status).toBe(200);
    const quote = response.body.quote;
    expect(quote.items).toHaveLength(2);
    expect(quote.totals.subtotal).toBe(2_400_000);
    expect(quote.shipping.classes).toHaveLength(2);
    expect(quote.shipping.total).toBe(185_000);
    expect(quote.totals.grandTotal).toBe(2_585_000);
    expect(quote.payable).toBe(true);
    expect(quote.quoteHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('memblokir ongkir bila tarif kelas untuk zona tidak lengkap', async () => {
    await createProduct({ sku: 'NO-RATE', category: 'furnitur', price: 4_000_000, stock: 2 });
    const client = await loginCustomer();
    const response = await client.post('/api/v1/checkout/quote', {
      items: [{ sku: 'NO-RATE', quantity: 1 }],
      address: DENPASAR_ADDRESS,
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('SHIPPING_UNAVAILABLE');
    expect(response.body.error.details.reason).toBe('rate_missing');
    expect(response.body.error.details.contact.email).toBeTruthy();
  });

  it('menolak alamat di luar zona', async () => {
    await createProduct({ sku: 'OUT-ZONE', stock: 2 });
    const client = await loginCustomer();
    const response = await client.post('/api/v1/checkout/quote', {
      items: [{ sku: 'OUT-ZONE', quantity: 1 }],
      address: { ...DENPASAR_ADDRESS, city: 'Bandung', province: 'Jawa Barat', postalCode: '50111' },
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('SHIPPING_UNAVAILABLE');
  });

  it('menolak SKU yang tidak terbit', async () => {
    await createProduct({ sku: 'DRAFT-SKU', status: 'draft' });
    const client = await loginCustomer();
    const response = await quoteFor(client, 'DRAFT-SKU');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ITEM_UNAVAILABLE');
  });
});

describe('manipulasi harga dan ringkasan', () => {
  it('menghitung total di server dan menolak field harga tambahan', async () => {
    await createProduct({ sku: 'SAFE-1', price: 500_000, stock: 3 });
    const client = await loginCustomer();
    const quoteResponse = await quoteFor(client, 'SAFE-1', 2);
    const quote = quoteResponse.body.quote;
    const orderResponse = await client.agent
      .post('/api/v1/orders')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', client.csrf)
      .set('idempotency-key', `key-${Date.now()}-a`)
      .send({
        items: [{ sku: 'SAFE-1', quantity: 2, unitPrice: 1 }],
        address: JKT_ADDRESS,
        quoteHash: quote.quoteHash,
      });
    expect(orderResponse.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);

    const valid = await client.agent
      .post('/api/v1/orders')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', client.csrf)
      .set('idempotency-key', `key-${Date.now()}-b`)
      .send({
        items: [{ sku: 'SAFE-1', quantity: 2 }],
        address: JKT_ADDRESS,
        quoteHash: quote.quoteHash,
      });
    expect(valid.status).toBe(201);
    expect(valid.body.order.totals.subtotal).toBe(1_000_000);
    expect(valid.body.order.totals.grandTotal).toBe(1_150_000);
    expect(valid.body.order.totals.shipping).toBe(150_000);
  });

  it('menolak quote lama setelah harga berubah dan mengembalikan ringkasan terbaru', async () => {
    const product = await createProduct({ sku: 'CHANGE-1', price: 300_000, stock: 3 });
    const client = await loginCustomer();
    const quoteResponse = await quoteFor(client, 'CHANGE-1', 1);
    const oldHash = quoteResponse.body.quote.quoteHash as string;

    const variant = product.variants[0]!;
    variant.price = 350_000;
    await product.save();

    const response = await client.agent
      .post('/api/v1/orders')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', client.csrf)
      .set('idempotency-key', `key-${Date.now()}-c`)
      .send({
        items: [{ sku: 'CHANGE-1', quantity: 1 }],
        address: JKT_ADDRESS,
        quoteHash: oldHash,
      });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('QUOTE_CHANGED');
    expect(response.body.error.details.quote.totals.subtotal).toBe(350_000);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('tidak mengizinkan quote satu produk dipakai untuk produk lain', async () => {
    await createProduct({ sku: 'CHEAP-1', price: 100_000, stock: 2 });
    await createProduct({ sku: 'EXPENSIVE-1', price: 5_000_000, stock: 2 });
    const client = await loginCustomer();
    const cheapQuote = (await quoteFor(client, 'CHEAP-1')).body.quote;
    const response = await client.agent
      .post('/api/v1/orders')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', client.csrf)
      .set('idempotency-key', `key-${Date.now()}-d`)
      .send({
        items: [{ sku: 'EXPENSIVE-1', quantity: 1 }],
        address: JKT_ADDRESS,
        quoteHash: cheapQuote.quoteHash,
      });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('QUOTE_CHANGED');
    expect(await Order.countDocuments()).toBe(0);
  });

  it('menyimpan snapshot meski harga produk berubah setelah pesanan dibuat', async () => {
    const product = await createProduct({ sku: 'SNAP-1', price: 200_000, stock: 2 });
    const client = await loginCustomer();
    const { orderResponse } = await createOrderFor(client, 'SNAP-1');
    expect(orderResponse?.status).toBe(201);
    const number = orderResponse!.body.order.orderNumber as string;
    product.variants[0]!.price = 999_000;
    await product.save();
    const detail = await client.get(`/api/v1/orders/${number}`);
    expect(detail.status).toBe(200);
    expect(detail.body.order.items[0].unitPrice).toBe(200_000);
    expect(detail.body.order.totals.subtotal).toBe(200_000);
  });
});

describe('idempotensi dan konkurensi', () => {
  it('mengembalikan pesanan yang sama untuk key dan isi yang sama', async () => {
    await createProduct({ sku: 'IDEM-1', price: 150_000, stock: 5 });
    const client = await loginCustomer();
    const key = `idem-${Date.now()}`;
    const first = await createOrderFor(client, 'IDEM-1', 1, { idempotencyKey: key });
    expect(first.orderResponse?.status).toBe(201);
    const second = await createOrderFor(client, 'IDEM-1', 1, { idempotencyKey: key });
    expect(second.orderResponse?.status).toBe(200);
    expect(second.orderResponse?.body.idempotent).toBe(true);
    expect(second.orderResponse?.body.order.orderNumber).toBe(
      first.orderResponse?.body.order.orderNumber,
    );
    expect(await Order.countDocuments()).toBe(1);
  });

  it('menolak key yang sama untuk isi berbeda', async () => {
    await createProduct({ sku: 'IDEM-2', price: 150_000, stock: 5 });
    const client = await loginCustomer();
    const key = `idem-conflict-${Date.now()}`;
    await createOrderFor(client, 'IDEM-2', 1, { idempotencyKey: key });
    const quote = (await quoteFor(client, 'IDEM-2', 2)).body.quote;
    const response = await client.agent
      .post('/api/v1/orders')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', client.csrf)
      .set('idempotency-key', key)
      .send({ items: [{ sku: 'IDEM-2', quantity: 2 }], address: JKT_ADDRESS, quoteHash: quote.quoteHash });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await Order.countDocuments()).toBe(1);
  });

  it('hanya satu checkout yang mendapat stok terakhir', async () => {
    await createProduct({ sku: 'LAST-1', price: 500_000, stock: 1 });
    const first = await loginCustomer(`last-a-${Date.now()}@example.com`);
    const second = await loginCustomer(`last-b-${Date.now()}@example.com`);
    const firstQuote = (await quoteFor(first, 'LAST-1', 1)).body.quote;
    const secondQuote = (await quoteFor(second, 'LAST-1', 1)).body.quote;
    const orderBody = (quoteHash: string) => ({
      items: [{ sku: 'LAST-1', quantity: 1 }],
      address: JKT_ADDRESS,
      quoteHash,
    });
    const [a, b] = await Promise.all([
      first.agent
        .post('/api/v1/orders')
        .set('origin', 'http://localhost:5173')
        .set('x-csrf-token', first.csrf)
        .set('idempotency-key', `race-a-${Date.now()}`)
        .send(orderBody(firstQuote.quoteHash)),
      second.agent
        .post('/api/v1/orders')
        .set('origin', 'http://localhost:5173')
        .set('x-csrf-token', second.csrf)
        .set('idempotency-key', `race-b-${Date.now()}`)
        .send(orderBody(secondQuote.quoteHash)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = a.status === 409 ? a : b;
    expect(failed.body.error.code).toBe('OUT_OF_STOCK');
    expect(await Order.countDocuments()).toBe(1);
    const inventory = await (await import('../src/models')).Inventory.findOne({ sku: 'LAST-1' });
    expect(inventory!.held).toBe(1);
    expect(inventory!.allocated).toBe(0);
    expect(inventory!.physical).toBe(1);
    expect(await PaymentAttemptCount()).toBe(1);
  });
});

async function PaymentAttemptCount(): Promise<number> {
  const { PaymentAttempt } = await import('../src/models');
  return PaymentAttempt.countDocuments();
}

describe('validasi onboarding katalog', () => {
  it('menyimpan harga integer dan menolak harga negatif pada model', async () => {
    await expect(
      Product.create({
        slug: 'bad-price',
        name: 'Harga Salah',
        category: 'kasur',
        summary: 'x',
        description: 'x',
        images: [{ url: '/x.svg', alt: 'alt' }],
        variants: [{ sku: 'BAD-1', label: 'x', price: -1, shippingClass: 'kasur' }],
      }),
    ).rejects.toThrow();
  });
});
