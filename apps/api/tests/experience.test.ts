import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import { createApp } from '../src/app';
import { AuditLog, Inventory, InventoryEntry, Order, SupportTicket } from '../src/models';
import { reportRange } from '../src/modules/experience';
import {
  Client,
  createAdmin,
  createCustomer,
  createOrderFor,
  createProduct,
  resetDb,
  seedZones,
  teardownDb,
  testGateway,
} from './helpers';

const app = createApp({ gateway: testGateway });
afterAll(teardownDb);
beforeEach(async () => {
  await resetDb();
  await seedZones();
  testGateway.transactions.clear();
});
async function customer() {
  const user = await createCustomer();
  const client = new Client(app);
  await client.login(user.email, user.password);
  return client;
}
async function admin(role: 'admin_ops' | 'admin_finance' | 'super_admin' | 'admin_catalog' = 'admin_ops') {
  const user = await createAdmin(role);
  const client = new Client(app);
  expect((await client.login(user.email, user.password, authenticator.generate(user.secret))).status).toBe(
    200,
  );
  return client;
}
async function fixture() {
  await createProduct({ sku: 'OPS-TEST', stock: 5 });
  const client = await customer();
  const result = await createOrderFor(client, 'OPS-TEST');
  expect(result.orderResponse?.status).toBe(201);
  return { client, number: result.orderResponse!.body.order.orderNumber as string };
}
const ticketInput = (orderNumber: string) => ({
  orderNumber,
  subject: 'Jadwal pengiriman',
  kind: 'shipping',
  body: 'Mohon konfirmasi jadwal pengiriman barang.',
});

it('membatasi tiket, dokumen, dan notifikasi ke pemilik pesanan', async () => {
  const { client, number } = await fixture();
  const stranger = await customer();
  const created = await client.post('/api/v1/experience/tickets', ticketInput(number));
  expect(created.status).toBe(201);
  expect((await stranger.post('/api/v1/experience/tickets', ticketInput(number))).status).toBe(404);
  expect((await stranger.get(`/api/v1/experience/orders/${number}/document`)).status).toBe(404);
  expect((await stranger.get('/api/v1/experience/tickets')).body.total).toBe(0);
  expect((await stranger.get('/api/v1/experience/inbox')).body.items).toHaveLength(0);
  expect(
    (
      await stranger.post(`/api/v1/experience/tickets/${created.body.ticket._id}/replies`, {
        revision: 0,
        body: 'Balasan tidak sah.',
      })
    ).status,
  ).toBe(409);
  expect((await client.get('/api/v1/experience/admin/queue')).status).toBe(403);
});
it('mencatat balasan staf, penanggung jawab, audit, konflik revisi, dan notifikasi', async () => {
  const { client, number } = await fixture();
  const ops = await admin();
  const ticket = (await client.post('/api/v1/experience/tickets', ticketInput(number))).body.ticket;
  const update = {
    body: 'Barang akan dikirim besok pagi.',
    revision: 0,
    status: 'in_progress',
    priority: 'high',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  };
  expect((await ops.patch(`/api/v1/experience/admin/tickets/${ticket._id}`, update)).status).toBe(200);
  expect((await ops.patch(`/api/v1/experience/admin/tickets/${ticket._id}`, update)).status).toBe(409);
  const stored = await SupportTicket.findById(ticket._id);
  expect(stored?.ownerId).toBeTruthy();
  expect(stored?.messages).toHaveLength(2);
  expect(await AuditLog.countDocuments({ action: 'support.update' })).toBe(1);
  const inbox = (await client.get('/api/v1/experience/inbox')).body;
  expect(inbox.items.some((item: { title: string }) => item.title.includes(ticket.number))).toBe(true);
  await client.post('/api/v1/experience/inbox/read', { through: inbox.readThrough });
  expect((await client.get('/api/v1/experience/inbox')).body.unread).toBe(0);
  await client.post('/api/v1/experience/inbox/read', { through: '2000-01-01T00:00:00.000Z' });
  expect((await client.get('/api/v1/experience/inbox')).body.unread).toBe(0);
});
it('memisahkan persetujuan refund dari pengembalian dana yang terverifikasi', async () => {
  const { client, number } = await fixture();
  const ops = await admin();
  const finance = await admin('admin_finance');
  expect(
    (await client.post('/api/v1/experience/tickets', { ...ticketInput(number), kind: 'refund' })).status,
  ).toBe(409);
  await Order.updateOne({ orderNumber: number }, { $set: { paidAt: new Date(), paymentStatus: 'paid' } });
  const ticket = (await client.post('/api/v1/experience/tickets', { ...ticketInput(number), kind: 'refund' }))
    .body.ticket;
  const update = {
    revision: 0,
    status: 'approved',
    priority: 'normal',
    body: 'Pengajuan disetujui dan menunggu pengembalian dana.',
    dueAt: new Date().toISOString(),
  };
  expect((await ops.patch(`/api/v1/experience/admin/tickets/${ticket._id}`, update)).status).toBe(403);
  expect((await finance.patch(`/api/v1/experience/admin/tickets/${ticket._id}`, update)).status).toBe(200);
  expect((await Order.findOne({ orderNumber: number }))?.paymentStatus).toBe('paid');
  expect(
    (
      await finance.patch(`/api/v1/experience/admin/tickets/${ticket._id}`, {
        ...update,
        revision: 1,
        status: 'resolved',
      })
    ).status,
  ).toBe(409);
  await Order.updateOne({ orderNumber: number }, { $set: { paymentStatus: 'refunded' } });
  expect(
    (
      await finance.patch(`/api/v1/experience/admin/tickets/${ticket._id}`, {
        ...update,
        revision: 1,
        status: 'resolved',
      })
    ).status,
  ).toBe(200);
});
it('menerima stok secara atomik dan idempoten serta menolak kelebihan penerimaan', async () => {
  await createProduct({ sku: 'RESTOCK-1', stock: 3 });
  const ops = await admin();
  expect(
    (
      await ops.patch('/api/v1/experience/admin/restock/RESTOCK-1', {
        revision: 0,
        reorderPoint: 4,
        targetStock: 15,
        incoming: 6,
        expectedAt: null,
      })
    ).status,
  ).toBe(200);
  const receipt = { quantity: 2, reason: 'Surat jalan SJ-123', key: randomUUID() };
  const results = await Promise.all([
    ops.post('/api/v1/experience/admin/restock/RESTOCK-1/receive', receipt),
    ops.post('/api/v1/experience/admin/restock/RESTOCK-1/receive', receipt),
  ]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  const inventory = await Inventory.findOne({ sku: 'RESTOCK-1' });
  expect(inventory?.physical).toBe(5);
  expect(inventory?.incoming).toBe(4);
  expect(
    (
      await ops.patch('/api/v1/experience/admin/restock/RESTOCK-1', {
        revision: 1,
        reorderPoint: 4,
        targetStock: 15,
        incoming: 6,
        expectedAt: null,
      })
    ).status,
  ).toBe(409);
  expect(await InventoryEntry.countDocuments({ sku: 'RESTOCK-1' })).toBe(1);
  expect(
    (await ops.post('/api/v1/experience/admin/restock/RESTOCK-1/receive', { ...receipt, quantity: 3 }))
      .status,
  ).toBe(409);
  expect(
    (
      await ops.post('/api/v1/experience/admin/restock/RESTOCK-1/receive', {
        ...receipt,
        key: randomUUID(),
        quantity: 5,
      })
    ).status,
  ).toBe(409);
});
it('memvalidasi checklist, tautan, peran, dan revisi persiapan pengiriman', async () => {
  const { client, number } = await fixture();
  const ops = await admin();
  const finance = await admin('admin_finance');
  const endpoint = `/api/v1/experience/admin/orders/${number}/operations`;
  const input = {
    revision: 0,
    ownerId: null,
    shipBy: null,
    expectedDelivery: null,
    customerUpdate: 'Pesanan sedang dikemas untuk pengiriman.',
    trackingUrl: '',
    picked: true,
    packed: true,
    inspected: true,
  };
  expect((await finance.patch(endpoint, input)).status).toBe(403);
  expect((await ops.patch(endpoint, { ...input, trackingUrl: 'javascript:alert(1)' })).status).toBe(400);
  expect((await ops.patch(endpoint, { ...input, picked: false })).status).toBe(400);
  expect((await ops.patch(endpoint, input)).status).toBe(200);
  expect((await ops.patch(endpoint, input)).status).toBe(409);
  const detail = (await client.get(`/api/v1/orders/${number}`)).body.order;
  expect(detail.customerUpdate).toBe(input.customerUpdate);
  expect(detail.trackingUrl).toBeNull();
  expect((await ops.patch(endpoint, { ...input, revision: 1, trackingUrl: 'https://example.com/track' })).status).toBe(200);
  expect((await client.get(`/api/v1/orders/${number}`)).body.order.trackingUrl).toBe('https://example.com/track');
  expect(
    (await client.get('/api/v1/experience/inbox')).body.items.some(
      (i: { body: string }) => i.body === input.customerUpdate,
    ),
  ).toBe(true);
});
it('menghitung hari WIB, mengecualikan hold, dan menolak tanggal tidak valid', async () => {
  const { number } = await fixture();
  const ops = await admin();
  const { start } = reportRange();
  await Order.updateOne(
    { orderNumber: number },
    {
      $set: {
        paymentStatus: 'paid',
        paidAt: new Date(start.getTime() - 1),
        shippingStatus: 'ready',
        'shippingHold.active': true,
      },
    },
  );
  let summary = (await ops.get('/api/v1/admin/summary')).body;
  expect(summary.paid).toBe(0);
  expect(summary.ready).toBe(0);
  await Order.updateOne({ orderNumber: number }, { $set: { paidAt: start, 'shippingHold.active': false } });
  summary = (await ops.get('/api/v1/admin/summary')).body;
  expect(summary.paid).toBe(1);
  expect(summary.ready).toBe(1);
  const report = (await ops.get('/api/v1/experience/admin/report')).body;
  expect(report.paidOrders).toBe(1);
  expect(report.top[0]._id).toBe('OPS-TEST');
  expect((await ops.get('/api/v1/experience/admin/report?from=2026-02-31')).status).toBe(400);
  expect(reportRange('2026-11-13', '2026-11-13').start.toISOString()).toBe('2026-11-12T17:00:00.000Z');
});
it('menghasilkan dokumen harga snapshot dengan escape HTML', async () => {
  const { client, number } = await fixture();
  await Order.updateOne(
    { orderNumber: number },
    { $set: { 'address.recipient': '<script>alert(1)</script>' } },
  );
  const document = await client.get(`/api/v1/experience/orders/${number}/document`);
  expect(document.status).toBe(200);
  expect(document.headers['cache-control']).toBe('no-store');
  expect(document.text).toContain('&lt;script&gt;');
  expect(document.text).not.toContain('<script>');
  expect(document.text).toContain('OPS-TEST');
  expect(document.text).toContain('Menunggu pembayaran');
});
