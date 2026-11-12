import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import request from 'supertest';
import { createApp } from '../src/app';
import { Inventory, Order, PaymentCase } from '../src/models';
import {
  ADMIN_PASSWORD,
  Client,
  attemptForOrder,
  createAdmin,
  createCustomer,
  createOrderFor,
  createProduct,
  resetDb,
  seedZones,
  teardownDb,
  testGateway,
  webhookFor,
} from './helpers';

afterAll(teardownDb);
const app = createApp({ gateway: testGateway });

beforeEach(async () => {
  await resetDb();
  testGateway.transactions.clear();
  testGateway.createCalls.length = 0;
  testGateway.failNextCreate = null;
  await seedZones();
});

async function loginAdmin(
  email: string,
  secret: string,
  role: 'admin_catalog' | 'admin_ops' | 'admin_finance' | 'super_admin',
) {
  const client = new Client(app);
  await client.init();
  const response = await client.login(email, ADMIN_PASSWORD, authenticator.generate(secret));
  expect(response.status).toBe(200);
  expect(response.body.user.role).toBe(role);
  return client;
}

async function paidOrder(sku = 'ADM-1') {
  await createProduct({ sku, price: 600_000, stock: 2 });
  const customer = await createCustomer(`admin-flow-${Date.now()}-${Math.random()}@example.com`);
  const customerClient = new Client(app);
  await customerClient.init();
  await customerClient.login(customer.email, customer.password);
  const { orderResponse } = await createOrderFor(customerClient, sku);
  expect(orderResponse?.status).toBe(201);
  const orderNumber = orderResponse!.body.order.orderNumber as string;
  const { order, attempt } = await attemptForOrder(orderNumber);
  testGateway.setStatus(attempt!.gatewayOrderId, 'settlement', { transactionId: `TX-${sku}` });
  const webhook = await request(app)
    .post('/api/v1/webhooks/midtrans')
    .send(webhookFor(attempt!));
  expect(webhook.status).toBe(200);
  const paid = await Order.findById(order._id);
  expect(paid!.paymentStatus).toBe('paid');
  return { orderNumber, customerClient };
}

describe('pemenuhan pesanan admin', () => {
  it('hanya memproses pesanan lunas, lalu mengurangi stok fisik saat dikirim', async () => {
    const ops = await createAdmin('admin_ops');
    const opsClient = await loginAdmin(ops.email, ops.secret, 'admin_ops');
    const { orderNumber, customerClient } = await paidOrder('ADM-SHIP');

    const ready = await opsClient.post(`/api/v1/admin/orders/${orderNumber}/ready`);
    expect(ready.status).toBe(200);
    const shipped = await opsClient.post(`/api/v1/admin/orders/${orderNumber}/shipped`, {
      courier: 'Kurir Uji',
      trackingNumber: 'RESI-12345',
    });
    expect(shipped.status).toBe(200);

    const order = await Order.findOne({ orderNumber });
    expect(order!.shippingStatus).toBe('shipped');
    expect(order!.tracking?.trackingNumber).toBe('RESI-12345');
    const inventory = await Inventory.findOne({ sku: 'ADM-SHIP' });
    expect(inventory!.physical).toBe(1);
    expect(inventory!.held).toBe(0);
    expect(inventory!.allocated).toBe(0);

    const customerView = await customerClient.get(`/api/v1/orders/${orderNumber}`);
    expect(customerView.body.order.shippingStatus).toBe('shipped');
    expect(customerView.body.order.tracking.trackingNumber).toBe('RESI-12345');

    const delivered = await opsClient.post(`/api/v1/admin/orders/${orderNumber}/delivered`);
    expect(delivered.status).toBe(200);
    const deliveredOrder = await Order.findOne({ orderNumber });
    expect(deliveredOrder!.shippingStatus).toBe('delivered');

    const audit = await opsClient.get('/api/v1/admin/audit');
    expect(audit.status).toBe(403);

    const superAdmin = await createAdmin('super_admin');
    const superClient = await loginAdmin(superAdmin.email, superAdmin.secret, 'super_admin');
    const superAudit = await superClient.get('/api/v1/admin/audit');
    expect(superAudit.status).toBe(200);
    const actions = superAudit.body.items.map((item: { action: string }) => item.action);
    expect(actions).toContain('order.ready');
    expect(actions).toContain('order.shipped');
  });

  it('menolak pengiriman pesanan yang belum lunas dan permintaan tanpa resi', async () => {
    await createProduct({ sku: 'ADM-UNPAID', price: 300_000, stock: 2 });
    const customer = await createCustomer(`unpaid-${Date.now()}@example.com`);
    const client = new Client(app);
    await client.init();
    await client.login(customer.email, customer.password);
    const { orderResponse } = await createOrderFor(client, 'ADM-UNPAID');
    const orderNumber = orderResponse!.body.order.orderNumber as string;

    const ops = await createAdmin('admin_ops');
    const opsClient = await loginAdmin(ops.email, ops.secret, 'admin_ops');
    const ready = await opsClient.post(`/api/v1/admin/orders/${orderNumber}/ready`);
    expect(ready.status).toBe(409);
    expect(ready.body.error.code).toBe('NOT_PAID');

    const { orderNumber: paidNumber } = await paidOrder('ADM-NOTRACK');
    const readyPaid = await opsClient.post(`/api/v1/admin/orders/${paidNumber}/ready`);
    expect(readyPaid.status).toBe(200);
    const noTracking = await opsClient.post(`/api/v1/admin/orders/${paidNumber}/shipped`, {
      courier: 'Kurir Uji',
    });
    expect(noTracking.status).toBe(400);
    const stillReady = await Order.findOne({ orderNumber: paidNumber });
    expect(stillReady!.shippingStatus).toBe('ready');
  });

  it('menahan pengiriman ketika kasus pembayaran membuka hold', async () => {
    const finance = await createAdmin('admin_finance');
    const financeClient = await loginAdmin(finance.email, finance.secret, 'admin_finance');
    const ops = await createAdmin('admin_ops');
    const opsClient = await loginAdmin(ops.email, ops.secret, 'admin_ops');
    const { orderNumber } = await paidOrder('ADM-HOLD');

    const hold = await financeClient.post(`/api/v1/admin/orders/${orderNumber}/hold`, {
      reason: 'Pemeriksaan alamat oleh tim operasional.',
    });
    expect(hold.status).toBe(200);
    const ready = await opsClient.post(`/api/v1/admin/orders/${orderNumber}/ready`);
    expect(ready.status).toBe(409);
    expect(ready.body.error.code).toBe('ON_HOLD');

    const cases = await PaymentCase.find({});
    expect(cases).toHaveLength(0);
  });
});

describe('inventaris admin', () => {
  it('menolak penyesuaian stok fisik di bawah stok yang ditahan', async () => {
    await createProduct({ sku: 'ADM-STOCK', price: 100_000, stock: 2 });
    const customer = await createCustomer(`stock-${Date.now()}@example.com`);
    const client = new Client(app);
    await client.init();
    await client.login(customer.email, customer.password);
    const { orderResponse } = await createOrderFor(client, 'ADM-STOCK');
    expect(orderResponse?.status).toBe(201);

    const catalog = await createAdmin('admin_catalog');
    const catalogClient = await loginAdmin(catalog.email, catalog.secret, 'admin_catalog');
    const response = await catalogClient.post('/api/v1/admin/inventory/ADM-STOCK/adjust', {
      physical: 0,
      reason: 'Koreksi stok gudang',
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('STOCK_BELOW_COMMITMENTS');

    const ok = await catalogClient.post('/api/v1/admin/inventory/ADM-STOCK/adjust', {
      physical: 5,
      reason: 'Koreksi stok gudang',
    });
    expect(ok.status).toBe(200);
    const inventory = await Inventory.findOne({ sku: 'ADM-STOCK' });
    expect(inventory!.physical).toBe(5);
  });

  it('mewajibkan data lengkap sebelum publikasi produk', async () => {
    const catalog = await createAdmin('admin_catalog');
    const catalogClient = await loginAdmin(catalog.email, catalog.secret, 'admin_catalog');
    const create = await catalogClient.post('/api/v1/admin/products', {
      name: 'Produk Tanpa Foto',
      slug: 'produk-tanpa-foto',
      category: 'bantal',
      summary: 'Ringkasan',
      description: 'Deskripsi',
      images: [],
      variants: [
        {
          sku: 'ADM-NOIMG',
          label: 'Standar',
          price: 100_000,
          shippingClass: 'bantal',
          physicalStock: 2,
        },
      ],
      publish: true,
    });
    expect(create.status).toBe(400);
  });
});
