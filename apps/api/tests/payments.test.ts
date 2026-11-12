import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Inventory, Order, PaymentAttempt, PaymentCase } from '../src/models';
import { reconcileOnce } from '../src/modules/payments';
import {
  Client,
  attemptForOrder,
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

async function placeOrder(sku = 'PAY-1', price = 750_000, stock = 3) {
  await createProduct({ sku, price, stock });
  const customer = await createCustomer(`pay-${Date.now()}-${Math.random()}@example.com`);
  const client = new Client(app);
  await client.init();
  await client.login(customer.email, customer.password);
  const { orderResponse } = await createOrderFor(client, sku);
  expect(orderResponse?.status).toBe(201);
  const orderNumber = orderResponse!.body.order.orderNumber as string;
  const { order, attempt } = await attemptForOrder(orderNumber);
  expect(attempt).toBeTruthy();
  return { client, order, attempt: attempt!, orderNumber };
}

async function postWebhook(payload: Record<string, unknown>) {
  return request(app).post('/api/v1/webhooks/midtrans').send(payload);
}

describe('webhook Midtrans', () => {
  it('menolak signature palsu tanpa mengubah pesanan', async () => {
    const { order } = await placeOrder();
    const attempt = await PaymentAttempt.findOne({ orderId: order._id });
    const response = await postWebhook(
      webhookFor(attempt!, { signatureKey: 'a'.repeat(128) }),
    );
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    const fresh = await Order.findById(order._id);
    expect(fresh!.paymentStatus).toBe('pending');
  });

  it('mengabaikan status body dan memakai GET Status gateway yang terverifikasi', async () => {
    const { order } = await placeOrder();
    const attempt = await PaymentAttempt.findOne({ orderId: order._id });
    const response = await postWebhook(webhookFor(attempt!, { status: 'settlement' }));
    expect([200, 202]).toContain(response.status);
    const fresh = await Order.findById(order._id);
    expect(fresh!.paymentStatus).toBe('pending');
    const inventory = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventory!.held).toBe(1);
    expect(inventory!.allocated).toBe(0);
  });

  it('menandai peninjauan bila nominal gateway tidak cocok, tanpa alokasi stok', async () => {
    const { order, attempt } = await placeOrder();
    testGateway.setStatus(attempt.gatewayOrderId, 'settlement', {
      grossAmount: attempt.amount - 1,
    });
    const response = await postWebhook(webhookFor(attempt));
    expect(response.status).toBe(200);
    const fresh = await Order.findById(order._id);
    expect(fresh!.paymentStatus).toBe('review');
    expect(fresh!.shippingHold?.active).toBe(true);
    const inventory = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventory!.held).toBe(1);
    expect(inventory!.allocated).toBe(0);
    const cases = await PaymentCase.find({ orderId: order._id });
    expect(cases).toHaveLength(1);
    expect(cases[0]!.type).toBe('amount_mismatch');
  });

  it('memfinalisasi tepat sekali untuk webhook duplikat dan tidak menurunkan status oleh event lama', async () => {
    const { order, attempt } = await placeOrder();
    testGateway.setStatus(attempt.gatewayOrderId, 'settlement', {
      transactionId: 'TX-SETTLE-1',
    });
    const payload = webhookFor(attempt);
    const first = await postWebhook(payload);
    expect(first.status).toBe(200);
    const second = await postWebhook(payload);
    expect(second.status).toBe(200);

    const afterPaid = await Order.findById(order._id);
    expect(afterPaid!.paymentStatus).toBe('paid');
    const inventory = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventory!.held).toBe(0);
    expect(inventory!.allocated).toBe(1);
    const paidAttempt = await PaymentAttempt.findOne({ orderId: order._id });
    expect(paidAttempt!.status).toBe('paid');
    expect(paidAttempt!.open).toBe(false);
    const paidTransitions = afterPaid!.statusHistory.filter(
      (entry) => entry.type === 'payment' && entry.to === 'paid',
    );
    expect(paidTransitions).toHaveLength(1);

    testGateway.setStatus(attempt.gatewayOrderId, 'pending');
    const latePending = await postWebhook(
      webhookFor(attempt, { status: 'pending', statusCode: '201' }),
    );
    expect([200, 202]).toContain(latePending.status);
    const stillPaid = await Order.findById(order._id);
    expect(stillPaid!.paymentStatus).toBe('paid');
    const stillPaidAttempt = await PaymentAttempt.findOne({ orderId: order._id });
    expect(stillPaidAttempt!.status).toBe('paid');
    const inventoryAfter = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventoryAfter!.held).toBe(0);
    expect(inventoryAfter!.allocated).toBe(1);
  });

  it('menandai review untuk capture kartu dengan fraud challenge', async () => {
    const { order, attempt } = await placeOrder();
    testGateway.setStatus(attempt.gatewayOrderId, 'capture', {
      fraudStatus: 'challenge',
      paymentType: 'credit_card',
    });
    const response = await postWebhook(webhookFor(attempt, { status: 'capture' }));
    expect(response.status).toBe(200);
    const fresh = await Order.findById(order._id);
    expect(fresh!.paymentStatus).toBe('review');
    expect(fresh!.shippingHold?.active).toBe(true);
  });

  it('mencatat refund dari gateway tanpa mengembalikan stok otomatis', async () => {
    const { order, attempt } = await placeOrder();
    testGateway.setStatus(attempt.gatewayOrderId, 'settlement');
    const settled = await postWebhook(webhookFor(attempt));
    expect(settled.status).toBe(200);
    const paid = await Order.findById(order._id);
    expect(paid!.paymentStatus).toBe('paid');

    testGateway.setStatus(attempt.gatewayOrderId, 'refund');
    const refunded = await postWebhook(webhookFor(attempt, { status: 'refund' }));
    expect(refunded.status).toBe(200);
    const fresh = await Order.findById(order._id);
    expect(fresh!.paymentStatus).toBe('refunded');
    expect(fresh!.shippingHold?.active).toBe(true);
    const inventory = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventory!.allocated).toBe(1);
    expect(inventory!.physical).toBe(3);
    const refundCase = await PaymentCase.findOne({ orderId: order._id, type: 'refund' });
    expect(refundCase).toBeTruthy();
  });
});

describe('timeout dan rekonsiliasi', () => {
  it('menahan percobaan baru saat membuat Snap timeout lalu memulihkan lewat rekonsiliasi', async () => {
    await createProduct({ sku: 'PAY-TIMEOUT', price: 400_000, stock: 2 });
    const customer = await createCustomer(`timeout-${Date.now()}@example.com`);
    const client = new Client(app);
    await client.init();
    await client.login(customer.email, customer.password);
    testGateway.failNextCreate = 'timeout';
    const { orderResponse } = await createOrderFor(client, 'PAY-TIMEOUT');
    expect(orderResponse?.status).toBe(201);
    expect(orderResponse?.body.payment.uncertain).toBe(true);
    const orderNumber = orderResponse!.body.order.orderNumber as string;
    const firstAttempt = await PaymentAttempt.findOne({}).sort({ createdAt: -1 });
    expect(firstAttempt!.status).toBe('uncertain');
    expect(firstAttempt!.open).toBe(true);
    expect(await PaymentAttempt.countDocuments({})).toBe(1);
    const order = await Order.findOne({ orderNumber });
    expect(order!.paymentStatus).toBe('verifying');

    const retry = await client.post(`/api/v1/orders/${orderNumber}/payment`);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe('PAYMENT_UNCERTAIN');
    expect(await PaymentAttempt.countDocuments({})).toBe(1);

    testGateway.transactions.set(firstAttempt!.gatewayOrderId, {
      gatewayOrderId: firstAttempt!.gatewayOrderId,
      transactionId: 'TX-RECOVERED',
      status: 'settlement',
      grossAmount: firstAttempt!.amount,
      rawStatus: 'settlement',
      statusCode: '200',
      paymentType: 'qris',
      fraudStatus: 'accept',
    });
    const result = await reconcileOnce();
    expect(result.attempts).toBeGreaterThanOrEqual(1);
    const paid = await Order.findOne({ orderNumber });
    expect(paid!.paymentStatus).toBe('paid');
    expect(await PaymentAttempt.countDocuments({})).toBe(1);
  });

  it('melepas reservasi setelah gateway menutup pembayaran, lalu menahan pembayaran terlambat', async () => {
    const { order, attempt } = await placeOrder();
    testGateway.setStatus(attempt.gatewayOrderId, 'expire');
    await reconcileOnce();
    const expired = await Order.findById(order._id);
    expect(expired!.paymentStatus).toBe('expired');
    expect(expired!.reservation.status).toBe('released');
    const releasedInventory = await Inventory.findOne({ sku: 'PAY-1' });
    expect(releasedInventory!.held).toBe(0);
    expect(releasedInventory!.allocated).toBe(0);

    testGateway.setStatus(attempt.gatewayOrderId, 'settlement');
    const late = await postWebhook(webhookFor(attempt));
    expect(late.status).toBe(200);
    const reviewed = await Order.findById(order._id);
    expect(reviewed!.paymentStatus).toBe('review');
    expect(reviewed!.shippingHold?.active).toBe(true);
    expect(reviewed!.shippingStatus).toBe('pending');
    const inventoryAfter = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventoryAfter!.held).toBe(0);
    expect(inventoryAfter!.allocated).toBe(0);
    const lateCase = await PaymentCase.findOne({ orderId: order._id, type: 'late_payment' });
    expect(lateCase).toBeTruthy();
    const verifiedAttempt = await PaymentAttempt.findOne({ orderId: order._id });
    expect(verifiedAttempt!.status).toBe('paid');
  });

  it('melepas reservasi pesanan menggantung yang tidak memiliki percobaan pembayaran', async () => {
    const { order } = await placeOrder();
    await PaymentAttempt.deleteMany({ orderId: order._id });
    await Order.updateOne(
      { _id: order._id },
      { $set: { 'reservation.expiresAt': new Date(Date.now() - 60_000) } },
    );
    const result = await reconcileOnce();
    expect(result.orders).toBeGreaterThanOrEqual(1);
    const fresh = await Order.findById(order._id);
    expect(fresh!.paymentStatus).toBe('expired');
    expect(fresh!.reservation.status).toBe('released');
    const inventory = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventory!.held).toBe(0);
    expect(inventory!.allocated).toBe(0);
    expect(inventory!.physical).toBe(3);
  });

  it('tidak melepas stok ketika hanya halaman Snap yang kedaluwarsa', async () => {
    const { order, attempt } = await placeOrder();
    testGateway.transactions.delete(attempt.gatewayOrderId);
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3_600_000);
    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      { $set: { sessionExpiresAt: past, methodWindowEndsAt: future } },
    );
    await reconcileOnce();
    const fresh = await Order.findById(order._id);
    expect(fresh!.paymentStatus).toBe('pending');
    expect(fresh!.reservation.status).toBe('held');
    const inventory = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventory!.held).toBe(1);
    expect(inventory!.allocated).toBe(0);
  });

  it('tidak melepas stok ketika 404 terjadi setelah halaman Snap ditinggalkan tetapi ada tautan', async () => {
    const { order, attempt } = await placeOrder();
    testGateway.transactions.delete(attempt.gatewayOrderId);
    const past = new Date(Date.now() - 60_000);
    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      { $set: { sessionExpiresAt: past, methodWindowEndsAt: past } },
    );
    await reconcileOnce();
    const fresh = await Order.findById(order._id);
    expect(fresh!.paymentStatus).toBe('review');
    expect(fresh!.shippingHold?.active).toBe(true);
    expect(fresh!.reservation.status).toBe('held');
    const inventory = await Inventory.findOne({ sku: 'PAY-1' });
    expect(inventory!.held).toBe(1);
    expect(inventory!.allocated).toBe(0);
  });
});
